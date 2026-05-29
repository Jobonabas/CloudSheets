import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'
import db from '../db.ts'
import { hasPermission } from '../utils/permissions.ts'
import { GETSheetSchema, POSTSheetSchema, DELETESheetSchema, SHARESheetSchema } from '../schemas/sheet.ts'

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
    schema: { ...GETSheetSchema },
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
    schema: { ...POSTSheetSchema },
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
    url: '/sheets/:id',
    method: 'DELETE',
    schema: { ...DELETESheetSchema },
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

  // Share Sheet Endpoint
  fastify.route({
    url: '/sheets/:id/share',
    method: 'POST',
    schema: {...SHARESheetSchema},
    handler: async function myHandler(request, reply) {
      const user_id = 'demo-user-id' // request.user.id; Cognito/ JWT Token not implemented yet // TODO: Replace with real user ID from auth

      const { id } = request.params as { id: string };
      const { email, role } = request.body as { email: string; role: string };

      const sheet = await db('sheets').where({ id }).first();
      if (!sheet) {
        throw fastify.httpErrors.badRequest('Sheet not found');
      }

      const invited_user = await db('users').where({ email: email }).first() //retrieve invited user matching email
      if (!invited_user) {
        throw fastify.httpErrors.badRequest( 'User using this email adress does not exist')
      }

      //check if requesting user is owner or has editor role
      if(user_id !== sheet.owner_id ) {
        if (!await hasPermission(user_id, id, 'editor')) {
          throw fastify.httpErrors.badRequest('Not authorized for sharing this sheet')
        }
      }
      
      await db('permissions').insert({
        sheet_id: id,
        user_id: invited_user.id,
        role: role
      })

      reply.send({
        message: `${ role } Permission for User ${ email } added succesfully.`,
        success: true,
        data: null,
      })
    },
  })
}

