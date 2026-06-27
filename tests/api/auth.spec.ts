import { test, expect } from '@playwright/test';

test.describe('POST /auth/login', () => {
  test('valid credentials → 200 with accessToken and customerId', async ({ request }) => {
    const res = await request.post('/auth/login', {
      data: { username: 'user_001', password: 'password123' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(20);
    expect(body.customerId).toBe('customer_001');
    expect(typeof body.expiresIn).toBe('number');
  });

  test('wrong password → 401 invalid_credentials', async ({ request }) => {
    const res = await request.post('/auth/login', {
      data: { username: 'user_001', password: 'wrong-password' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('invalid_credentials');
  });

  test('unknown username → 401 invalid_credentials (no user enumeration)', async ({ request }) => {
    const res = await request.post('/auth/login', {
      data: { username: 'doesnt_exist', password: 'password123' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('invalid_credentials');
  });

  test('missing password → 400 schema validation', async ({ request }) => {
    const res = await request.post('/auth/login', {
      data: { username: 'user_001' },
    });
    expect(res.status()).toBe(400);
  });

  test('empty body → 400 schema validation', async ({ request }) => {
    const res = await request.post('/auth/login', { data: {} });
    expect(res.status()).toBe(400);
  });
});
