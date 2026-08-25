import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';
import { SensorRegistry } from '../../sensors/registry.js';
import { SensorReading, FaceDetectionPayload } from '../../types/index.js';

export const wsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const registry = SensorRegistry.getInstance();
  const clients: Set<WebSocket> = new Set();

  function broadcast(data: object) {
    const msg = JSON.stringify(data);
    for (const client of Array.from(clients)) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  // Subscribe to registry events
  registry.on('reading', (reading: SensorReading) => {
    broadcast({ type: 'sensor_reading', reading });
  });

  registry.on('face_detection', (event: { sensorId: string; sensorName: string } & FaceDetectionPayload) => {
    broadcast({ type: 'face_detection', event });
  });

  server.get('/ws/telemetry', { websocket: true }, (connection: any) => {
    const socket: WebSocket = connection.socket || connection;
    clients.add(socket);

    // Send immediate snapshot on connect
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'initial_state',
        pins: registry.getPinsWithAssignments(),
        sensors: registry.getAllConfigs(),
        readings: registry.getLatestReadings()
      }));
    }

    socket.on('message', async (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'camera_frame' && msg.image) {
          const camSensor = registry.getAllSensors().find(s => s.type === 'camera') as any;
          if (camSensor && typeof camSensor.ingestFrame === 'function') {
            const base64Data = msg.image.replace(/^data:image\/\w+;base64,/, '');
            const frameBuffer = Buffer.from(base64Data, 'base64');
            await camSensor.ingestFrame(frameBuffer);
          }
        }
      } catch {}
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });
};
