// Spike profile — sudden burst then recovery. Diagnostic thresholds (non-gating).
import { fullJourney } from '../helpers/journeys.js';
import { profiles } from '../profiles/profiles.js';
import { diagnosticThresholds } from '../thresholds/thresholds.js';
import { summaryTrendStats } from '../helpers/config.js';

export const options = {
  scenarios: { spike: { ...profiles.spike, exec: 'journey' } },
  thresholds: diagnosticThresholds,
  summaryTrendStats,
};

export function journey() {
  fullJourney();
}
