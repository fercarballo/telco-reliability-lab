import { setTimeout as sleep } from 'node:timers/promises';
import { faultsActive } from './metrics';

/**
 * Controlled fault injection.
 *
 * A small in-memory registry keyed by `target` (auth | billing | plans |
 * payments | global). Each handler calls `maybeInjectFault(target)` at the top;
 * the helper decides — based on the configured probability — whether to add
 * latency, throw a 5xx, or simulate a timeout. Faults auto-expire after
 * `durationSec`.
 *
 * This is the mechanism behind the `degradation` k6 profile and the
 * "metric -> trace -> log" investigation demo.
 */

export type FaultTarget = 'auth' | 'billing' | 'plans' | 'payments' | 'global';
export type FaultType = 'latency' | 'error' | 'timeout';

export interface FaultSpec {
  target: FaultTarget;
  fault: FaultType;
  rate: number; // 0..1 share of affected requests
  latencyMs: number;
  durationSec: number;
  expiresAt: number; // epoch ms
}

export class InjectedFaultError extends Error {
  public readonly statusCode: number;
  public readonly faultType: FaultType;
  constructor(faultType: FaultType, message: string, statusCode: number) {
    super(message);
    this.name = 'InjectedFaultError';
    this.faultType = faultType;
    this.statusCode = statusCode;
  }
}

const VALID_TARGETS: FaultTarget[] = ['auth', 'billing', 'plans', 'payments', 'global'];
const VALID_FAULTS: FaultType[] = ['latency', 'error', 'timeout'];

const registry = new Map<FaultTarget, FaultSpec>();

export function isValidTarget(t: string): t is FaultTarget {
  return (VALID_TARGETS as string[]).includes(t);
}
export function isValidFault(f: string): f is FaultType {
  return (VALID_FAULTS as string[]).includes(f);
}

export function setFault(spec: Omit<FaultSpec, 'expiresAt'>): FaultSpec {
  const stored: FaultSpec = { ...spec, expiresAt: Date.now() + spec.durationSec * 1000 };
  registry.set(spec.target, stored);
  faultsActive.set({ target: spec.target, fault: spec.fault }, 1);
  return stored;
}

export function clearFaults(): void {
  for (const spec of registry.values()) {
    faultsActive.set({ target: spec.target, fault: spec.fault }, 0);
  }
  registry.clear();
}

export function listFaults(): FaultSpec[] {
  reap();
  return [...registry.values()];
}

function reap(): void {
  const now = Date.now();
  for (const [target, spec] of registry) {
    if (spec.expiresAt <= now) {
      faultsActive.set({ target: spec.target, fault: spec.fault }, 0);
      registry.delete(target);
    }
  }
}

function resolveActive(target: FaultTarget): FaultSpec | undefined {
  reap();
  return registry.get(target) ?? registry.get('global');
}

/**
 * Called at the start of an instrumented handler. Throws `InjectedFaultError`
 * for error/timeout faults; resolves after the injected delay for latency.
 */
export async function maybeInjectFault(target: FaultTarget): Promise<void> {
  const spec = resolveActive(target);
  if (!spec) return;
  if (Math.random() > spec.rate) return;

  switch (spec.fault) {
    case 'latency':
      await sleep(spec.latencyMs);
      return;
    case 'timeout':
      // Hang long enough to blow client/server timeouts, then fail.
      await sleep(Math.max(spec.latencyMs, 5000));
      throw new InjectedFaultError('timeout', `Injected timeout on ${target}`, 504);
    case 'error':
      throw new InjectedFaultError('error', `Injected error on ${target}`, 500);
  }
}
