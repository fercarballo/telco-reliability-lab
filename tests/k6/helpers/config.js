// Shared runtime configuration for all k6 scripts.
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Standard trend stats so every report shows the percentiles our SLOs care about.
export const summaryTrendStats = ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];
