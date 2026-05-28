import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import ws from 'fastify-websocket'
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// This completely bypasses the ESM export restrictions!
const { setupWSConnection } = require('y-websocket/bin/utils.js');
//import { setupWSConnection } from 'y-websocket';
//import { setupWSConnection } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import Sensible from '@fastify/sensible'
import db from '../db.ts'

// export as fastify plugin to index.ts
export default async function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
): Promise<void> {
  //Import Sensible Plugin for error handling
  await fastify.register(Sensible)

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

      const sheet_data = new Y.Doc(); //Create/load empty Yjs Doc

      if (sheet.yjs_snapshot) {
        Y.applyUpdate(sheet_data, sheet.yjs_snapshot) // Append Sheet Data from DB
      }

      sheet_data.on('update', async update => {
        await db('sheets').where({id}).update({ yjs_snapshot: Y.encodeStateAsUpdate(sheet_data)}); // Write changes to DB on update
      });

      setupWSConnection(connection.socket, request, { docName: id });
      //setupWSConnection(connection.socket, request, { docName: id });

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