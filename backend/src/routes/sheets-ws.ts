import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'
import db from '../db.ts'
import fastifyWebsocket from '@fastify/websocket';
import { ws_server } from '../webSocket_server.ts'
import { hasPermission } from '../utils/permissions.ts'
import { WSSheetSchema } from '../schemas/sheet.ts';
import { verifyUser } from '../utils/verifyUser.ts'

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
    schema: {...WSSheetSchema},
    // In @fastify/websocket 11 ist der erste Parameter der Socket selbst und kein
    // Wrapper mit .socket - siehe types/index.d.ts, WebsocketHandler.
    wsHandler: async (socket, request) => {
      const { id } = request.params as { id: string };

      // Die Pruefungen weiter unten sind asynchron, der Client faengt aber sofort
      // nach dem Upgrade an zu senden. Die Listener muessen deshalb VOR dem ersten
      // await haengen, sonst gehen die ersten Nachrichten verloren und die
      // Verbindung steht stumm. Bis handleConnection die Gegenstelle liefert,
      // werden sie hier zwischengelagert.
      let client: ReturnType<typeof ws_server.handleConnection> | null = null;
      const pending: Uint8Array[] = [];

      socket.on('message', (data: Buffer) => {
        const message = new Uint8Array(data);
        if (client) client.handleMessage(message);
        else pending.push(message);
      });
      socket.on('close', (code: number, reason: Buffer) => {
        client?.handleClose({ code, reason: reason.toString() });
      });

      let payload = await verifyUser(request.headers.authorization);
      if (!payload?.sub) {
        throw fastify.httpErrors.unauthorized('Invalid Session') 
      }
      const user_id = payload.sub;

      const sheet = await db('sheets').where({ id }).first();
      if (!sheet) { 
        socket.send(JSON.stringify({
          message: 'Sheet not found',
          success: false
        }));
        socket.close();
        return;
      }
      // Permission check
      var allowed = false;
      if (sheet.owner_id === user_id) {
        //immediate access if owner
        allowed = true;
      } else {
        //if not owner check for permissions (min: viewer)
        allowed = await hasPermission(user_id, id, 'viewer')
      }
      if (!allowed) {
        socket.send(JSON.stringify({ message: 'No access', success: false }));
        socket.close();
        return;
      }

      // create standard request object (Fetch-style) from fastify request object
      const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const webRequest = new Request(`${protocol}://${request.headers.host}${request.url}`, {
        headers: new Headers(request.headers as Record<string, string>), //key value format
        method: request.method,
      });
      
      // Open Websocket Connection for Document (identified by database id)
      // handleConnection haengt sich nicht selbst an den Socket - das Weiterreichen
      // der Nachrichten oben ist Pflicht, sonst passiert auf der Verbindung nichts.
      client = ws_server.handleConnection(socket, webRequest, { docName: id, userId: user_id, token: request.headers.authorization});

      // Nachholen, was waehrend der Pruefungen eingetroffen ist - in der Reihenfolge
      // des Eingangs, sonst kommt die Anmeldung nach den Dokumentdaten an.
      for (const message of pending) {
        client.handleMessage(message);
      }
      pending.length = 0;
    },
    handler: async function myHandler(request, reply) {
      //handles normal HTTP request
      reply.send({
        message: 'WebSocket Endpoint only'
      });
    },
  })
}