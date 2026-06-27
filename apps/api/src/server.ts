import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError } from 'fastify';
import { buildLogger } from './logger';
import {
  httpRequestDuration,
  httpRequestErrorsTotal,
  httpRequestsTotal,
} from './metrics';
import { InjectedFaultError } from './faults';
import authPlugin from './auth-plugin';
import authRoutes from './routes/auth';
import invoiceRoutes from './routes/invoices';
import planChangeRoutes from './routes/plan-changes';
import paymentRoutes from './routes/payments';
import adminRoutes from './routes/admin';
import systemRoutes from './routes/system';

/** Routes excluded from HTTP metrics to avoid self-inflating scrape noise. */
const METRICS_EXCLUDED = new Set(['/metrics', '/health/live']);

function routeTemplate(request: { routeOptions?: { url?: string }; url: string }): string {
  // Templated path (e.g. /customers/:customerId/invoices) keeps label cardinality bounded.
  return request.routeOptions?.url ?? 'unmatched';
}

export async function buildServer() {
  const app = Fastify({
    loggerInstance: buildLogger(), // Fastify 5: pass a pre-built pino instance here
    disableRequestLogging: true, // we emit our own structured access log below
    genReqId: () => `req-${randomUUID()}`,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'request_id',
    ajv: { customOptions: { removeAdditional: 'all', coerceTypes: true } },
  });

  await app.register(authPlugin);

  await app.register(authRoutes);
  await app.register(invoiceRoutes);
  await app.register(planChangeRoutes);
  await app.register(paymentRoutes);
  await app.register(adminRoutes);
  await app.register(systemRoutes);

  // RED metrics + structured access log, emitted once per response.
  app.addHook('onResponse', async (request, reply) => {
    const route = routeTemplate(request);
    if (METRICS_EXCLUDED.has(route)) return;

    const labels = { route, method: request.method, status: String(reply.statusCode) };
    const durationSeconds = reply.elapsedTime / 1000;

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
    if (reply.statusCode >= 400) {
      httpRequestErrorsTotal.inc(labels);
    }

    request.log.info(
      {
        route,
        method: request.method,
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
  });

  // Central error handler: map injected faults, log with context, count errors.
  // Fastify 5 types the error as `unknown`; annotate it back to FastifyError.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof InjectedFaultError) {
      request.log.warn({ fault_type: error.faultType, route: routeTemplate(request) }, 'injected fault triggered');
      return reply.code(error.statusCode).send({ error: 'injected_fault', faultType: error.faultType });
    }

    // Fastify validation errors -> 400.
    if (error.validation) {
      return reply.code(400).send({ error: 'validation_error', message: error.message });
    }

    request.log.error({ err: error, route: routeTemplate(request) }, 'unhandled error');
    return reply.code(error.statusCode ?? 500).send({ error: 'internal_error', message: 'Unexpected error' });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: 'not_found', message: `Route ${request.method} ${request.url} not found` });
  });

  return app;
}
