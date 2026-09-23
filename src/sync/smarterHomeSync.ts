import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { FaceRecognitionEngine } from '../sensors/camera/faceRecognition.js';
import { SensorReading, FaceDetectionPayload } from '../types/index.js';
import { CameraSyncHandler } from './cameraSyncHandler.js';
import { ModelSyncHandler } from './modelSyncHandler.js';
import { TelemetrySyncHandler } from './telemetrySyncHandler.js';
import { LightingSyncHandler } from './lightingSyncHandler.js';
import { TemperatureSyncHandler } from './temperatureSyncHandler.js';
import { AcSyncHandler } from './acSyncHandler.js';
import { SensorSyncHandler } from './sensorSyncHandler.js';
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
  private lightingSync: LightingSyncHandler;
  private temperatureSync: TemperatureSyncHandler;
  private acSync: AcSyncHandler;
  private sensorSync: SensorSyncHandler;
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
    this.lightingSync = new LightingSyncHandler({
      supabase: this.supabase,
      registry: this.registry,
      getLinkedHomeId: () => this.getLinkedHomeId()
    });
    this.temperatureSync = new TemperatureSyncHandler({
      supabase: this.supabase,
      registry: this.registry,
      getLinkedHomeId: () => this.getLinkedHomeId()
    });
    this.acSync = new AcSyncHandler({
      supabase: this.supabase,
      registry: this.registry,
      getLinkedHomeId: () => this.getLinkedHomeId()
    });
    this.sensorSync = new SensorSyncHandler({
      supabase: this.supabase,
      registry: this.registry,
      getLinkedHomeId: () => this.getLinkedHomeId()
    });
    this.initSupabaseRealtime();
    this.setupListeners();
    this.startSyncLoop();
  }

  public getSensorSync(): SensorSyncHandler {
    return this.sensorSync;
  }

  public getModelSync(): ModelSyncHandler {
    return this.modelSync;
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
      this.lightingSync.updateSupabaseClient(this.supabase);
      this.temperatureSync.updateSupabaseClient(this.supabase);
      this.acSync.updateSupabaseClient(this.supabase);
      this.sensorSync.updateSupabaseClient(this.supabase);
      this.status.supabaseConnected = true;
      console.log('[SmarterHomeSync] Supabase Realtime connected successfully');

      // Authenticate if user credentials are provided (enables full RLS authorized CRUD)
      if (config.supabaseUserEmail && config.supabaseUserPassword) {
        try {
          const { error: authErr } = await this.supabase.auth.signInWithPassword({
            email: config.supabaseUserEmail,
            password: config.supabaseUserPassword
          });
          if (authErr) {
            console.warn('[SmarterHomeSync] Supabase user authentication warning:', authErr.message);
          } else {
            console.log(`[SmarterHomeSync] Authenticated as ${config.supabaseUserEmail} (RLS CRUD authorized)`);
            this.modelSync.setupRealtimeListeners();
          }
        } catch (authEx) {
          console.warn('[SmarterHomeSync] Auth exception:', (authEx as Error).message);
        }
      }

      // 1. Initial sync of models & rooms from Supabase
      this.modelSync.syncAllModelsFromSupabase().catch(() => {});
      this.syncRoomsFromSupabase().catch(() => {});

      // 2. Subscribe to Realtime rooms table changes
      this.supabase
        .channel('pi-rooms-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, (payload) => {
          console.log('[SmarterHomeSync] Received Supabase Realtime rooms update, refreshing room cameras, lights & AC relays...');
          if (payload.new) {
            this.lightingSync.handleRoomRecordUpdate(payload.new);
            this.acSync.handleRoomRecordUpdate(payload.new);
          }
          this.syncRoomsFromSupabase().catch(() => {});
        })
        .subscribe();

      // 3. Subscribe to Realtime lighting toggles (home_states: key='lights' and lighting_states)
      this.supabase
        .channel('pi-lighting-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'home_states' }, (payload) => {
          const record = payload.new as any;
          if (record && record.key === 'lights') {
            this.lightingSync.handleStateUpdate(record.key, record.value);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lighting_states' }, (payload) => {
          const record = payload.new as any;
          if (record && record.key === 'lights') {
            this.lightingSync.handleStateUpdate(record.key, record.value);
          }
        })
        .subscribe();
    } catch (err) {
      console.warn('[SmarterHomeSync] Supabase Realtime init error:', (err as Error).message);
    }
  }

  public async syncRoomsFromSupabase(): Promise<void> {
    let rooms: any[] | null = null;

    // 1. Direct Supabase query (primary source of truth)
    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        let query = this.supabase.from('rooms').select('*');
        if (homeId) {
          query = query.eq('home_id', homeId);
        }
        const { data: dbRooms, error } = await query;
        if (!error && dbRooms && Array.isArray(dbRooms) && dbRooms.length > 0) {
          rooms = dbRooms;
        }
      } catch (err) {
        console.warn('[SmarterHomeSync] Direct Supabase rooms query error:', (err as Error).message);
      }
    }

    // 2. Secondary fallback only if direct Supabase returned no rooms and non-vercel endpoint
    if (!rooms && config.smarterHomeApiUrl && config.smarterHomeToken && !config.smarterHomeApiUrl.includes('vercel.app')) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/rooms`;
        const res = await fetch(targetUrl, {
          headers: {
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          signal: AbortSignal.timeout(2000)
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

    if (rooms && Array.isArray(rooms)) {
      try {
        const mappedRooms = rooms.map(room => {
          const isRpi = room.camera_ip === 'rpi-camera' || room.camera_type === 'rpi' || (room.camera_stream_url && room.camera_stream_url.startsWith('rpicam'));
          const isTapo = !isRpi && (room.camera_enabled || Boolean(room.camera_ip));
          return {
            ...room,
            camera_type: isRpi ? 'rpi' : (isTapo ? 'tapo' : 'none')
          };
        });
        this.cachedRooms = mappedRooms;
        this.registry.emit('rooms_updated', mappedRooms);
        for (const room of mappedRooms) {
          const camSensorId = `sensor-cam-${room.id}`;
          const isRpi = room.camera_type === 'rpi';
          if (room.camera_enabled && (isRpi || room.camera_ip)) {
            let realStreamUrl: string;
            let cameraType: 'rpi' | 'tapo';
            if (isRpi) {
              realStreamUrl = 'rpicam://0';
              cameraType = 'rpi';
            } else {
              const hasAuth = Boolean(room.camera_username && room.camera_password);
              const authPrefix = hasAuth
                ? `${encodeURIComponent(room.camera_username)}:${encodeURIComponent(room.camera_password)}@`
                : (room.camera_username ? `${encodeURIComponent(room.camera_username)}@` : '');
              realStreamUrl = room.camera_stream_url || `rtsp://${authPrefix}${room.camera_ip}:554/stream1`;
              cameraType = 'tapo';
            }

            const existing = this.registry.getSensor(camSensorId);
            const needsUpdate = !existing || 
              existing.config.options?.streamUrl !== realStreamUrl || 
              existing.config.options?.cameraType !== cameraType;

            if (needsUpdate) {
              console.log(`[SmarterHomeSync] 📹 Initializing ${cameraType.toUpperCase()} camera for "${room.name}" -> [${realStreamUrl}]`);
              await this.registry.registerSensor({
                id: camSensorId,
                name: `${room.name} Camera`,
                type: 'camera',
                pollIntervalMs: 2000,
                enabled: true,
                options: {
                  roomId: room.id,
                  cameraType,
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

        // Sync room light switch GPIO pin assignments and relays
        await this.lightingSync.syncRoomsLighting(rooms);

        // Sync room AC relay GPIO pin assignments and relays
        await this.acSync.syncRoomsAc(rooms);

        // Sync room temperature sensor GPIO pin assignments (e.g. DHT22 on GPIO 4)
        await this.temperatureSync.syncRoomsTemperature(rooms);

        // Sync all hardware sensors & GPIO pin mapping via SensorSyncHandler
        await this.sensorSync.syncSensorsFromSupabase();
      } catch (err) {
        console.warn('[SmarterHomeSync] Failed to sync rooms cameras/lighting/ac/temperature from Supabase:', (err as Error).message);
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

        sensor.on('motion_detected', (motion: any) => {
          this.cameraSync.sendMotionAlert(motion).catch(() => {});
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
    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        let query = this.supabase.from('rooms').select('*');
        if (homeId) {
          query = query.eq('home_id', homeId);
        }
        const { data, error } = await query;
        if (!error && data && Array.isArray(data) && data.length > 0) {
          this.cachedRooms = data.map(room => {
            const isRpi = room.camera_ip === 'rpi-camera' || room.camera_type === 'rpi' || (room.camera_stream_url && room.camera_stream_url.startsWith('rpicam'));
            const isTapo = !isRpi && (room.camera_enabled || Boolean(room.camera_ip));
            return {
              ...room,
              camera_type: isRpi ? 'rpi' : (isTapo ? 'tapo' : 'none')
            };
          });
          return this.cachedRooms;
        }
      } catch (err) {
        console.warn('[SmarterHomeSync] Failed to query Supabase rooms:', (err as Error).message);
      }
    }

    if (this.cachedRooms && this.cachedRooms.length > 0) {
      return this.cachedRooms;
    }

    if (config.smarterHomeApiUrl && config.smarterHomeToken && !config.smarterHomeApiUrl.includes('vercel.app')) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/rooms`;
        const res = await fetch(targetUrl, {
          headers: {
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          signal: AbortSignal.timeout(2000)
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

    return this.cachedRooms;
  }

  public getCachedRooms(): any[] {
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
      if (this.cachedRooms.length > 0) {
        await this.temperatureSync.syncReadingsToRooms(this.cachedRooms).catch(() => {});
      }
      this.modelSync.syncAllModelsFromSupabase().catch(() => {});
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
