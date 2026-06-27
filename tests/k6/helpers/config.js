// Shared runtime configuration for all k6 scripts.
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Standard trend stats so every report shows the percentiles our SLOs care about.
export const summaryTrendStats = ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Journey tag values must match the keys used in k6 threshold expressions
// (e.g. `http_req_duration{journey:payment}`). Centralised here to prevent
// silent mismatches between tagging and threshold config.
export const JOURNEY = /** @type {const} */ ({
  LOGIN:          'login',
  INVOICE_LOOKUP: 'invoice_lookup',
  PLAN_CHANGE:    'plan_change',
  PAYMENT:        'payment',
});
