import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config/env.js';
import { apiRoutes } from './server/routes/api.js';
import { wsRoutes } from './server/routes/ws.js';
import { dashboardHtml } from './server/dashboard.js';
import { SensorRegistry } from './sensors/registry.js';
import { FaceRecognitionEngine } from './sensors/camera/faceRecognition.js';
import { SmarterHomeSync } from './sync/smarterHomeSync.js';
import { GpioManager } from './hardware/gpio.js';

async function bootstrap() {
  const app = fastify({
    logger: true
  });

  // Enable CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  // Enable WebSocket
  await app.register(websocket);

  // Register routes
  await app.register(apiRoutes);
  await app.register(wsRoutes);

  // Serve minimal dashboard
  app.get('/', async (request, reply) => {
    reply.type('text/html').send(dashboardHtml);
  });

  // Initialize hardware & subsystems
  const gpio = GpioManager.getInstance();
  const registry = SensorRegistry.getInstance();
  const faceEngine = FaceRecognitionEngine.getInstance();
  const syncGateway = SmarterHomeSync.getInstance();

  console.log('====================================================');
  console.log('  🚀 Smarter Home Pi - Controller Server Online     ');
  console.log(`  📍 Environment: ${gpio.isHardwareMode() ? 'Native RPi' : 'Simulated / Virtual'}`);
  console.log(`  🌐 Dashboard:   http://${config.host}:${config.port}`);
  console.log(`  🔄 Bridge Target: ${config.smarterHomeApiUrl}`);
  console.log('====================================================');

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down gracefully...');
    for (const sensor of registry.getAllSensors()) {
      await sensor.cleanup();
    }
    gpio.cleanupAll();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
