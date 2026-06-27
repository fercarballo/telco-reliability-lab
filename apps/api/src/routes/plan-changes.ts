import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { maybeInjectFault } from '../faults';
import { withSpan } from '../tracing';
import { businessPlanChangesTotal } from '../metrics';

interface PlanChangeParams {
  customerId: string;
}
interface PlanChangeBody {
  targetPlanId: string;
}

const schema = {
  params: {
    type: 'object',
    required: ['customerId'],
    properties: { customerId: { type: 'string', minLength: 1, maxLength: 64 } },
  },
  body: {
    type: 'object',
    required: ['targetPlanId'],
    additionalProperties: false,
    properties: { targetPlanId: { type: 'string', minLength: 1, maxLength: 64 } },
  },
} as const;

/** Simulates a dependency on an internal product-catalog service. */
async function checkCatalogEligibility(currentPlanId: string | null, targetPlanId: string): Promise<boolean> {
  return withSpan(
    'plans.catalog-eligibility',
    { 'plan.current': currentPlanId ?? 'none', 'plan.target': targetPlanId },
    async (span) => {
      const { rows } = await pool.query<{ plan_id: string }>('SELECT plan_id FROM plans WHERE plan_id = $1', [
        targetPlanId,
      ]);
      const eligible = rows.length > 0 && targetPlanId !== currentPlanId;
      span.setAttribute('plan.eligible', eligible);
      return eligible;
    },
  );
}

export default async function planChangeRoutes(app: FastifyInstance) {
  app.post<{ Params: PlanChangeParams; Body: PlanChangeBody }>(
    '/customers/:customerId/plan-changes',
    { schema, preHandler: app.authenticate },
    async (request, reply) => {
      await maybeInjectFault('plans');

      const { customerId } = request.params;
      const { targetPlanId } = request.body;

      if (request.authCustomerId !== customerId) {
        return reply.code(403).send({ error: 'forbidden', message: 'Cannot change another customer plan' });
      }

      const customer = await withSpan('plans.load-customer', { 'customer.id': customerId }, async () => {
        const { rows } = await pool.query<{ current_plan_id: string | null }>(
          'SELECT current_plan_id FROM customers WHERE customer_id = $1',
          [customerId],
        );
        return rows[0];
      });

      if (!customer) {
        businessPlanChangesTotal.inc({ status: 'rejected' });
        return reply.code(404).send({ error: 'not_found', message: 'Customer not found' });
      }

      const eligible = await checkCatalogEligibility(customer.current_plan_id, targetPlanId);
      if (!eligible) {
        businessPlanChangesTotal.inc({ status: 'rejected' });
        return reply
          .code(422)
          .send({ error: 'ineligible', message: 'Target plan invalid or equal to current plan' });
      }

      const changeId = `chg_${randomUUID().slice(0, 8)}`;
      const effectiveDate = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      await pool.query(
        `INSERT INTO plan_changes (change_id, customer_id, target_plan_id, status, effective_date)
         VALUES ($1, $2, $3, 'scheduled', $4)`,
        [changeId, customerId, targetPlanId, effectiveDate],
      );

      businessPlanChangesTotal.inc({ status: 'scheduled' });
      request.log.info({ route: '/plan-changes', change_id: changeId, customer_id: customerId }, 'plan change scheduled');

      // 202: the change is accepted and scheduled for a future effective date.
      return reply.code(202).send({ changeId, status: 'scheduled', effectiveDate });
    },
  );
}
