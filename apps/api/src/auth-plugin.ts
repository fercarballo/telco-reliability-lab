import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config';

/**
 * JWT auth as a Fastify plugin. Exposes `app.authenticate` (a preHandler) and
 * `request.authCustomerId` for downstream handlers.
 */
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    authCustomerId?: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; username: string };
    user: { sub: string; username: string };
  }
}

export default fp(async (app) => {
  app.register(fastifyJwt, {
    secret: config.auth.jwtSecret,
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      request.authCustomerId = request.user.sub;
    } catch {
      await reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid token' });
    }
  });
});
