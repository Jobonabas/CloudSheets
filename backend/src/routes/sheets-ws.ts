import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'
import db from '../db.ts'
import fastifyWebsocket from '@fastify/websocket';
import { ws_server } from '../webSocket_server.ts'
import { hasPermission } from '../utils/permissions.ts'

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
      ws_server.handleConnection(connection.socket, webRequest, { docName: id, userId: userId });

    },
    handler: async function myHandler(request, reply) {
      //handles normal HTTP request
      reply.send({
        message: 'WebSocket Endpoint only'
      });
    },
  })
}