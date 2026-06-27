// Load profile — expected traffic on main. SLO thresholds gate the run.
import { fullJourney } from '../helpers/journeys.js';
import { profiles } from '../profiles/profiles.js';
import { sloThresholds } from '../thresholds/thresholds.js';
import { summaryTrendStats } from '../helpers/config.js';

export const options = {
  scenarios: { load: { ...profiles.load, exec: 'journey' } },
  thresholds: sloThresholds,
  summaryTrendStats,
};

export function journey() {
  fullJourney();
}
