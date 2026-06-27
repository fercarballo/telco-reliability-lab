import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { loginAs, bearer } from './helpers/auth';

test.describe('POST /payments — idempotency & auth guards', () => {
  let token: string;
  let customerId: string;
  let otherToken: string;
  let testInvoice: { invoiceId: string; amount: number };

  test.beforeAll(async ({ request }) => {
    // Ensure fresh pending invoices exist before any payment test runs.
    await request.post('/admin/reset-invoices', { data: {} });

    ({ token, customerId } = await loginAs(request, 'user_001'));
    ({ token: otherToken } = await loginAs(request, 'user_002'));

    const invoicesRes = await request.get(`/customers/${customerId}/invoices`, {
      headers: bearer(token),
    });
    const { invoices } = await invoicesRes.json();
    const pending = invoices.find((i: { status: string }) => i.status === 'pending');
    expect(pending, 'At least one pending invoice must exist for payment tests').toBeTruthy();
    testInvoice = { invoiceId: pending.invoiceId, amount: pending.amount };
  });

  test('missing Idempotency-Key header → 400', async ({ request }) => {
    const res = await request.post('/payments', {
      headers: bearer(token),
      data: { customerId, invoiceId: testInvoice.invoiceId, amount: testInvoice.amount, method: 'credit_card' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('missing_idempotency_key');
  });

  test('no auth token → 401', async ({ request }) => {
    const res = await request.post('/payments', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { customerId, invoiceId: testInvoice.invoiceId, amount: testInvoice.amount, method: 'credit_card' },
    });
    expect(res.status()).toBe(401);
  });

  test("paying on behalf of another customer → 403 forbidden", async ({ request }) => {
    const res = await request.post('/payments', {
      headers: { ...bearer(otherToken), 'Idempotency-Key': randomUUID() },
      data: { customerId, invoiceId: testInvoice.invoiceId, amount: testInvoice.amount, method: 'credit_card' },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  test('missing required body fields → 400 schema validation', async ({ request }) => {
    const res = await request.post('/payments', {
      headers: { ...bearer(token), 'Idempotency-Key': randomUUID() },
      data: { customerId, invoiceId: testInvoice.invoiceId }, // missing amount + method
    });
    expect(res.status()).toBe(400);
  });

  test('first payment attempt → 201 approved or 402 declined by gateway', async ({ request }) => {
    const res = await request.post('/payments', {
      headers: { ...bearer(token), 'Idempotency-Key': `pw-first-${randomUUID()}` },
      data: { customerId, invoiceId: testInvoice.invoiceId, amount: testInvoice.amount, method: 'credit_card' },
    });
    // Gateway has a ~1% synthetic decline rate — both outcomes are valid.
    expect([201, 402]).toContain(res.status());
    const body = await res.json();
    expect(typeof body.paymentId).toBe('string');
    expect(['approved', 'declined']).toContain(body.status);
  });

  test('⭐ idempotent replay: same Idempotency-Key → 200 with identical paymentId', async ({ request }) => {
    // Core business invariant: a network retry must NEVER cause a double-charge.
    // The first POST creates the payment; the second simulates a client retry after a timeout.
    const idempotencyKey = `pw-idem-${randomUUID()}`;
    const payload = { customerId, invoiceId: testInvoice.invoiceId, amount: testInvoice.amount, method: 'bank_transfer' };
    const headers = { ...bearer(token), 'Idempotency-Key': idempotencyKey };

    const first = await request.post('/payments', { headers, data: payload });
    expect([201, 402]).toContain(first.status());
    const firstBody = await first.json();

    // Retry with the exact same key.
    const second = await request.post('/payments', { headers, data: payload });
    expect(second.status()).toBe(200); // replay — not a new charge
    const secondBody = await second.json();

    // Must return the SAME payment record — no second transaction created.
    expect(secondBody.paymentId).toBe(firstBody.paymentId);
    expect(secondBody.status).toBe(firstBody.status);
  });
});
