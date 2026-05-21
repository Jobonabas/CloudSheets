import Fastify from 'fastify'
import sheetsRoutes from './routes/sheets.ts';
import healthRoutes from './routes/health.ts';

console.log("geiler Backend Server starting...")

async function start(): Promise<void> {
  const server = Fastify({
    logger: true,
  })

  await server.register(sheetsRoutes)
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