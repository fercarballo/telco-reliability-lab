import { buildServer } from './server';
import { config, assertProductionSafety } from './config';
import { pool } from './db';
import { redis } from './redis';
import { runMigrations } from './migrate';

/**
 * Bootstrap. OpenTelemetry is initialised *before* this module runs, via
 * `node --require @opentelemetry/auto-instrumentations-node/register` (see
 * package.json `start` script and the Dockerfile). That ordering matters: the
 * auto-instrumentation must patch `http`, `pg` and `ioredis` before they are
 * imported here.
 */
async function main() {
  // Refuse to boot a production process with an insecure (demo) JWT secret.
  assertProductionSafety();

  const app = await buildServer();

  // Bootstrap the schema + seed on managed-Postgres hosts that skip initdb.
  if (config.runDbMigrations) {
    app.log.info({ dir: config.migrationsDir }, 'running database migrations');
    await runMigrations(app.log);
  }

  try {
    await app.listen({ host: config.http.host, port: config.http.port });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await pool.end();
      redis.disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
