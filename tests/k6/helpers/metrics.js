import { Trend, Rate, Counter } from 'k6/metrics';

// Custom per-journey metrics. Durations are in milliseconds (isTime=true) so they
// read naturally alongside the SLO targets (e.g. login p95 < 600ms).

export const loginDuration = new Trend('login_duration', true);
export const loginSuccessRate = new Rate('login_success_rate');

export const invoiceLookupDuration = new Trend('invoice_lookup_duration', true);
export const invoiceLookupSuccessRate = new Rate('invoice_lookup_success_rate');

export const planChangeDuration = new Trend('plan_change_duration', true);
export const planChangeSuccessRate = new Rate('plan_change_success_rate');

export const paymentDuration = new Trend('payment_duration', true);
export const paymentSuccessRate = new Rate('payment_success_rate');

// Counts how often a replayed Idempotency-Key correctly returned the original payment.
export const paymentIdempotencyConflicts = new Counter('payment_idempotency_conflicts');
