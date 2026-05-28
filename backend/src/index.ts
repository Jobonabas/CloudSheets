import Fastify from 'fastify'
import sheetsRoutes from './routes/sheets.ts';
import sheets_ws_Routes from './routes/sheets-ws.ts'
import healthRoutes from './routes/health.ts';
import { ws_server } from './webSocket_server.ts'

console.log("geiler Backend Server starting...")

async function start(): Promise<void> {
  // initialize Fastify Server
  const server = Fastify({
    logger: true,
  })

  //use Swagger for API Endpoint Documentation
  await server.register(import('@fastify/swagger'), {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'CloudSheets API',
        description: 'API documentation for CloudSheets',
        version: '1.0.0',
      },
    },
  })

  await server.register(import('@fastify/swagger-ui'), {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject) => swaggerObject,
    transformSpecificationClone: true,
  })
  
  await server.register(sheetsRoutes);
  await server.register(sheets_ws_Routes);
  await server.register(healthRoutes);

  const address = await server.listen({
    host: '127.0.0.1',
    port: 8080
  });
  console.log(`Server listening at ${address}`);
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})