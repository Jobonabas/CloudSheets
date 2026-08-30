import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'
import fastifyWebsocket from '@fastify/websocket';
import { ws_server } from '../webSocket_server.ts'
import { WSSheetSchema } from '../schemas/sheet.ts';

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

      // No authentication here on purpose. A browser cannot set headers on a
      // websocket, so the token travels inside the Hocuspocus protocol and is checked
      // in onAuthenticate, which also decides the role. Doing it twice would mean two
      // sources of truth, and the header variant is not reachable from the frontend.

      // Listeners go up first and queue anything that arrives before the connection
      // object exists. Right now nothing is awaited below, so the queue stays empty --
      // it is here so that adding an await later cannot silently drop the first
      // messages. That failure mode is a race: it depends on how fast the client
      // sends, so it survives testing and shows up in front of an audience.
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

      // create standard request object (Fetch-style) from fastify request object
      const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const webRequest = new Request(`${protocol}://${request.headers.host}${request.url}`, {
        headers: new Headers(request.headers as Record<string, string>), //key value format
        method: request.method,
      });

      // Open Websocket Connection for Document (identified by database id)
      // handleConnection does not attach itself to the socket - forwarding the
      // messages above is mandatory, otherwise nothing happens on the connection.
      client = ws_server.handleConnection(socket, webRequest, { docName: id });

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