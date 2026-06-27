import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { withTransaction } from '../db';
import { redis } from '../redis';
import { config } from '../config';
import { maybeInjectFault } from '../faults';
import { withSpan } from '../tracing';
import { businessPaymentsTotal, paymentIdempotencyConflicts } from '../metrics';
import { forbidIfNotOwner } from '../lib/route-utils';
import { PaymentCache, InvoiceStatus } from '../lib/constants';

interface PaymentBody {
  customerId: string;
  invoiceId: string;
  amount: number;
  method: 'credit_card' | 'debit_card' | 'bank_transfer';
}

interface PaymentResult {
  paymentId: string;
  status: 'approved' | 'declined';
  invoiceStatus: string;
}

const schema = {
  body: {
    type: 'object',
    required: ['customerId', 'invoiceId', 'amount', 'method'],
    additionalProperties: false,
    properties: {
      customerId: { type: 'string', minLength: 1, maxLength: 64 },
      invoiceId: { type: 'string', minLength: 1, maxLength: 64 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      method: { type: 'string', enum: ['credit_card', 'debit_card', 'bank_transfer'] },
    },
  },
} as const;

/**
 * Simulated external payment gateway. The injected `payments` fault is applied
 * *inside* this span on purpose, so a latency/timeout fault surfaces in Tempo as
 * a slow `payment-gateway-simulator` span — the exact signal the observability
 * walkthrough teaches you to look for.
 */
async function callPaymentGateway(amount: number, method: string): Promise<'approved' | 'declined'> {
  return withSpan(
    'payment-gateway-simulator',
    { 'gateway.method': method, 'gateway.amount': amount, journey: 'payment' },
    async () => {
      await maybeInjectFault('payments');
      const base = config.paymentGateway.baseLatencyMs;
      const jitter = Math.floor(Math.random() * config.paymentGateway.jitterMs);
      await sleep(base + jitter);
      // Deterministic-enough demo: tiny synthetic decline rate.
      return Math.random() < 0.01 ? 'declined' : 'approved';
    },
  );
}

export default async function paymentRoutes(app: FastifyInstance) {
  app.post<{ Body: PaymentBody }>(
    '/payments',
    { schema, preHandler: app.authenticate },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
        return reply
          .code(400)
          .send({ error: 'missing_idempotency_key', message: 'Idempotency-Key header is required' });
      }

      const { customerId, invoiceId, amount, method } = request.body;

      if (await forbidIfNotOwner(request, reply, customerId)) return;

      // Fast replay path: a previously completed payment for this key.
      const cached = await redis.get(`${PaymentCache.PREFIX}${idempotencyKey}`);
      if (cached) {
        paymentIdempotencyConflicts.inc();
        businessPaymentsTotal.inc({ status: 'idempotent_replay' });
        request.log.info({ idempotency_key: idempotencyKey, source: 'cache' }, 'idempotent payment replay');
        return reply.code(200).send(JSON.parse(cached) as PaymentResult);
      }

      const outcome = await withTransaction<{ replay: boolean; result: PaymentResult }>(async (client) => {
        const paymentId = `pay_${randomUUID().slice(0, 8)}`;

        // The UNIQUE(idempotency_key) constraint is the source of truth under
        // concurrency. The first writer inserts; everyone else gets DO NOTHING.
        const inserted = await client.query<{ payment_id: string }>(
          `INSERT INTO payments (payment_id, customer_id, invoice_id, amount, method, status, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING payment_id`,
          [paymentId, customerId, invoiceId, amount, method, idempotencyKey],
        );

        if (inserted.rowCount === 0) {
          // Lost the race / true replay: return the existing payment's state.
          const existing = await client.query<{
            payment_id: string;
            status: PaymentResult['status'];
            invoice_status: string;
          }>(
            `SELECT p.payment_id,
                    p.status,
                    COALESCE(i.status, 'unknown') AS invoice_status
               FROM payments p
               LEFT JOIN invoices i ON i.invoice_id = p.invoice_id
              WHERE p.idempotency_key = $1`,
            [idempotencyKey],
          );
          const row = existing.rows[0];
          return {
            replay: true,
            result: { paymentId: row.payment_id, status: row.status, invoiceStatus: row.invoice_status },
          };
        }

        // We won the insert: validate the invoice, charge the gateway, settle.
        const invoiceStatus = await settleWonPayment(client, {
          paymentId,
          customerId,
          invoiceId,
          amount,
          method,
        });

        return {
          replay: false,
          result: { paymentId, status: invoiceStatus.paymentStatus, invoiceStatus: invoiceStatus.invoiceStatus },
        };
      });

      if (outcome.replay) {
        paymentIdempotencyConflicts.inc();
        businessPaymentsTotal.inc({ status: 'idempotent_replay' });
        request.log.info({ idempotency_key: idempotencyKey, source: 'db' }, 'idempotent payment replay');
        return reply.code(200).send(outcome.result);
      }

      // Cache the settled result for fast future replays. Fire-and-forget: a cache
      // miss is safe (we fall through to the DB constraint), so don't make the
      // caller wait for the Redis round-trip before receiving their response.
      redis
        .set(`${PaymentCache.PREFIX}${idempotencyKey}`, JSON.stringify(outcome.result), 'EX', PaymentCache.TTL_SEC)
        .catch((err) => request.log.warn({ err }, 'payment cache write failed'));

      businessPaymentsTotal.inc({ status: outcome.result.status });
      request.log.info(
        { route: '/payments', payment_id: outcome.result.paymentId, status: outcome.result.status },
        'payment processed',
      );

      const httpStatus = outcome.result.status === 'approved' ? 201 : 402;
      return reply.code(httpStatus).send(outcome.result);
    },
  );
}

async function settleWonPayment(
  client: PoolClient,
  input: { paymentId: string; customerId: string; invoiceId: string; amount: number; method: string },
): Promise<{ paymentStatus: 'approved' | 'declined'; invoiceStatus: string }> {
  // Validate the invoice belongs to the customer and the amount matches.
  const invoiceRes = await client.query<{ amount: string; status: string }>(
    'SELECT amount, status FROM invoices WHERE invoice_id = $1 AND customer_id = $2 FOR UPDATE',
    [input.invoiceId, input.customerId],
  );
  const invoice = invoiceRes.rows[0];

  if (!invoice) {
    await client.query("UPDATE payments SET status = 'declined' WHERE payment_id = $1", [input.paymentId]);
    return { paymentStatus: 'declined', invoiceStatus: 'unknown' };
  }

  // Reject attempts to re-pay an already-settled invoice (different idempotency key
  // but same invoice). Without this, concurrent payments with distinct keys could
  // both pass the idempotency insert and both attempt to charge the same invoice.
  if (invoice.status === InvoiceStatus.PAID) {
    await client.query("UPDATE payments SET status = 'declined' WHERE payment_id = $1", [input.paymentId]);
    return { paymentStatus: 'declined', invoiceStatus: invoice.status };
  }

  const gatewayStatus = await callPaymentGateway(input.amount, input.method);

  if (gatewayStatus === 'approved' && Number(invoice.amount) === input.amount) {
    await client.query("UPDATE payments SET status = 'approved' WHERE payment_id = $1", [input.paymentId]);
    await client.query("UPDATE invoices SET status = 'paid' WHERE invoice_id = $1", [input.invoiceId]);
    return { paymentStatus: 'approved', invoiceStatus: 'paid' };
  }

  await client.query("UPDATE payments SET status = 'declined' WHERE payment_id = $1", [input.paymentId]);
  return { paymentStatus: 'declined', invoiceStatus: invoice.status };
}
