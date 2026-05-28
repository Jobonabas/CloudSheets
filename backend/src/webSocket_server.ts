import { Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs';
import db from './db.ts'

// initialize Hocuspocus Websocket Server
export const ws_server = new Hocuspocus({
    //TODO: add hooks for authentication/persistence here https://tiptap.dev/docs/hocuspocus/server/hooks
    // async onAuthenticate({ token }) {
    //validate tokens before connection established
    //   return { userId: '123', permissions: ['read', 'write'] }
    // },
    async onConnect(data) {
    //Logging
    console.log(`New connection to sheet: ${data.documentName}`)
    },

    async onLoadDocument(data) {
        // load sheet data from db
        const sheet = await db('sheets').where({ id: data.documentName }).first();
        if (sheet && sheet.yjs_snapshot) {
            // append sheet data to Y Document if existing else Y Document starts empty
            Y.applyUpdate(data.document, sheet.yjs_snapshot);
        }
    },
    // persist the final document state to the DB
    async onStoreDocument(data) {
        const update = Y.encodeStateAsUpdate(data.document);
        await db('sheets').where({ id: data.documentName}).update({ yjs_snapshot: update});
    },
});