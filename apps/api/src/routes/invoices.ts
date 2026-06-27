import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { maybeInjectFault } from '../faults';
import { withSpan } from '../tracing';
import { forbidIfNotOwner } from '../lib/route-utils';

interface InvoiceParams {
  customerId: string;
}

const listSchema = {
  params: {
    type: 'object',
    required: ['customerId'],
    properties: { customerId: { type: 'string', minLength: 1, maxLength: 64 } },
  },
} as const;

export default async function invoiceRoutes(app: FastifyInstance) {
  app.get<{ Params: InvoiceParams }>(
    '/customers/:customerId/invoices',
    { schema: listSchema, preHandler: app.authenticate },
    async (request, reply) => {
      await maybeInjectFault('billing');

      const { customerId } = request.params;

      if (await forbidIfNotOwner(request, reply, customerId)) return;

      const invoices = await withSpan(
        'billing.list-invoices',
        { 'customer.id': customerId, journey: 'invoice_lookup' },
        async () => {
          const { rows } = await pool.query(
            `SELECT invoice_id, amount, status, to_char(due_date, 'YYYY-MM-DD') AS due_date
               FROM invoices
              WHERE customer_id = $1
              ORDER BY due_date DESC`,
            [customerId],
          );
          return rows.map((r) => ({
            invoiceId: r.invoice_id,
            amount: Number(r.amount),
            status: r.status,
            dueDate: r.due_date,
          }));
        },
      );

      return reply.code(200).send({ customerId, invoices });
    },
  );
}
