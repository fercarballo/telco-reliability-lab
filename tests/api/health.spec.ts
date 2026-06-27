import { test, expect } from '@playwright/test';

test.describe('Health endpoints', () => {
  test('GET /health/live returns 200 — process is up', async ({ request }) => {
    const res = await request.get('/health/live');
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });

  test('GET /health returns 200 — all deps reachable', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(body.redis).toBe('ok');
  });
});
