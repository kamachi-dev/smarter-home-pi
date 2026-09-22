import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SensorRegistry } from '../../sensors/registry.js';
import { FaceRecognitionEngine } from '../../sensors/camera/faceRecognition.js';
import { SmarterHomeSync } from '../../sync/smarterHomeSync.js';
import { StandbyFrameGenerator } from '../../sensors/camera/standbyGenerator.js';
import { GpioManager } from '../../hardware/gpio.js';
import { RelaySensor } from '../../sensors/relay/index.js';
import { lightLogger } from '../../sensors/relay/logger.js';
import { SensorConfig, SensorType } from '../../types/index.js';
import { getPinByBcmGpio } from '../../hardware/pinout.js';
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

  // Get Raspberry Pi 40-pin header with live assignments and Supabase sensor mapping
  server.get('/api/pins', async () => {
    try {
      const sensorSync = syncGateway.getSensorSync();
      const result = await sensorSync.syncSensorsFromSupabase();
      return {
        pins: result.pins,
        supabaseSensors: result.supabaseSensors,
        supabaseConnected: result.supabaseConnected,
        lastSyncTime: result.lastSyncTime
      };
    } catch (err) {
      return {
        pins: registry.getPinsWithAssignments(),
        supabaseSensors: syncGateway.getSensorSync().getSupabaseSensors(),
        supabaseConnected: false,
        error: (err as Error).message
      };
    }
  });

  // Live Camera MJPEG Video Stream (Supports multi-room ?room=roomId parameter)
  server.get<{ Querystring: { room?: string } }>('/api/camera/stream', async (request, reply) => {
    const { room: roomId } = request.query || {};

    let camSensor: any = null;
    if (roomId) {
      camSensor = registry.getSensor(`sensor-cam-${roomId}`) ||
        registry.getAllSensors().find(s => s.type === 'camera' && (s.config.options?.roomId === roomId || s.config.options?.room_id === roomId));
    }
    
    if (!camSensor) {
      camSensor = registry.getAllSensors().find(s => s.type === 'camera');
    }

    if (!camSensor || typeof camSensor.subscribeStream !== 'function') {
      return reply.code(404).send({ error: 'Camera module not initialized.' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'close',
      'Pragma': 'no-cache'
    });

    const currentFrame = camSensor.getLatestFrame() || StandbyFrameGenerator.generateFrame(640, 480).frameData;
    if (currentFrame) {
      try {
        reply.raw.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${currentFrame.length}\r\n\r\n`);
        reply.raw.write(currentFrame);
        reply.raw.write('\r\n');
      } catch {}
    }

    let isWriting = false;
    let pendingLatestFrame: Buffer | null = null;

    const pushFrame = (frame: Buffer) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) {
        unsubscribe();
        return;
      }

      // If connection is still transmitting previous frame, skip intermediate frames and retain only the newest frame
      if (isWriting) {
        pendingLatestFrame = frame;
        return;
      }

      isWriting = true;
      try {
        const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
        reply.raw.write(header);
        reply.raw.write(frame);
        const flushed = reply.raw.write('\r\n');

        if (!flushed) {
          reply.raw.once('drain', () => {
            isWriting = false;
            if (pendingLatestFrame) {
              const next = pendingLatestFrame;
              pendingLatestFrame = null;
              pushFrame(next);
            }
          });
        } else {
          isWriting = false;
          if (pendingLatestFrame) {
            const next = pendingLatestFrame;
            pendingLatestFrame = null;
            setImmediate(() => pushFrame(next));
          }
        }
      } catch {
        unsubscribe();
      }
    };

    const unsubscribe = camSensor.subscribeStream(pushFrame);

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

  // Relay Light Switch: Toggle or set state
  server.post<{
    Body: {
      gpio?: number;
      sensorId?: string;
      power?: boolean;
      roomId?: string;
    };
  }>('/api/relay/toggle', async (request, reply) => {
    const { gpio, sensorId, power, roomId } = request.body || {};
    let targetRelay: RelaySensor | undefined;

    if (sensorId) {
      targetRelay = registry.getSensor(sensorId) as RelaySensor;
    } else if (gpio !== undefined) {
      targetRelay = registry.getAllSensors().find(s => s.type === 'relay' && s.bcmGpio === gpio) as RelaySensor;
    } else {
      // Default to primary relay (GPIO 17)
      targetRelay = registry.getAllSensors().find(s => s.type === 'relay' && (s.bcmGpio === 17 || s.id === 'sensor-relay-17')) as RelaySensor;
    }

    if (!targetRelay && gpio !== undefined) {
      const pin = getPinByBcmGpio(gpio);
      if (pin) {
        try {
          targetRelay = (await registry.registerSensor({
            id: `sensor-relay-${gpio}`,
            name: `Relay Switch (GPIO ${gpio})`,
            type: 'relay',
            pinNumber: pin.pinNumber,
            bcmGpio: gpio,
            pollIntervalMs: 0,
            enabled: true,
            options: { activeLow: true, roomId }
          }, false)) as RelaySensor;
        } catch {}
      }
    }

    if (!targetRelay) {
      return reply.code(404).send({ error: 'Relay light switch not found for specified pin or ID.' });
    }

    const nextPower = power !== undefined ? Boolean(power) : !targetRelay.getPower();
    targetRelay.setPower(nextPower, 'local_api');

    const targetRoomId = roomId || targetRelay.config.options?.roomId;
    if (targetRoomId) {
      const isAc = Boolean(targetRelay.config.options?.isAcRelay);
      const field = isAc ? 'ac_power' : 'lights_power';
      syncGateway.getSensorSync().updateRoomPower(targetRoomId, field, nextPower).catch(() => {});
    }

    return {
      success: true,
      sensorId: targetRelay.id,
      gpio: targetRelay.bcmGpio,
      power: targetRelay.getPower()
    };
  });

  // Relay Light Switch: Get current state
  server.get<{ Querystring: { gpio?: string } }>('/api/relay/state', async (request) => {
    const { gpio } = request.query || {};
    const bcm = gpio ? parseInt(gpio, 10) : 17;
    const targetRelay = registry.getAllSensors().find(
      s => s.type === 'relay' && (s.bcmGpio === bcm || (bcm === 17 && s.id === 'sensor-relay-17'))
    ) as RelaySensor | undefined;

    return {
      gpio: bcm,
      power: targetRelay ? targetRelay.getPower() : false,
      found: Boolean(targetRelay)
    };
  });

  // Relay Light Switch: Get activity logs
  server.get('/api/relay/logs', async () => {
    return {
      logs: lightLogger.getLogs()
    };
  });

  // Face Recognition: Enrolled Profiles
  server.get('/api/faces', async () => {
    return {
      faces: faceEngine.getEnrolledPeople()
    };
  });

  // Face Recognition: Active neural model roster & matcher diagnostics
  server.get('/api/camera/models', async () => {
    const people = faceEngine.getEnrolledPeople();
    return {
      success: true,
      activeMatcherCount: people.length,
      matchDistanceThreshold: faceEngine.getMatcherThreshold(),
      models: people.map(p => ({
        id: p.id,
        name: p.name,
        role: p.notes || 'Household Member',
        enrolledAt: p.enrolledAt,
        accuracy: p.accuracy ?? 90,
        photoCount: p.photoCount ?? 1,
        descriptorDimension: p.descriptor?.length ?? 0,
        hasDescriptor: Array.isArray(p.descriptor) && p.descriptor.length === 128
      }))
    };
  });

  // Face Recognition: Trigger external model sync from Supabase
  server.post('/api/camera/models/sync', async () => {
    const syncResult = await syncGateway.getModelSync().syncAllModelsFromSupabase();
    return {
      success: true,
      syncedCount: syncResult.count,
      syncedMembers: syncResult.syncedMembers,
      activeModels: faceEngine.getEnrolledPeople().map(p => p.name)
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

  // Face Recognition: Update enrolled person details
  server.put<{
    Params: { id: string };
    Body: {
      name?: string;
      notes?: string;
      accuracy?: number;
    };
  }>('/api/faces/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body || {};
    const updated = faceEngine.updateEnrolledPerson(id, updates);
    if (!updated) {
      return reply.code(404).send({ error: 'Person ID not found.' });
    }
    return { success: true, person: updated };
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
