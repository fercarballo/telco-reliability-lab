// Smoke profile — every PR. Short, low load, SLO thresholds gate the build.
import { fullJourney } from '../helpers/journeys.js';
import { profiles } from '../profiles/profiles.js';
import { sloThresholds } from '../thresholds/thresholds.js';
import { summaryTrendStats } from '../helpers/config.js';
import { resetInvoices } from '../helpers/setup.js';

export const options = {
  scenarios: { smoke: { ...profiles.smoke, exec: 'journey' } },
  thresholds: sloThresholds,
  summaryTrendStats,
};

export function setup() {
  resetInvoices();
}

export function journey() {
  fullJourney();
}
