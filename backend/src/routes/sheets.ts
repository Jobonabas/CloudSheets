import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'
import db from '../db.ts'

interface Sheets {
    title: string;
    id: string; // UUID as string
    owner_id: string;
    yjs_snapshot?: Buffer; // BYTEA yjs_snapshot
    updated_at: Date;
    created_at: Date;
}

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
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  owner_id: { type: 'string' },
                  yjs_snapshot: { type: 'string', nullable: true },
                  created_at: { type: 'string', format: 'date-time' },
                  updated_at: { type: 'string', format: 'date-time' }
                },
                required: ['id', 'title', 'owner_id', 'created_at', 'updated_at']
              }
            }
          }
        }
      }
    },
    handler: async function myHandler(request, reply) {
      const userId = 'demo-user-id'; // TODO: Replace with real user ID from auth
      const userSheets = await db('sheets').where({ owner_id: userId }); // get user sheets (with owner check)

      reply.send({
          message: 'sheets listed successfully',
          success: true,
          data: userSheets
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
        required: ['title', 'id', 'updated_at', 'created_at'],
        properties: {
          title: { type: 'string' },
          id: { type: 'string' },
          yjs_snapshot: { type: 'string', contentEncoding: 'base64' },
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
    handler: async function myHandler(request, reply) {
      const data = request.body as Sheets

      const owner_id = 'demo-user-id' // request.user.id; Cognito/ JWT Token not implemented yet // TODO: Replace with real user ID from auth

      if (!data?.title || !data?.id) {
        throw fastify.httpErrors.badRequest(
          'Please ensure the sheet is valid',
        )
      }
      await db('sheets').insert({
        id: data.id,
        title: data.title,
        owner_id: owner_id,
        yjs_snapshot: data.yjs_snapshot,
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

  // DELETE Endpoint
  fastify.route({
    url: '/sheets:id',
    method: 'DELETE',
    schema: {
      description: 'Delete sheet with id',
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
    handler: async function myHandler(request, reply) {
      const { id } = request.params as { id: string };
      const userId = 'demo-user-id'; // TODO: Replace with real user ID from auth

      const sheet = await db('sheets').where({ id }).first();
      if (!sheet) { 
        reply.send({
          message: 'Sheet not found',
          success: false,
          data: null
        });
        return;
       }
      if (sheet.owner_id !== userId) { 
        reply.send({
          message: 'Sheet not deleted. Not authorized',
          success: false,
          data: null
        });
        return;
       }
      await db('sheets').where({ id }).del(); // delete sheet
      reply.send({
        message: 'Sheet deleted successfully',
        success: true,
        data: null
      });
    },
  })
}
