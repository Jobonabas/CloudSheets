import fastify from 'fastify'

console.log("geiler Backend Server starting...")
const server = fastify()

server.get('/ping', async (request, reply) => {
  return 'pong\n'
})

//simple Health Check
server.get('/health', async (request, reply) => {
  return { status: 'ok'};
})

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server listening at ${address}`)
})