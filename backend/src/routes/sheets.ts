import { type FastifyInstance, type FastifyPluginOptions } from 'fastify'
import Sensible from '@fastify/sensible'
import db from '../db.ts'
import { hasPermission } from '../utils/permissions.ts'
import { isValidUUID } from '../utils/isValidUUID.ts'
import { GETSheetSchema, POSTSheetSchema, DELETESheetSchema, SHARESheetSchema } from '../schemas/sheet.ts'
import type { Sheet } from '../interfaces/sheet.ts'
import { verifyJWT } from '../utils/verifyJWT.ts'


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
      let payload = await verifyJWT(request.headers.authorization); //get Client-Side Stored JWT Token from Request
      if (!payload?.sub) {
        throw fastify.httpErrors.unauthorized('Invalid Session') //Invalid or no Token
      }
      const user_id = payload.sub; //get UserId from Cognito Payload

      const userSheets = await db('sheets') // get user sheets
        .where({ owner_id: user_id }) //(with owner check)
        .select('id', 'title', 'owner_id', 'created_at', 'updated_at'); // get only relevant data (no snapshot)

      const permissions = await db('permissions').where({ user_id: user_id});
      let sharedSheets: Array<Sheet> = [];

      //load shared sheets if any permissions for userid available
      if (permissions && permissions.length > 0) {
        const sheetIds = permissions.map((entry: any) => entry.sheet_id);
        sharedSheets = await db('sheets')
          .whereIn('id', sheetIds)
          .select('id', 'title', 'owner_id', 'created_at', 'updated_at');
      }

      if((!userSheets && !sharedSheets) || (userSheets.length === 0 && sharedSheets.length === 0)) {
        throw fastify.httpErrors.notFound('No sheets found');
      }
      
      reply.send({
          message: 'sheets listed successfully',
          success: true,
          userSheets, 
          sharedSheets
      })
    },
  })

  // POST Endpoint
  fastify.route({
    url: '/sheets',
    method: 'POST',
    schema: { ...POSTSheetSchema },
    handler: async function myHandler(request, reply) {
      const data = request.body as Sheet

      let payload = await verifyJWT(request.headers.authorization); 
      if (!payload?.sub) {
        throw fastify.httpErrors.unauthorized('Invalid Session') 
      }
      const user_id = payload.sub; //get owner ID (current User) from Cognito Payload

      if (!data?.title || !data?.id) {
        throw fastify.httpErrors.badRequest(
          'Please ensure the sheet is valid',
        )
      }
      await db('sheets').insert({
        id: data.id,
        title: data.title,
        owner_id: user_id,
        yjs_snapshot: data.yjs_snapshot,
        updated_at: data.updated_at,
        created_at: data.created_at,
      })

      reply.send({
        message: 'Sheet added succesfully.',
        success: true,
        //data: null,
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

      if (!isValidUUID(id)) {
        throw fastify.httpErrors.badRequest('Invalid sheet ID');
      }

      let payload = await verifyJWT(request.headers.authorization); 
      if (!payload?.sub) {
        throw fastify.httpErrors.unauthorized('Invalid Session') 
      }
      const user_id = payload.sub;

      const sheet = await db('sheets').where({ id }).first();
      if (!sheet) { 
        throw fastify.httpErrors.notFound(
          'Sheet not found.',
        )
       }
      if (sheet.owner_id !== user_id) { 
        throw fastify.httpErrors.forbidden(
          'Sheet not deleted. Not authorized',
        )
       }
      await db('sheets').where({ id }).del(); // delete sheet
      reply.send({
        message: 'Sheet deleted successfully',
        success: true,
        //data: null
      });
    },
  })

  // Share Sheet Endpoint
  fastify.route({
    url: '/sheets/:id/share',
    method: 'POST',
    schema: {...SHARESheetSchema},
    handler: async function myHandler(request, reply) {
      let payload = await verifyJWT(request.headers.authorization); 
      if (!payload?.sub) {
        throw fastify.httpErrors.unauthorized('Invalid Session') 
      }
      const user_id = payload.sub;

      const { id } = request.params as { id: string };
      
      if (!isValidUUID(id)) {
        throw fastify.httpErrors.badRequest('Invalid sheet ID');
      }

      const { email, role } = request.body as { email: string; role: string };
      
      const sheet = await db('sheets').where({ id }).first();
      if (!sheet) {
        throw fastify.httpErrors.notFound('Sheet not found');
      }

      const invited_user = await db('users').where({ email: email }).first() //retrieve invited user matching email
      if (!invited_user) {
        throw fastify.httpErrors.notFound( 'User using this email adress does not exist')
      }
      //check if requesting user is owner or has editor role
      if(user_id !== sheet.owner_id ) {
        if (!await hasPermission(user_id, id, 'editor')) {
          throw fastify.httpErrors.forbidden('Not authorized for sharing this sheet')
        }
      }

      // check if invited user already has Permission
      const existingPermission = await db('permissions').where({ sheet_id: id, user_id: invited_user.id }).first();
      if(existingPermission) {
        if(existingPermission.role !== role) {
          //update role if already exists
          await db('permissions').where({ sheet_id: id, user_id: invited_user.id}).update({role});
          reply.send({
            message: `Permission for User ${email} updated to ${role}.`,
            success: true,
          });
          return;
        } else {
          throw fastify.httpErrors.badRequest('User already has this permission.')
        }
      }
      // Insert new permission if no permission exists
      await db('permissions').insert({
        sheet_id: id,
        user_id: invited_user.id,
        role: role
      })

      reply.send({
        message: `${ role } Permission for User ${ email } added succesfully.`,
        success: true,
        //data: null,
      })
    },
  })
}

