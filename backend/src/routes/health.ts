import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'

export default async function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  fastify.get('/ping', async () => ({ message: 'pong' }));
  fastify.get('/health', async () => ({ message: 'ok', status: 'ok' }));
}