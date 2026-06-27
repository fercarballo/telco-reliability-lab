// Degradation profile — steady load while a fault is injected, so you can watch
// p95/error-rate climb in Grafana and chase the cause through Tempo -> Loki.
//
// Self-contained: setup() injects a 2s latency fault on payments (30% of
// requests), teardown() clears it. Diagnostic thresholds (non-gating) — the
// point is to *observe* the degradation, not to pass/fail.
//
//   docker compose run --rm k6 run /scripts/scenarios/degradation.js
import http from 'k6/http';
import { fullJourney } from '../helpers/journeys.js';
import { profiles } from '../profiles/profiles.js';
import { diagnosticThresholds } from '../thresholds/thresholds.js';
import { summaryTrendStats, BASE_URL } from '../helpers/config.js';

export const options = {
  scenarios: { degradation: { ...profiles.degradation, exec: 'journey' } },
  thresholds: diagnosticThresholds,
  summaryTrendStats,
};

export function setup() {
  const res = http.post(
    `${BASE_URL}/admin/faults`,
    JSON.stringify({ target: 'payments', fault: 'latency', rate: 0.3, latencyMs: 2000, durationSec: 600 }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  console.log(`fault injection setup -> HTTP ${res.status}`);
}

export function journey() {
  fullJourney();
}

export function teardown() {
  const res = http.del(`${BASE_URL}/admin/faults`);
  console.log(`fault injection teardown -> HTTP ${res.status}`);
}
