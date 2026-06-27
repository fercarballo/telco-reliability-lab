import client from 'prom-client';
import { config } from './config';

/**
 * Prometheus metrics registry.
 *
 * We expose the RED method (Rate / Errors / Duration) for HTTP plus a handful of
 * business counters. Route labels use the *templated* path (e.g.
 * `/customers/:customerId/invoices`) to keep cardinality bounded — never the raw
 * URL with ids in it.
 */
export const registry = new client.Registry();

registry.setDefaultLabels({
  service: config.serviceName,
  version: config.serviceVersion,
  env: config.deploymentEnvironment,
});

// Node process / GC / event-loop metrics — cheap signal for saturation.
client.collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['route', 'method', 'status'] as const,
  registers: [registry],
});

export const httpRequestErrorsTotal = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP responses with a 4xx/5xx status',
  labelNames: ['route', 'method', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method', 'status'] as const,
  // Buckets tuned around our SLO targets (login 600ms ... payment 1500ms).
  buckets: [0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 3, 5],
  registers: [registry],
});

export const businessLoginsTotal = new client.Counter({
  name: 'business_logins_total',
  help: 'Login attempts by outcome',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const businessPlanChangesTotal = new client.Counter({
  name: 'business_plan_changes_total',
  help: 'Plan change requests by outcome',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const businessPaymentsTotal = new client.Counter({
  name: 'business_payments_total',
  help: 'Payment attempts by outcome',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const paymentIdempotencyConflicts = new client.Counter({
  name: 'business_payment_idempotency_conflicts_total',
  help: 'Number of payment requests served from an existing idempotency key',
  registers: [registry],
});

export const faultsActive = new client.Gauge({
  name: 'fault_injection_active',
  help: 'Whether a fault is currently active (1) for a given target/type',
  labelNames: ['target', 'fault'] as const,
  registers: [registry],
});
