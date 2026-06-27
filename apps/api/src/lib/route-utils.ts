import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Sends 403 and returns true if the authenticated customer does not own the
 * requested resource. Call as `if (await forbidIfNotOwner(...)) return;`.
 *
 * Centralises the cross-customer access guard that every protected route needs.
 * Using a reply-and-return pattern (instead of throwing) keeps Fastify's reply
 * lifecycle clean without requiring an additional error-handler plugin.
 */
export async function forbidIfNotOwner(
  request: FastifyRequest,
  reply: FastifyReply,
  resourceCustomerId: string,
): Promise<boolean> {
  if (request.authCustomerId !== resourceCustomerId) {
    await reply
      .code(403)
      .send({ error: 'forbidden', message: 'Access to another customer is not allowed' });
    return true;
  }
  return false;
}
