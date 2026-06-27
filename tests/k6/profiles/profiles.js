// Reusable k6 executor configurations, one per performance profile.
// Scenario scripts spread these and attach `exec: 'journey'`.

export const profiles = {
  // Smoke: does the system work at all? Runs on every PR.
  smoke: {
    executor: 'constant-vus',
    vus: 3,
    duration: '1m',
  },

  // Load: expected traffic. Validates SLOs under normal conditions.
  load: {
    executor: 'ramping-arrival-rate',
    startRate: 10,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 150,
    stages: [
      { duration: '2m', target: 20 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 0 },
    ],
  },

  // Stress: push past expected load to find the saturation point.
  stress: {
    executor: 'ramping-arrival-rate',
    startRate: 20,
    timeUnit: '1s',
    preAllocatedVUs: 100,
    maxVUs: 500,
    stages: [
      { duration: '3m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '3m', target: 200 },
      { duration: '3m', target: 300 },
      { duration: '2m', target: 0 },
    ],
  },

  // Spike: sudden burst, then recovery.
  spike: {
    executor: 'ramping-arrival-rate',
    startRate: 10,
    timeUnit: '1s',
    preAllocatedVUs: 100,
    maxVUs: 400,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '30s', target: 300 },
      { duration: '2m', target: 300 },
      { duration: '30s', target: 20 },
      { duration: '1m', target: 0 },
    ],
  },

  // Soak: sustained moderate load to surface leaks / slow degradation.
  soak: {
    executor: 'constant-arrival-rate',
    rate: 30,
    timeUnit: '1s',
    duration: '30m',
    preAllocatedVUs: 80,
    maxVUs: 200,
  },

  // Degradation: steady load while faults are injected (driven externally).
  degradation: {
    executor: 'constant-arrival-rate',
    rate: 25,
    timeUnit: '1s',
    duration: '5m',
    preAllocatedVUs: 60,
    maxVUs: 200,
  },
};
