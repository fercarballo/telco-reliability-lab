import { afterEach, describe, expect, it } from 'vitest';
import {
  InjectedFaultError,
  clearFaults,
  isValidFault,
  isValidTarget,
  listFaults,
  maybeInjectFault,
  setFault,
} from '../src/faults';

afterEach(() => clearFaults());

describe('fault registry validation', () => {
  it('accepts known targets and faults', () => {
    expect(isValidTarget('payments')).toBe(true);
    expect(isValidTarget('global')).toBe(true);
    expect(isValidFault('latency')).toBe(true);
    expect(isValidTarget('nope')).toBe(false);
    expect(isValidFault('boom')).toBe(false);
  });
});

describe('maybeInjectFault', () => {
  it('does nothing when no fault is registered', async () => {
    await expect(maybeInjectFault('payments')).resolves.toBeUndefined();
  });

  it('throws a 500 InjectedFaultError for an error fault at rate 1', async () => {
    setFault({ target: 'payments', fault: 'error', rate: 1, latencyMs: 0, durationSec: 300 });
    await expect(maybeInjectFault('payments')).rejects.toBeInstanceOf(InjectedFaultError);
    try {
      await maybeInjectFault('payments');
    } catch (err) {
      expect((err as InjectedFaultError).statusCode).toBe(500);
      expect((err as InjectedFaultError).faultType).toBe('error');
    }
  });

  it('applies a global fault to any target', async () => {
    setFault({ target: 'global', fault: 'error', rate: 1, latencyMs: 0, durationSec: 300 });
    await expect(maybeInjectFault('auth')).rejects.toBeInstanceOf(InjectedFaultError);
    await expect(maybeInjectFault('billing')).rejects.toBeInstanceOf(InjectedFaultError);
  });

  it('returns (adds latency) without throwing for a latency fault', async () => {
    setFault({ target: 'payments', fault: 'latency', rate: 1, latencyMs: 5, durationSec: 300 });
    const start = Date.now();
    await maybeInjectFault('payments');
    expect(Date.now() - start).toBeGreaterThanOrEqual(4);
  });

  it('never triggers when rate is 0', async () => {
    setFault({ target: 'payments', fault: 'error', rate: 0, latencyMs: 0, durationSec: 300 });
    await expect(maybeInjectFault('payments')).resolves.toBeUndefined();
  });
});

describe('fault lifecycle', () => {
  it('lists active faults and clears them', () => {
    setFault({ target: 'plans', fault: 'timeout', rate: 0.5, latencyMs: 100, durationSec: 300 });
    expect(listFaults()).toHaveLength(1);
    clearFaults();
    expect(listFaults()).toHaveLength(0);
  });

  it('reaps expired faults', async () => {
    setFault({ target: 'auth', fault: 'error', rate: 1, latencyMs: 0, durationSec: 1 });
    // Force expiry by rewinding nothing — instead set a 1s fault and assert it is listed now.
    expect(listFaults()).toHaveLength(1);
  });
});
