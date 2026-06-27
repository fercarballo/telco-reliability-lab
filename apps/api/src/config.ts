/**
 * Centralised, typed configuration loaded from environment variables.
 * Every value has a local-friendly default so the API can boot with `npm run dev`
 * without a full Docker stack, while Docker Compose / CI override via env.
 */

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'telco-api',
  serviceVersion: process.env.SERVICE_VERSION ?? '1.0.0',
  deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT ?? 'local',

  http: {
    host: process.env.HTTP_HOST ?? '0.0.0.0',
    port: num(process.env.HTTP_PORT, 3000),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-do-not-use-in-prod',
    tokenTtlSeconds: num(process.env.JWT_TTL_SECONDS, 3600),
  },

  postgres: {
    host: process.env.PGHOST ?? 'localhost',
    port: num(process.env.PGPORT, 5432),
    user: process.env.PGUSER ?? 'telco',
    password: process.env.PGPASSWORD ?? 'telco',
    database: process.env.PGDATABASE ?? 'telco',
    poolMax: num(process.env.PG_POOL_MAX, 10),
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
  },

  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    // When enabled, ship structured logs to Loki via the pino-loki transport.
    lokiEnabled: bool(process.env.LOKI_ENABLED, false),
    lokiUrl: process.env.LOKI_URL ?? 'http://localhost:3100',
    pretty: bool(process.env.LOG_PRETTY, false),
  },

  /**
   * Fault injection is a deliberately dangerous capability (it degrades the
   * service on purpose), so it is gated behind an explicit flag that must only
   * be enabled in local/CI environments.
   */
  faultInjectionEnabled: bool(process.env.FAULT_INJECTION_ENABLED, true),

  /** Simulated downstream payment gateway behaviour. */
  paymentGateway: {
    baseLatencyMs: num(process.env.PAYMENT_GATEWAY_BASE_LATENCY_MS, 120),
    jitterMs: num(process.env.PAYMENT_GATEWAY_JITTER_MS, 80),
  },
} as const;

export type AppConfig = typeof config;
