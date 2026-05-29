import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'

export default async function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  fastify.get('/ping', async () => 'pong\n');
  fastify.get('/health', async () => ({ status: 'ok' }));
}