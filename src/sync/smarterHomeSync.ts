import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { FaceRecognitionEngine } from '../sensors/camera/faceRecognition.js';
import { SensorReading, FaceDetectionPayload, TemperatureReading } from '../types/index.js';
import { CameraSyncHandler } from './cameraSyncHandler.js';
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
  private cachedHomeId: string | null = null;
  private cameraSync: CameraSyncHandler;
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
      this.status.supabaseConnected = true;
      console.log('[SmarterHomeSync] Supabase Realtime connected successfully');

      // 1. Initial sync of family members & rooms from Supabase
      this.syncFamilyMembersFromSupabase();
      this.syncRoomsFromSupabase();

      // 2. Subscribe to Realtime family_members & rooms table changes
      this.supabase
        .channel('pi-family-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members' }, (payload) => {
          console.log('[SmarterHomeSync] Received Supabase Realtime family_members update:', payload.eventType);
          if (payload.new && (payload.new as any).name) {
            const member = payload.new as any;
            if (member.photo_urls && member.photo_urls.length >= 10) {
              this.faceEngine.trainPersonWithPhotos(member.name, member.photo_urls, member.role, member.id)
                .catch(err => console.error('[SmarterHomeSync] Realtime training error:', err));
            } else if (member.descriptor) {
              this.faceEngine.enrollPerson(member.name, member.role, member.descriptor);
            }
          }
        })
        .subscribe();

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
    if (!this.supabase) return;
    try {
      const homeId = await this.getLinkedHomeId();
      if (!homeId) return;

      const { data: rooms, error } = await this.supabase
        .from('rooms')
        .select('*')
        .eq('home_id', homeId);

      if (!error && rooms && Array.isArray(rooms)) {
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
            // Camera disabled for this room: unregister if exists
            const existing = this.registry.getSensor(camSensorId);
            if (existing) {
              await this.registry.unregisterSensor(camSensorId, false);
            }
          }
        }

        // Clean up legacy sensor-cam-1 if dynamic rooms exist
        if (this.registry.getSensor('sensor-cam-1')) {
          await this.registry.unregisterSensor('sensor-cam-1', false);
        }
      }
    } catch (err) {
      console.warn('[SmarterHomeSync] Failed to sync rooms cameras from Supabase:', (err as Error).message);
    }
  }

  private async syncFamilyMembersFromSupabase(): Promise<void> {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('family_members')
        .select('*');

      if (!error && data && data.length > 0) {
        console.log(`[SmarterHomeSync] Synced ${data.length} family member(s) from Supabase Realtime DB`);
        for (const member of data) {
          if (member.photo_urls && member.photo_urls.length >= 10) {
            await this.faceEngine.trainPersonWithPhotos(member.name, member.photo_urls, member.role, member.id).catch(() => {});
          } else if (member.descriptor) {
            this.faceEngine.enrollPerson(member.name, member.role, member.descriptor);
          }
        }
      }
    } catch (err) {
      console.warn('[SmarterHomeSync] Failed to fetch initial family members from Supabase:', (err as Error).message);
    }
  }

  private setupListeners(): void {
    // Immediate push when face detection status changes
    this.registry.on('face_detection', async (event: { sensorId: string; sensorName: string } & FaceDetectionPayload) => {
      if (event.detected) {
        await this.sendFaceAlertToSmarterHome(event);
      }
    });

    // Listen directly to any active camera sensor for per-frame streaming & first-frame arrival events
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

  private cameraStreamTimer: NodeJS.Timeout | null = null;

  private startSyncLoop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.cameraStreamTimer) clearInterval(this.cameraStreamTimer);

    // 1. General telemetry sync loop (temperature, pin status, humidity)
    this.syncTimer = setInterval(async () => {
      await this.syncTelemetry();
    }, config.syncIntervalMs);

    // 2. Continuous multi-camera frame stream loop (~3.3 FPS)
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

  /**
   * Push current live sensor readings to smarter-home and Supabase
   */
  public async syncTelemetry(): Promise<boolean> {
    const readings = this.registry.getLatestReadings();
    const sensorList = Object.values(readings);

    const tempReading = sensorList.find(r => r.sensorType === 'temperature') as TemperatureReading | undefined;
    const camSensor = this.registry.getAllSensors().find(s => s.type === 'camera');
    const faceState: FaceDetectionPayload | null = camSensor && 'getFaceDetection' in camSensor 
      ? (camSensor as any).getFaceDetection() 
      : null;

    const isoNow = new Date().toISOString();
    const payload = {
      source: 'raspberry-pi-controller',
      timestamp: isoNow,
      sensors: readings,
      telemetry: {
        temperature: tempReading?.temperatureC ?? null,
        humidity: tempReading?.humidityPct ?? null,
        faceDetection: faceState ? {
          detected: faceState.detected,
          status: faceState.status,
          person: faceState.person,
          confidence: faceState.confidence,
          timestamp: faceState.timestamp
        } : null
      }
    };

    let supabaseSynced = false;

    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        
        if (tempReading?.temperatureC !== undefined) {
          const telemetryVal = {
            temperature: tempReading.temperatureC,
            humidity: tempReading.humidityPct,
            faceDetection: payload.telemetry.faceDetection,
            updatedAt: isoNow
          };

          if (homeId) {
            await this.supabase.from('home_states').upsert({
              home_id: homeId,
              key: 'pi_telemetry',
              value: telemetryVal,
              updated_at: isoNow
            }, { onConflict: 'home_id,key' });
          } else {
            await this.supabase.from('home_states').upsert({
              key: 'pi_telemetry',
              value: telemetryVal,
              updated_at: isoNow
            }, { onConflict: 'user_id,key' });
          }
        }

        if (homeId) {
          this.supabase
            .channel(`home-telemetry-${homeId}`)
            .send({
              type: 'broadcast',
              event: 'telemetry_update',
              payload
            })
            .catch(() => {});
        }

        supabaseSynced = true;
      } catch {}
    }

    let httpSynced = false;
    if (config.smarterHomeApiUrl) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/pi/telemetry`;
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(2500)
        });

        if (response.ok) {
          httpSynced = true;
        }
      } catch {}
    }

    const success = supabaseSynced || httpSynced;
    this.status.totalSyncs++;
    this.status.lastSyncTime = isoNow;
    this.status.lastSyncSuccess = success;
    if (success) {
      this.status.lastError = null;
    } else {
      this.status.failedSyncs++;
      this.status.lastError = 'Unable to reach Supabase Realtime or HTTP Gateway';
    }

    return success;
  }

  /**
   * Immediate Face Event Dispatch
   */
  public async sendFaceAlertToSmarterHome(event: { sensorId: string; sensorName: string } & FaceDetectionPayload): Promise<boolean> {
    const isoNow = new Date().toISOString();
    const payload = {
      source: 'raspberry-pi-camera',
      type: 'face_recognition_event',
      sensorId: event.sensorId,
      sensorName: event.sensorName,
      data: {
        detected: event.detected,
        status: event.status,
        person: event.person,
        confidence: event.confidence,
        timestamp: event.timestamp || isoNow
      }
    };

    let supabaseHandled = false;

    if (this.supabase) {
      try {
        if (event.status === 'recognized' && event.person) {
          await this.supabase
            .from('family_members')
            .update({
              status: 'Home',
              last_seen: 'Just now',
              via: 'Entrance Camera',
              updated_at: isoNow
            })
            .ilike('name', event.person);
        }

        const homeId = await this.getLinkedHomeId();
        if (homeId) {
          this.supabase
            .channel(`home-security-${homeId}`)
            .send({
              type: 'broadcast',
              event: 'face_alert',
              payload
            })
            .catch(() => {});
        }

        supabaseHandled = true;
      } catch {}
    }

    if (config.smarterHomeApiUrl) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/pi/telemetry`;
        await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(2500)
        });
      } catch {}
    }

    return supabaseHandled;
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
