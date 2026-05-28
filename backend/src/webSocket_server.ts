import { Hocuspocus } from '@hocuspocus/server'

// initialize Hocuspocus Websocket Server
export const ws_server = new Hocuspocus({
    //TODO: add hooks for authentication/persistence here
    // async onAuthenticate({ token }) {
    //validate tokens before connection established
    //   return { userId: '123', permissions: ['read', 'write'] }
    // },
    // async onChange({ context }) {
    //   // context.userId is typed as string
    //   console.log(context.userId)
    // },
    async onConnect(data) {
    //Logging
    console.log(`New connection to sheet: ${data.documentName}`)
    },
});