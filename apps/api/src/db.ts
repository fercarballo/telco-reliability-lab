import { Pool, type PoolClient } from 'pg';
import { config } from './config';

/**
 * Single shared PostgreSQL connection pool. The OpenTelemetry `pg`
 * auto-instrumentation wraps this transparently, so every query becomes a child
 * span of the active HTTP span (this is what lets Tempo show "slow DB query").
 */
export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: config.postgres.poolMax,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  // Managed Postgres requires TLS; the cert chain is the provider's, so we accept
  // it without local CA verification. Disabled by default for the local stack.
  ssl: config.postgres.ssl ? { rejectUnauthorized: false } : undefined,
});

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
