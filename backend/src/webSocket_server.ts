import { Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs';
import db from './db.ts'
import { verifyUser } from './utils/verifyUser.ts'

// initialize Hocuspocus Websocket Server
export const ws_server = new Hocuspocus({
    //TODO: add hooks for authentication/persistence here https://tiptap.dev/docs/hocuspocus/server/hooks
    // Single gate for the websocket: identity, sheet lookup and role all happen here.
    //
    // The role has to be decided in this hook and nowhere later. Hocuspocus sends the
    // client its permission scope immediately after onAuthenticate resolves, before
    // onLoadDocument runs -- deciding the role there would be too late to reach the
    // client, and the UI could not lock the sheet for viewers.
    //
    // Note the browser cannot set headers on a websocket, so the token arrives inside
    // the protocol (provider option `token`) rather than as an Authorization header.
    // That is why the route no longer authenticates and this hook is the only check.
    async onAuthenticate({ token, documentName, connectionConfig }) {
    //validate tokens before connection established
    const payload = await verifyUser(token)

    if (!payload?.sub) {
        throw new Error('Unauthorized: Invalid token or user check failed')
      }
    const user_id = payload.sub;

    const sheet = await db('sheets').where({ id: documentName }).first();
    if (!sheet) {
        throw new Error('Not found: unknown sheet')
      }

    let role: 'owner' | 'editor' | 'viewer' | null;
    if (sheet.owner_id === user_id) {
        role = 'owner' //immediate access if owner
      } else {
        //if not owner look up the shared permission
        const permission = await db('permissions')
            .where({ user_id, sheet_id: documentName })
            .first();
        role = permission ? permission.role : null;
      }

    if (!role) {
        throw new Error('Forbidden: no access to this sheet')
      }

    // Viewers may read but not write. Hocuspocus reports this scope to the client so
    // the UI can lock the grid, and drops updates from the connection on its own.
    connectionConfig.readOnly = role === 'viewer';

    return {
        userId: user_id,
        role,
        user: {
            user_id: payload.sub,
            email: payload.email
        },
      }
    },
    async onConnect(data) {
    //Logging
    console.log(`New connection to sheet: ${data.documentName}`)
    },

    // Existence, access and role are already settled in onAuthenticate, so this hook
    // only restores the document. A connection that gets here is allowed to be here.
    async onLoadDocument(data) {
        // load sheet data from db
        const sheet = await db('sheets').where({ id: data.documentName }).first();
        if (sheet && sheet.yjs_snapshot) {
            // append sheet data to Y Document if existing else Y Document starts empty
            Y.applyUpdate(data.document, sheet.yjs_snapshot);
        }
    },
    async onChange(data) {
        // Only allow editor and owner to make changes to document
        if (data.context.role !== 'editor' && data.context.role !== 'owner') {
            return; //Changes are being ignored for viewer role
        }
    },
    // persist the final document state to the DB
    async onStoreDocument(data) {
        const update = Y.encodeStateAsUpdate(data.document);
        await db('sheets').where({ id: data.documentName}).update({ yjs_snapshot: update});
    },
});