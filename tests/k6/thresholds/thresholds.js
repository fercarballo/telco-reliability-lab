// SLO-derived thresholds. See docs/slo-definition.md for the rationale behind
// each number (these are the *defendable* targets, not arbitrary round numbers).

// Gating thresholds — used by smoke and load. A breach fails the k6 process,
// which is what makes the CI quality gate meaningful.
export const sloThresholds = {
  http_req_failed: ['rate<0.01'], // < 1% transport/HTTP errors
  checks: ['rate>0.99'], // > 99% functional checks pass
  http_req_duration: ['p(95)<1200'], // global p95 budget

  'http_req_duration{journey:login}': ['p(95)<600'],
  'http_req_duration{journey:invoice_lookup}': ['p(95)<800'],
  'http_req_duration{journey:plan_change}': ['p(95)<1200'],
  'http_req_duration{journey:payment}': ['p(95)<1500'],
};

// Diagnostic thresholds — used by stress / spike / soak / degradation. These
// runs *explore limits*, so we record generous bounds (the run should not fail
// the pipeline merely for finding the saturation point). Treated as
// non-blocking in CI.
export const diagnosticThresholds = {
  http_req_failed: ['rate<0.50'],
  checks: ['rate>0.50'],
  http_req_duration: ['p(95)<5000'],
};
