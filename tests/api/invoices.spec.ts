import { test, expect } from '@playwright/test';
import { loginAs, bearer } from './helpers/auth';

test.describe('GET /customers/:id/invoices', () => {
  let token: string;
  let customerId: string;
  let otherToken: string;

  test.beforeAll(async ({ request }) => {
    ({ token, customerId } = await loginAs(request, 'user_001'));
    ({ token: otherToken } = await loginAs(request, 'user_002'));
  });

  test('authenticated request returns invoices list with expected shape', async ({ request }) => {
    const res = await request.get(`/customers/${customerId}/invoices`, {
      headers: bearer(token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.customerId).toBe(customerId);
    expect(Array.isArray(body.invoices)).toBe(true);
    expect(body.invoices.length).toBeGreaterThan(0);
    const invoice = body.invoices[0];
    expect(invoice).toHaveProperty('invoiceId');
    expect(invoice).toHaveProperty('amount');
    expect(invoice).toHaveProperty('status');
    expect(invoice).toHaveProperty('dueDate');
  });

  test('no auth token → 401', async ({ request }) => {
    const res = await request.get(`/customers/${customerId}/invoices`);
    expect(res.status()).toBe(401);
  });

  test("accessing another customer's invoices → 403 forbidden", async ({ request }) => {
    const res = await request.get(`/customers/${customerId}/invoices`, {
      headers: bearer(otherToken),
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });
});
