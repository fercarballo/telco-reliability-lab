import type { APIRequestContext } from '@playwright/test';

export async function loginAs(
  request: APIRequestContext,
  username: string,
  password = 'password123',
): Promise<{ token: string; customerId: string }> {
  const res = await request.post('/auth/login', { data: { username, password } });
  const body = await res.json();
  return { token: body.accessToken, customerId: body.customerId };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
