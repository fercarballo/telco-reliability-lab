import { test, expect } from '@playwright/test';
import { loginAs, bearer } from './helpers/auth';

// user_001 (customer_001): plan index = 1 % 5 = 1 → mobile_premium (mirrors seed generator).
// fiber_300mb is index 2, guaranteed different — safe as target.
const VALID_TARGET = 'fiber_300mb';
const CURRENT_PLAN = 'mobile_premium'; // triggers 422 ineligible

test.describe('POST /customers/:id/plan-changes', () => {
  let token: string;
  let customerId: string;
  let otherToken: string;

  test.beforeAll(async ({ request }) => {
    ({ token, customerId } = await loginAs(request, 'user_001'));
    ({ token: otherToken } = await loginAs(request, 'user_002'));
  });

  test('valid target plan → 202 scheduled with changeId and effectiveDate', async ({ request }) => {
    const res = await request.post(`/customers/${customerId}/plan-changes`, {
      headers: bearer(token),
      data: { targetPlanId: VALID_TARGET },
    });
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.status).toBe('scheduled');
    expect(typeof body.changeId).toBe('string');
    expect(body.changeId).toMatch(/^chg_/);
    expect(typeof body.effectiveDate).toBe('string');
  });

  test("targeting customer's current plan → 422 ineligible", async ({ request }) => {
    const res = await request.post(`/customers/${customerId}/plan-changes`, {
      headers: bearer(token),
      data: { targetPlanId: CURRENT_PLAN },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).error).toBe('ineligible');
  });

  test('non-existent plan → 422 ineligible', async ({ request }) => {
    const res = await request.post(`/customers/${customerId}/plan-changes`, {
      headers: bearer(token),
      data: { targetPlanId: 'plan_does_not_exist' },
    });
    expect(res.status()).toBe(422);
  });

  test('no auth token → 401', async ({ request }) => {
    const res = await request.post(`/customers/${customerId}/plan-changes`, {
      data: { targetPlanId: VALID_TARGET },
    });
    expect(res.status()).toBe(401);
  });

  test("changing another customer's plan → 403 forbidden", async ({ request }) => {
    const res = await request.post(`/customers/${customerId}/plan-changes`, {
      headers: bearer(otherToken),
      data: { targetPlanId: VALID_TARGET },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });
});
