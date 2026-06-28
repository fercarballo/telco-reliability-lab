import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './db';
import { config } from './config';

/**
 * Boot-time database bootstrap for managed-Postgres hosts (Render, Fly, Railway)
 * that do not run docker-entrypoint-initdb.d. The two SQL files are the exact
 * same artefacts the local Docker stack loads via initdb, so there is a single
 * source of truth. Both are idempotent, so running them on every boot is safe.
 */
const MIGRATION_FILES = ['01-schema.sql', '02-seed.sql'] as const;

export async function runMigrations(logger?: {
  info: (obj: object, msg: string) => void;
}): Promise<void> {
  for (const file of MIGRATION_FILES) {
    const path = join(config.migrationsDir, file);
    const sql = await readFile(path, 'utf8');
    // Multi-statement simple query (no bind params) — pg executes all statements.
    await pool.query(sql);
    logger?.info({ file }, 'migration applied');
  }
}
