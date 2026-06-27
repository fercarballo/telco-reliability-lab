import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { pool } from '../db';
import { clearFaults, isValidFault, isValidTarget, listFaults, setFault } from '../faults';
import { InvoiceStatus } from '../lib/constants';

interface FaultBody {
  target: string;
  fault: string;
  rate?: number;
  latencyMs?: number;
  durationSec?: number;
}

const faultSchema = {
  body: {
    type: 'object',
    required: ['target', 'fault'],
    additionalProperties: false,
    properties: {
      target: { type: 'string' },
      fault: { type: 'string' },
      rate: { type: 'number', minimum: 0, maximum: 1 },
      latencyMs: { type: 'number', minimum: 0, maximum: 60000 },
      durationSec: { type: 'number', minimum: 1, maximum: 3600 },
    },
  },
} as const;

export default async function adminRoutes(app: FastifyInstance) {
  // Hard guard: fault injection must be impossible unless explicitly enabled.
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/admin') && !config.faultInjectionEnabled) {
      await reply.code(403).send({ error: 'disabled', message: 'Fault injection is disabled in this environment' });
    }
  });

  app.post<{ Body: FaultBody }>('/admin/faults', { schema: faultSchema }, async (request, reply) => {
    const { target, fault, rate = 1, latencyMs = 0, durationSec = 300 } = request.body;

    if (!isValidTarget(target)) {
      return reply.code(400).send({ error: 'invalid_target', message: `Unknown target '${target}'` });
    }
    if (!isValidFault(fault)) {
      return reply.code(400).send({ error: 'invalid_fault', message: `Unknown fault '${fault}'` });
    }

    const spec = setFault({ target, fault, rate, latencyMs, durationSec });
    request.log.warn({ fault: spec }, 'fault injected');
    return reply.code(201).send({ injected: spec });
  });

  app.get('/admin/faults', async (_request, reply) => {
    return reply.code(200).send({ faults: listFaults() });
  });

  app.delete('/admin/faults', async (request, reply) => {
    clearFaults();
    request.log.warn('all faults cleared');
    return reply.code(200).send({ cleared: true });
  });

  // Reset all invoices to 'pending' so every k6 run starts with payable invoices.
  // The payment journey is the highest-risk flow; without this, invoices drain to
  // 'paid' across runs and the journey stops being exercised.
  app.post('/admin/reset-invoices', async (request, reply) => {
    const result = await pool.query('UPDATE invoices SET status = $1', [InvoiceStatus.PENDING]);
    request.log.warn({ rowCount: result.rowCount }, 'invoices reset to pending');
    return reply.code(200).send({ reset: true, invoicesUpdated: result.rowCount });
  });

  // Alertmanager webhook receiver.
  // In production this would be a PagerDuty/Slack integration; in the lab it
  // logs alert payloads via pino → Loki so they appear in the Grafana Explore
  // view alongside traces and metrics — keeping the full alert chain visible
  // without any external dependency.
  app.post('/admin/alerts', async (request, reply) => {
    const payload = request.body as Record<string, unknown>;
    const alerts = (payload?.alerts as Array<Record<string, unknown>>) ?? [];
    for (const alert of alerts) {
      const status = alert.status as string;
      const name   = (alert.labels as Record<string, string>)?.alertname ?? 'unknown';
      const sev    = (alert.labels as Record<string, string>)?.severity  ?? 'unknown';
      if (status === 'firing') {
        request.log.error({ alert }, `[ALERT FIRING] ${name} (${sev})`);
      } else {
        request.log.info({ alert }, `[ALERT RESOLVED] ${name}`);
      }
    }
    return reply.code(200).send({ received: alerts.length });
  });
}
