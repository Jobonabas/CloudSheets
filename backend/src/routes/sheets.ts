import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'

interface sheets {
    title: string;
    id: string; // UUID as string
    owner_id: string;
    yjs_snapshot: Buffer; // BYTEA yjs_snapshot
    updated_at: Date;
    created_at: Date;
}

/**simple database for sheets **/ 
const sheets: sheets[] = [];

export default async function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
): Promise<void> {

  fastify.route({
    url: '/sheets',
    method: 'GET',
    handler: function myHandler(request, reply) {
      reply.send({
          message: 'sheets listed successfully',
          success: true,
          data: sheets
      })
    },
  })

}