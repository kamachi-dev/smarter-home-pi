import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SensorRegistry } from '../../sensors/registry.js';
import { FaceRecognitionEngine } from '../../sensors/camera/faceRecognition.js';
import { SmarterHomeSync } from '../../sync/smarterHomeSync.js';
import { GpioManager } from '../../hardware/gpio.js';
import { SensorConfig, SensorType } from '../../types/index.js';
import { config } from '../../config/env.js';

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
};
