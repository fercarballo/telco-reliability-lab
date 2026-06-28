import Redis from 'ioredis';
import { config } from './config';

/**
 * Shared Redis client. Used here for two things that show up nicely in traces:
 *  - caching the idempotent payment response for fast replay
 *  - storing issued session tokens (so we can demonstrate Redis spans)
 */
const redisOptions = { lazyConnect: false, maxRetriesPerRequest: 2, enableReadyCheck: true };

// Prefer a full connection URL (managed providers); fall back to host/port (local).
export const redis = config.redis.url
  ? new Redis(config.redis.url, redisOptions)
  : new Redis({ host: config.redis.host, port: config.redis.port, ...redisOptions });

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
