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
    // Managed Postgres (Render/Fly external connections) requires TLS. Off locally.
    ssl: bool(process.env.PGSSL, false),
  },

  redis: {
    // A full connection URL (redis:// or rediss://) takes precedence — managed
    // providers (Render Key Value, Upstash, Fly) hand out a URL with auth/TLS.
    // Falls back to host/port for the local Docker stack.
    url: process.env.REDIS_URL ?? '',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
  },

  /**
   * Allowed CORS origins (comma-separated). Empty by default: the local stack is
   * same-origin (nginx proxies /api), so no CORS is needed. A split cloud deploy
   * (SPA on one host, API on another) sets CORS_ORIGINS to the SPA's origin.
   */
  cors: {
    origins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
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
   * service on purpose), so it is gated behind an explicit flag. It defaults to
   * **false** (safe): any public deployment that does not opt in stays locked.
   * The local/CI Docker stack sets FAULT_INJECTION_ENABLED=true explicitly.
   */
  faultInjectionEnabled: bool(process.env.FAULT_INJECTION_ENABLED, false),

  /**
   * Run schema + seed SQL on boot. Managed Postgres (Render, Fly, Railway) does
   * not execute docker-entrypoint-initdb.d, so a cloud deploy needs the app to
   * bootstrap its own database. The local Docker stack uses initdb and leaves
   * this false. SQL lives in `migrationsDir` and is idempotent (IF NOT EXISTS /
   * ON CONFLICT DO NOTHING), so re-running on every boot is safe.
   */
  runDbMigrations: bool(process.env.RUN_DB_MIGRATIONS, false),
  migrationsDir: process.env.MIGRATIONS_DIR ?? 'db',

  /** Simulated downstream payment gateway behaviour. */
  paymentGateway: {
    baseLatencyMs: num(process.env.PAYMENT_GATEWAY_BASE_LATENCY_MS, 120),
    jitterMs: num(process.env.PAYMENT_GATEWAY_JITTER_MS, 80),
  },
} as const;

export type AppConfig = typeof config;

const INSECURE_JWT_SECRETS = new Set([
  'dev-only-secret-do-not-use-in-prod',
  'lab-only-secret-change-me',
]);

// Environments where the demo JWT secret is acceptable. A public deploy must set
// DEPLOYMENT_ENVIRONMENT to something else (e.g. `production`) — at which point
// the guard below requires a real secret. Keyed on DEPLOYMENT_ENVIRONMENT rather
// than NODE_ENV because the local Docker stack legitimately runs NODE_ENV=production.
const TRUSTED_ENVIRONMENTS = new Set(['local', 'ci', 'test', 'development']);

/**
 * Fail fast on an unsafe public configuration. Called at boot. Refuses to start
 * an internet-exposed process that still uses a known demo JWT secret — the
 * single most dangerous misconfiguration when exposing this lab publicly.
 */
export function assertProductionSafety(): void {
  if (TRUSTED_ENVIRONMENTS.has(config.deploymentEnvironment)) return;
  if (INSECURE_JWT_SECRETS.has(config.auth.jwtSecret)) {
    throw new Error(
      `Refusing to start: DEPLOYMENT_ENVIRONMENT=${config.deploymentEnvironment} ` +
        'with a known demo JWT_SECRET. Set a strong, unique JWT_SECRET environment variable.',
    );
  }
}
