// Soak profile — sustained load to surface leaks / slow degradation over time.
import { fullJourney } from '../helpers/journeys.js';
import { profiles } from '../profiles/profiles.js';
import { diagnosticThresholds } from '../thresholds/thresholds.js';
import { summaryTrendStats } from '../helpers/config.js';

export const options = {
  scenarios: { soak: { ...profiles.soak, exec: 'journey' } },
  thresholds: diagnosticThresholds,
  summaryTrendStats,
};

export function journey() {
  fullJourney();
}
