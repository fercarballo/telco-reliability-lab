// Stress profile — find the saturation point. Diagnostic thresholds (non-gating in CI):
// this run is *supposed* to push the system until something gives.
import { fullJourney } from '../helpers/journeys.js';
import { profiles } from '../profiles/profiles.js';
import { diagnosticThresholds } from '../thresholds/thresholds.js';
import { summaryTrendStats } from '../helpers/config.js';
import { resetInvoices } from '../helpers/setup.js';

export const options = {
  scenarios: { stress: { ...profiles.stress, exec: 'journey' } },
  thresholds: diagnosticThresholds,
  summaryTrendStats,
};

export function setup() {
  resetInvoices();
}

export function journey() {
  fullJourney();
}
