import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import ws from 'fastify-websocket'
import { setupWSConnection } from 'y-websocket';
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

  // POST Endpoint
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

  // WebSocket Upgrade Handler Endpoint
  fastify.route({
    url: '/sheets:id/sync',
    method: 'GET',
    schema: {
      description: 'Upgrade Session to WebSocket Connection after owernship/permission check. For viewing/editing single sheets',
      tags: ['Sheets'],
      response: {
        400: {
          type: 'object',
          properties: {
            message: {type: 'string'},
            success: { type: 'boolean' },
            data: {type: 'array', items: {type: 'object'}}
          }
        }
      }
    },
    wsHandler: async (connection, request) => {
      const { id } = request.params as { id: string };
      const userId = 'demo-user-id'; // TODO: Replace with real user ID from auth
      //const token = extractToken(req.headers.authorization);

      const sheet = await db('sheets').where({ id }).first();
      if (!sheet) { 
        connection.socket.send(JSON.stringify({
          message: 'Sheet not found'
        }));
        connection.socket.close();
        return;
      }
      // Permission check (at least 'viewer' required)
      const allowed = await hasPermission(userId, id, 'viewer');
      if (!allowed) {
        connection.socket.send(JSON.stringify({ message: 'No access', success: false }));
        connection.socket.close();
        return;
      }

      setupWSConnection(connection.socket, request, { docName: id });
    },
    handler: async function myHandler(request, reply) {
      //handles normal HTTP request
      reply.send({
        message: 'WebSocket Endpoint only'
      });
    },
  })
}

// Helper Functions
async function hasPermission(userId: string, sheetId: string, minRole: 'viewer' | 'editor' | 'owner') {
  // Fetch the users role for sheet in question
  const perm = await db('permissions')
    .where({ user_id: userId, sheet_id: sheetId })
    .first();

  if (!perm) return false; //return false if no role defined

  // Define role hierarchy
  const roles = ['viewer', 'editor', 'owner']; // order matching hierarchy level 0 = viewer, 1 = editor, 2 = owner
  return roles.indexOf(perm.role) >= roles.indexOf(minRole); // return true if role level index is bigger than minimum required Role level for action
}
