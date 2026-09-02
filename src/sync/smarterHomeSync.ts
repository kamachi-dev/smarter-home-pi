import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { FaceRecognitionEngine } from '../sensors/camera/faceRecognition.js';
import { SensorReading, FaceDetectionPayload } from '../types/index.js';
import { CameraSyncHandler } from './cameraSyncHandler.js';
import { ModelSyncHandler } from './modelSyncHandler.js';
import { TelemetrySyncHandler } from './telemetrySyncHandler.js';
import { config } from '../config/env.js';

export interface SyncStatus {
  lastSyncTime: string | null;
  lastSyncSuccess: boolean;
  lastError: string | null;
  totalSyncs: number;
  failedSyncs: number;
  supabaseConnected: boolean;
}

export class SmarterHomeSync {
  private static instance: SmarterHomeSync;
  private registry: SensorRegistry;
  private faceEngine: FaceRecognitionEngine;
  private supabase: SupabaseClient | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private cameraStreamTimer: NodeJS.Timeout | null = null;
  private cachedHomeId: string | null = null;
  private cachedRooms: any[] = [];
  private cameraSync: CameraSyncHandler;
  private modelSync: ModelSyncHandler;
  private telemetrySync: TelemetrySyncHandler;
  private status: SyncStatus = {
    lastSyncTime: null,
    lastSyncSuccess: false,
    lastError: null,
    totalSyncs: 0,
    failedSyncs: 0,
    supabaseConnected: false
  };

  private constructor() {
    this.registry = SensorRegistry.getInstance();
    this.faceEngine = FaceRecognitionEngine.getInstance();
    this.cameraSync = new CameraSyncHandler({
      supabase: this.supabase,
      getLinkedHomeId: () => this.getLinkedHomeId()
    });
    this.modelSync = new ModelSyncHandler({
      supabase: this.supabase,
      faceEngine: this.faceEngine
    });
    this.telemetrySync = new TelemetrySyncHandler({
      supabase: this.supabase,
      registry: this.registry,
      getLinkedHomeId: () => this.getLinkedHomeId()
    });
    this.initSupabaseRealtime();
    this.setupListeners();
    this.startSyncLoop();
  }

  public static getInstance(): SmarterHomeSync {
    if (!SmarterHomeSync.instance) {
      SmarterHomeSync.instance = new SmarterHomeSync();
    }
    return SmarterHomeSync.instance;
  }

