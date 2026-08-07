import Fastify from 'fastify'
import sheetsRoutes from './routes/sheets.ts';
import sheets_ws_Routes from './routes/sheets-ws.ts'
import healthRoutes from './routes/health.ts';
import { ws_server } from './webSocket_server.ts'
import { customErrorHandler } from './utils/errorHandler.ts';
import 'dotenv/config';

console.log("geiler Backend Server starting...")

async function start(): Promise<void> {
  // initialize Fastify Server
  const server = Fastify({
    logger: true,
  })
  server.setErrorHandler(customErrorHandler); // Use Custom Errors

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

  // Bind to 0.0.0.0 so the server is reachable from outside the container
  // (ECS Express health checks and the load balancer cannot reach 127.0.0.1).
  const address = await server.listen({
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? '8080')
  });
  console.log(`Server listening at ${address}`);
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})