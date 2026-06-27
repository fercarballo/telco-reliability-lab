// Smoke-breach scenario — intentional SLO failure demo.
//
// Purpose: demonstrate what a broken pipeline looks like. Run with:
//
//   make smoke-breach
//
// The Makefile target injects a 3 s latency fault on payments (rate=1.0) BEFORE
// starting this script, so the payment p95 SLO (< 1500 ms) will be breached and
// k6 exits non-zero — exactly what would block a PR in the real gate.
//
// This is portfolio evidence of a FAILING quality gate, not a bug.
// See docs/runbook.md for the investigation workflow from this point.
import { fullJourney } from '../helpers/journeys.js';
import { profiles } from '../profiles/profiles.js';
import { sloThresholds } from '../thresholds/thresholds.js';
import { summaryTrendStats } from '../helpers/config.js';
import { resetInvoices } from '../helpers/setup.js';

export const options = {
  scenarios: { smoke: { ...profiles.smoke, exec: 'journey' } },
  // Same SLO thresholds as the real gate — any breach exits non-zero.
  thresholds: sloThresholds,
  summaryTrendStats,
};

export function setup() {
  resetInvoices();
}

export function journey() {
  fullJourney();
}
