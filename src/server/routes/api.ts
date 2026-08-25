import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SensorRegistry } from '../../sensors/registry.js';
import { FaceRecognitionEngine } from '../../sensors/camera/faceRecognition.js';
import { SmarterHomeSync } from '../../sync/smarterHomeSync.js';
import { GpioManager } from '../../hardware/gpio.js';
import { SensorConfig, SensorType } from '../../types/index.js';
import { config, saveHubConfig } from '../../config/env.js';

export const apiRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const registry = SensorRegistry.getInstance();
  const faceEngine = FaceRecognitionEngine.getInstance();
  const syncGateway = SmarterHomeSync.getInstance();
  const gpioManager = GpioManager.getInstance();
  const startTime = Date.now();

  // Controller overall health & status
  server.get('/api/status', async () => {
    return {
      status: 'running',
      isHardware: gpioManager.isHardwareMode(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      version: '1.0.0',
      sensorsCount: registry.getAllSensors().length,
      smarterHomeApiUrl: config.smarterHomeApiUrl,
      sync: syncGateway.getStatus()
    };
  });

  // Get Raspberry Pi 40-pin header with live assignments
  server.get('/api/pins', async () => {
    return {
      pins: registry.getPinsWithAssignments()
    };
  });

  // Live Camera MJPEG Video Stream (RPi Camera Module / USB)
  server.get('/api/camera/stream', async (request, reply) => {
    const camSensor = registry.getAllSensors().find(s => s.type === 'camera') as any;
    if (!camSensor || typeof camSensor.subscribeStream !== 'function') {
      return reply.code(404).send({ error: 'Camera module not initialized.' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'close',
      'Pragma': 'no-cache'
    });

    const currentFrame = camSensor.getLatestFrame();
    if (currentFrame) {
      try {
        reply.raw.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${currentFrame.length}\r\n\r\n`);
        reply.raw.write(currentFrame);
        reply.raw.write('\r\n');
      } catch {}
    }

    const unsubscribe = camSensor.subscribeStream((frame: Buffer) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) {
        unsubscribe();
        return;
      }
      try {
        reply.raw.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        reply.raw.write(frame);
        reply.raw.write('\r\n');
      } catch {
        unsubscribe();
      }
    });

    request.raw.on('close', () => {
      unsubscribe();
    });
  });

  // Camera single frame snapshot
  server.get('/api/camera/snapshot', async (request, reply) => {
    const camSensor = registry.getAllSensors().find(s => s.type === 'camera') as any;
    const frame: Buffer | null = camSensor && typeof camSensor.getLatestFrame === 'function'
      ? camSensor.getLatestFrame()
      : null;

    if (!frame) {
      return reply.code(503).send({ error: 'Camera frame not available yet.' });
    }

    reply.type('image/jpeg').send(frame);
  });

  // Ingest camera frame and run facial recognition
  server.post<{
    Body: {
      image: string; // Base64 data URL or raw base64 string
    };
  }>('/api/camera/frame', async (request, reply) => {
    const { image } = request.body || {};
    if (!image) {
      return reply.code(400).send({ error: 'Image data is required.' });
    }

    const camSensor = registry.getAllSensors().find(s => s.type === 'camera') as any;
    if (!camSensor) {
      return reply.code(404).send({ error: 'Camera sensor is not registered.' });
    }

    try {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const frameBuffer = Buffer.from(base64Data, 'base64');
      const result = await camSensor.ingestFrame(frameBuffer);
      return { success: true, detection: result.detection };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // Get all registered sensors
  server.get('/api/sensors', async () => {
    return {
      sensors: registry.getAllConfigs(),
      readings: registry.getLatestReadings()
    };
  });

  // Register or update a sensor assignment to a pin
  server.post<{
    Body: {
      id?: string;
      name: string;
      type: SensorType;
      pinNumber?: number;
      pollIntervalMs?: number;
      enabled?: boolean;
      options?: Record<string, any>;
    };
  }>('/api/sensors', async (request, reply) => {
    const body = request.body;
    if (!body.name || !body.type) {
      return reply.code(400).send({ error: 'Sensor "name" and "type" are required.' });
    }

    const sensorId = body.id || `sensor-${body.type}-${Date.now().toString(36)}`;
    const sensorConfig: SensorConfig = {
      id: sensorId,
      name: body.name,
      type: body.type,
      pinNumber: body.pinNumber,
      pollIntervalMs: body.pollIntervalMs || 2500,
      enabled: body.enabled !== false,
      options: body.options || {}
    };

    try {
      const sensor = await registry.registerSensor(sensorConfig);
      return { success: true, sensor: sensor.config };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Remove a sensor
  server.delete<{ Params: { id: string } }>('/api/sensors/:id', async (request, reply) => {
    const { id } = request.params;
    const removed = await registry.unregisterSensor(id);
    if (!removed) {
      return reply.code(404).send({ error: `Sensor with ID "${id}" not found.` });
    }
    return { success: true, message: `Sensor ${id} removed.` };
  });

  // Get current readings from all sensors
  server.get('/api/sensors/readings', async () => {
    return {
      readings: registry.getLatestReadings(),
      timestamp: new Date().toISOString()
    };
  });

  // Force immediate read on a specific sensor
  server.get<{ Params: { id: string } }>('/api/sensors/:id/read', async (request, reply) => {
    const { id } = request.params;
    const sensor = registry.getSensor(id);
    if (!sensor) {
      return reply.code(404).send({ error: `Sensor with ID "${id}" not found.` });
    }
    try {
      const reading = await sensor.read();
      return { reading };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // Face Recognition: Enrolled Profiles
  server.get('/api/faces', async () => {
    return {
      faces: faceEngine.getEnrolledPeople()
    };
  });

  // Face Recognition: Enroll person (basic)
  server.post<{
    Body: {
      name: string;
      notes?: string;
    };
  }>('/api/faces', async (request, reply) => {
    const { name, notes } = request.body;
    if (!name || name.trim().length === 0) {
      return reply.code(400).send({ error: 'Name is required to enroll a person.' });
    }
    const person = faceEngine.enrollPerson(name.trim(), notes);
    return { success: true, person };
  });

  // Face Recognition: Train AI model with 10+ photos
  server.post<{
    Body: {
      name: string;
      notes?: string;
      photos: string[]; // Base64 data URLs or image URLs
      id?: string;
    };
  }>('/api/faces/train', async (request, reply) => {
    const { name, notes, photos, id } = request.body;
    if (!name || !photos || !Array.isArray(photos)) {
      return reply.code(400).send({ error: 'Name and photos array are required.' });
    }
    if (photos.length < 10) {
      return reply.code(400).send({
        error: `At least 10 different photos are required for AI training. Received: ${photos.length}`
      });
    }

    try {
      const person = await faceEngine.trainPersonWithPhotos(name.trim(), photos, notes, id);
      return { success: true, person, message: `Successfully trained ${photos.length} photos into face recognition library.` };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Face Recognition: Delete enrolled person
  server.delete<{ Params: { id: string } }>('/api/faces/:id', async (request, reply) => {
    const { id } = request.params;
    const removed = faceEngine.removeEnrolledPerson(id);
    if (!removed) {
      return reply.code(404).send({ error: 'Person ID not found.' });
    }
    return { success: true };
  });

  // Smarter-Home Sync: Status & Trigger
  server.get('/api/sync/status', async () => {
    return {
      targetUrl: config.smarterHomeApiUrl,
      syncStatus: syncGateway.getStatus()
    };
  });

  server.post('/api/sync/trigger', async () => {
    const success = await syncGateway.syncTelemetry();
    return {
      success,
      syncStatus: syncGateway.getStatus()
    };
  });

  // Permanent Token & Cloud Link Configuration
  server.get('/api/config/token', async () => {
    return {
      token: config.smarterHomeToken || '',
      apiUrl: config.smarterHomeApiUrl,
      linked: Boolean(config.smarterHomeToken),
      syncStatus: syncGateway.getStatus()
    };
  });

  server.post<{
    Body: {
      token: string;
      apiUrl?: string;
    };
  }>('/api/config/token', async (request, reply) => {
    const { token, apiUrl } = request.body || {};
    if (token === undefined) {
      return reply.code(400).send({ error: 'Token string is required.' });
    }

    saveHubConfig(token.trim(), apiUrl?.trim());
    await syncGateway.initCameraBroadcast();
    const syncSuccess = await syncGateway.syncTelemetry();

    return {
      success: true,
      token: config.smarterHomeToken,
      apiUrl: config.smarterHomeApiUrl,
      syncSuccess,
      message: config.smarterHomeToken ? 'Permanent token saved and connected to Smarter Home!' : 'Token cleared.'
    };
  });
};
