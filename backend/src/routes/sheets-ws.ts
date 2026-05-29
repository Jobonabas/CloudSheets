import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'
import db from '../db.ts'
import fastifyWebsocket from '@fastify/websocket';
import { ws_server } from '../webSocket_server.ts'

// export as fastify plugin to index.ts
export default async function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
): Promise<void> {
  //Import Sensible Plugin for error handling
  await fastify.register(Sensible)

  // Register Fastify Websocket support
  await fastify.register(fastifyWebsocket)

  // WebSocket Upgrade Handler Endpoint
  fastify.route({
    url: '/sheets/:id/sync',
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
      // Permission check
      var allowed = false;
      if (sheet.owner_id === userId) {
        //immediate access if owner
        allowed = true;
      } else {
        //if not owner check for permissions (min: viewer)
        allowed = await hasPermission(userId, id, 'viewer')
      }
      if (!allowed) {
        connection.socket.send(JSON.stringify({ message: 'No access', success: false }));
        connection.socket.close();
        return;
      }

      // create standard request object (Fetch-style) from fastify request object
      const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const webRequest = new Request(`${protocol}://${request.headers.host}${request.url}`, {
        headers: new Headers(request.headers as Record<string, string>), //key value format
        method: request.method,
      });
      
      // Open Websocket Connection for Document (identified by database id)
      ws_server.handleConnection(connection.socket, webRequest, { docName: id });

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
async function hasPermission(userId: string, sheetId: string, minRole: 'viewer' | 'editor') {
  // Fetch the users role for sheet in question
  const perm = await db('permissions')
    .where({ user_id: userId, sheet_id: sheetId })
    .first();
  
  if (!perm) return false; //return false if no role defined

  // Define role hierarchy
  const roles = ['viewer', 'editor']; // order matching hierarchy level 0 = viewer, 1 = editor
  return roles.indexOf(perm.role) >= roles.indexOf(minRole); // return true if role level index is bigger than minimum required Role level for action
}