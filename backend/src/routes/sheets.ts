import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'

interface Sheets {
    title: string;
    id: string; // UUID as string
    owner_id: string;
    yjs_snapshot?: Buffer; // BYTEA yjs_snapshot
    updated_at: Date;
    created_at: Date;
}

/**simple temporary database for sheets **/ 
const sheets: Sheets[] = [];

// export as fastify plugin to index.ts
export default async function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
): Promise<void> {
  //Import Sensible Plugin for error handling
  await fastify.register(Sensible)

  // GET Endpoint
  fastify.route({
    url: '/sheets',
    method: 'GET',
    schema: {
      description: 'List all sheets',
      tags: ['Sheets'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: {type: 'string'},
            success: { type: 'boolean' },
            data: {type: 'array', items: {type: 'object'}}
          }
        }
      }
    },
    handler: function myHandler(request, reply) {
      reply.send({
          message: 'sheets listed successfully',
          success: true,
          data: sheets
      })
    },
  })

  fastify.route({
    url: '/sheets',
    method: 'POST',
    schema: {
      description: 'Create a new sheet',
      tags: ['Sheets'],
      body: {
        type: 'object',
        required: ['title', 'id', 'owner_id', 'updated_at', 'created_at'],
        properties: {
          title: { type: 'string' },
          id: { type: 'string' },
          owner_id: { type: 'string' },
          yjs_snapshot: { type: 'string' },
          updated_at: { type: 'string', format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            success: { type: 'boolean' },
            data: { type: 'object', properties: {} }
          }
        }
      }
    },
    handler: function myHandler(request, reply) {
      const data = request.body as Sheets
      if (!data?.title || !data?.id || !data?.owner_id) {
        throw fastify.httpErrors.badRequest(
          'Please ensure the sheet is valid',
        )
      }
      sheets.push({
        title: data.title,
        id: data.id, // UUID as string
        owner_id: data.owner_id,
        yjs_snapshot: data.yjs_snapshot, // BYTEA yjs_snapshot
        updated_at: data.updated_at,
        created_at: data.created_at,
      })

      reply.send({
        message: 'Sheet added succesfully.',
        success: true,
        data: null,
      })
    },
  })
}