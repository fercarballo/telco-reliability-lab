import Redis from 'ioredis';
import { config } from './config';

/**
 * Shared Redis client. Used here for two things that show up nicely in traces:
 *  - caching the idempotent payment response for fast replay
 *  - storing issued session tokens (so we can demonstrate Redis spans)
 */
export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: false,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
