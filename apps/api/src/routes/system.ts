import type { FastifyInstance } from 'fastify';
import { pingDatabase } from '../db';
import { pingRedis } from '../redis';
import { registry } from '../metrics';

export default async function systemRoutes(app: FastifyInstance) {
  // Liveness: process is up. Used by Docker/CI as a cheap "is it listening" check.
  app.get('/health/live', async (_request, reply) => reply.code(200).send({ status: 'ok' }));

  // Readiness / dependency health.
  app.get('/health', async (_request, reply) => {
    const [database, redisOk] = await Promise.all([pingDatabase(), pingRedis()]);
    const healthy = database && redisOk;
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      database: database ? 'ok' : 'down',
      redis: redisOk ? 'ok' : 'down',
      observability: 'ok',
    });
  });

  // Prometheus scrape target.
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return reply.send(await registry.metrics());
  });
}
