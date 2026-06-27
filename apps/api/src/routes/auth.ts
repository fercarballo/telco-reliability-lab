import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { redis } from '../redis';
import { config } from '../config';
import { maybeInjectFault } from '../faults';
import { withSpan } from '../tracing';
import { businessLoginsTotal } from '../metrics';

interface LoginBody {
  username: string;
  password: string;
}

const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 1, maxLength: 64 },
      password: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
} as const;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>('/auth/login', { schema: loginSchema }, async (request, reply) => {
    await maybeInjectFault('auth');

    const { username, password } = request.body;

    const result = await withSpan('auth.validate-credentials', { 'auth.username': username }, async () => {
      const { rows } = await pool.query<{ customer_id: string; password_hash: string }>(
        'SELECT customer_id, password_hash FROM customers WHERE username = $1',
        [username],
      );
      return rows[0];
    });

    if (!result || !constantTimeEquals(result.password_hash, sha256(password))) {
      businessLoginsTotal.inc({ status: 'failed' });
      // Never echo which half failed, and never log the password (redacted anyway).
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Invalid username or password' });
    }

    const token = await reply.jwtSign(
      { sub: result.customer_id, username },
      { expiresIn: config.auth.tokenTtlSeconds },
    );

    // Track the issued session in Redis (demonstrates a redis span + enables revocation later).
    await redis.set(`session:${result.customer_id}`, token, 'EX', config.auth.tokenTtlSeconds);

    businessLoginsTotal.inc({ status: 'success' });
    request.log.info({ route: '/auth/login', customer_id: result.customer_id }, 'login success');

    return reply.code(200).send({
      accessToken: token,
      customerId: result.customer_id,
      expiresIn: config.auth.tokenTtlSeconds,
    });
  });
}