  private async initSupabaseRealtime(): Promise<void> {
    if (!config.supabaseUrl || !config.supabaseKey) {
      console.log('[SmarterHomeSync] Supabase credentials not found in env, using HTTP REST gateway only');
      return;
    }

    try {
      this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
      this.cameraSync.updateSupabaseClient(this.supabase);
      this.modelSync.updateSupabaseClient(this.supabase);
      this.telemetrySync.updateSupabaseClient(this.supabase);
      this.status.supabaseConnected = true;
      console.log('[SmarterHomeSync] Supabase Realtime connected successfully');

      // 1. Initial sync of models & rooms from Supabase
      this.modelSync.syncAllModelsFromSupabase().catch(() => {});
      this.syncRoomsFromSupabase().catch(() => {});

      // 2. Subscribe to Realtime rooms table changes
      this.supabase
        .channel('pi-rooms-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
          console.log('[SmarterHomeSync] Received Supabase Realtime rooms update, refreshing room cameras...');
          this.syncRoomsFromSupabase().catch(() => {});
        })
        .subscribe();
    } catch (err) {
      console.warn('[SmarterHomeSync] Supabase Realtime init error:', (err as Error).message);
    }
  }

  public async syncRoomsFromSupabase(): Promise<void> {
    let rooms: any[] | null = null;

    if (config.smarterHomeApiUrl && config.smarterHomeToken) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/rooms`;
        const res = await fetch(targetUrl, {
          headers: {
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data && Array.isArray(data.rooms) && data.rooms.length > 0) {
            rooms = data.rooms;
          }
        }
      } catch (err) {
        console.warn('[SmarterHomeSync] Server API /api/rooms fetch warning:', (err as Error).message);
      }
    }

    if (!rooms && this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        if (homeId) {
          const { data: dbRooms, error } = await this.supabase
            .from('rooms')
            .select('*')
            .eq('home_id', homeId);
          if (!error && dbRooms && Array.isArray(dbRooms)) {
            rooms = dbRooms;
          }
        }
      } catch {}
    }

    if (rooms && Array.isArray(rooms)) {
      try {
        this.cachedRooms = rooms;
        for (const room of rooms) {
          const camSensorId = `sensor-cam-${room.id}`;
          if (room.camera_enabled && room.camera_ip) {
            const hasAuth = Boolean(room.camera_username && room.camera_password);
            const authPrefix = hasAuth
              ? `${encodeURIComponent(room.camera_username)}:${encodeURIComponent(room.camera_password)}@`
              : (room.camera_username ? `${encodeURIComponent(room.camera_username)}@` : '');
            const realStreamUrl = `rtsp://${authPrefix}${room.camera_ip}:554/stream1`;

            const existing = this.registry.getSensor(camSensorId);
            const needsUpdate = !existing || 
              existing.config.options?.streamUrl !== realStreamUrl || 
              existing.config.options?.ip !== room.camera_ip;

            if (needsUpdate) {
              const displayUrl = `rtsp://${room.camera_username ? `${room.camera_username}:***@` : ''}${room.camera_ip}:554/stream1`;
              console.log(`[SmarterHomeSync] 📹 Initializing RTSP stream for room "${room.name}" (${room.camera_ip}) -> [${displayUrl}]`);
              await this.registry.registerSensor({
                id: camSensorId,
                name: `${room.name} Camera`,
                type: 'camera',
                pollIntervalMs: 2000,
                enabled: true,
                options: {
                  roomId: room.id,
                  ip: room.camera_ip,
                  user: room.camera_username,
                  password: room.camera_password,
                  streamUrl: realStreamUrl
                }
              }, false);
            }
          } else {
            const existing = this.registry.getSensor(camSensorId);
            if (existing) {
              await this.registry.unregisterSensor(camSensorId, false);
            }
          }
        }

        if (this.registry.getSensor('sensor-cam-1')) {
          await this.registry.unregisterSensor('sensor-cam-1', false);
        }
      } catch (err) {
        console.warn('[SmarterHomeSync] Failed to sync rooms cameras from Supabase:', (err as Error).message);
      }
    }
  }

  private setupListeners(): void {
    this.registry.on('face_detection', async (event: { sensorId: string; sensorName: string } & FaceDetectionPayload) => {
      if (event.detected) {
        await this.telemetrySync.sendFaceAlertToSmarterHome(event);
      }
    });

    const bindCamera = (sensor: any) => {
      if (sensor && sensor.type === 'camera') {
        const roomId = sensor.config?.options?.roomId || sensor.config?.options?.room_id;
        sensor.on('frame', (frame: Buffer) => {
          this.cameraSync.sendLiveFrame(frame, sensor.getFaceDetection?.(), roomId).catch(() => {});
        });

        sensor.on('person_arrival', (arrival: any) => {
          this.cameraSync.sendFirstFrameArrival(arrival, sensor.id, sensor.config?.name || 'Room Camera').catch(() => {});
        });
      }
    };

    this.registry.getAllSensors().forEach(bindCamera);
    this.registry.on('sensor_registered', bindCamera);
  }

  public async getRooms(): Promise<any[]> {
    if (config.smarterHomeApiUrl && config.smarterHomeToken) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/rooms`;
        const res = await fetch(targetUrl, {
          headers: {
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data && Array.isArray(data.rooms) && data.rooms.length > 0) {
            this.cachedRooms = data.rooms;
            return this.cachedRooms;
          }
        }
      } catch (err) {
        console.warn('[SmarterHomeSync] Smarter-Home server /api/rooms HTTP fetch warning:', (err as Error).message);
      }
    }

    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        if (homeId) {
          const { data } = await this.supabase.from('rooms').select('*').eq('home_id', homeId);
          if (data && Array.isArray(data) && data.length > 0) {
            this.cachedRooms = data;
            return this.cachedRooms;
          }
        }
      } catch {}
    }

    return this.cachedRooms;
  }

  private async getLinkedHomeId(): Promise<string | null> {
    if (this.cachedHomeId) return this.cachedHomeId;
    if (!this.supabase || !config.smarterHomeToken) return null;
    try {
      const { data } = await this.supabase
        .from('home_tokens')
        .select('home_id')
        .eq('token', config.smarterHomeToken)
        .maybeSingle();
      if (data?.home_id) {
        this.cachedHomeId = data.home_id;
        return this.cachedHomeId;
      }

      const { data: homeData } = await this.supabase
        .from('homes')
        .select('id')
        .eq('id', config.smarterHomeToken)
        .maybeSingle();
      if (homeData?.id) {
        this.cachedHomeId = homeData.id;
        return this.cachedHomeId;
      }
    } catch {}
    return null;
  }

  public async sendLiveFrameToSmarterHome(frameBuffer: Buffer, faceDetection?: FaceDetectionPayload): Promise<boolean> {
    return this.cameraSync.sendLiveFrame(frameBuffer, faceDetection);
  }

  public async sendFirstFrameArrivalToSmarterHome(
    arrival: { person: string; confidence: number; frame: Buffer; timestamp: string; box?: any },
    sensorId: string,
    sensorName: string
  ): Promise<boolean> {
    return this.cameraSync.sendFirstFrameArrival(arrival, sensorId, sensorName);
  }

  private startSyncLoop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.cameraStreamTimer) clearInterval(this.cameraStreamTimer);

    this.syncTimer = setInterval(async () => {
      const success = await this.telemetrySync.syncTelemetry();
      const isoNow = new Date().toISOString();
      this.status.totalSyncs++;
      this.status.lastSyncTime = isoNow;
      this.status.lastSyncSuccess = success;
      if (success) {
        this.status.lastError = null;
      } else {
        this.status.failedSyncs++;
        this.status.lastError = 'Unable to reach Supabase Realtime or HTTP Gateway';
      }
    }, config.syncIntervalMs);

    this.cameraStreamTimer = setInterval(async () => {
      const cameraSensors = this.registry.getAllSensors().filter(s => s.type === 'camera') as any[];
      for (const cam of cameraSensors) {
        if (cam && typeof cam.getLatestFrame === 'function') {
          const frame = cam.getLatestFrame();
          if (frame) {
            const roomId = cam.config?.options?.roomId || cam.config?.options?.room_id;
            await this.cameraSync.sendLiveFrame(frame, cam.getFaceDetection?.(), roomId).catch(() => {});
          }
        }
      }
    }, 300);
  }

  public async syncTelemetry(): Promise<boolean> {
    return this.telemetrySync.syncTelemetry();
  }

  public async sendFaceAlertToSmarterHome(event: { sensorId: string; sensorName: string } & FaceDetectionPayload): Promise<boolean> {
    return this.telemetrySync.sendFaceAlertToSmarterHome(event);
  }

  public getStatus(): SyncStatus {
    return { ...this.status };
  }

  public getSupabaseClient(): SupabaseClient | null {
    return this.supabase;
  }

  public async getHomeId(): Promise<string | null> {
    return this.getLinkedHomeId();
  }
}
