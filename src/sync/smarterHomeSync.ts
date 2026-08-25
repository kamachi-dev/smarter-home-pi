import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { FaceRecognitionEngine } from '../sensors/camera/faceRecognition.js';
import { SensorReading, FaceDetectionPayload, TemperatureReading } from '../types/index.js';
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
      this.status.supabaseConnected = true;
      console.log('[SmarterHomeSync] Supabase Realtime connected successfully');

      // 1. Initial sync of family members from Supabase
      this.syncFamilyMembersFromSupabase();

      // 2. Subscribe to Realtime family_members table changes
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
    } catch (err) {
      console.warn('[SmarterHomeSync] Supabase Realtime init error:', (err as Error).message);
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

  private lastLiveFramePush = 0;
  private lastStateUpsert = 0;
  private lastBroadcastLog = 0;

  private setupListeners(): void {
    // Immediate push when face detection status changes
    this.registry.on('face_detection', async (event: { sensorId: string; sensorName: string } & FaceDetectionPayload) => {
      if (event.detected) {
        await this.sendFaceAlertToSmarterHome(event);
      }
    });

    // Listen directly to any active camera sensor for per-frame streaming
    const bindCamera = (sensor: any) => {
      if (sensor && sensor.type === 'camera') {
        sensor.on('frame', (frame: Buffer) => {
          this.sendLiveFrameToSmarterHome(frame, sensor.getFaceDetection?.()).catch(() => {});
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

  /**
   * Pushes the live processed camera frame (with face recognition squares) to Smarter Home
   */
  public async sendLiveFrameToSmarterHome(frameBuffer: Buffer, faceDetection?: FaceDetectionPayload): Promise<boolean> {
    if (!config.smarterHomeToken) return false;

    const now = Date.now();
    if (now - this.lastLiveFramePush < 300) return false; // Stream at ~3.3 FPS
    this.lastLiveFramePush = now;

    const base64Image = `data:image/jpeg;base64,${frameBuffer.toString('base64')}`;
    const isoTimestamp = new Date().toISOString();

    if (this.supabase && config.supabaseUrl && config.supabaseKey) {
      try {
        const homeId = await this.getLinkedHomeId();
        if (homeId) {
          // 1. Send via Supabase Realtime Broadcast REST API (Stateless, zero-drop, instant WebSocket distribution to web/mobile clients)
          fetch(`${config.supabaseUrl.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
            method: 'POST',
            headers: {
              'apikey': config.supabaseKey,
              'Authorization': `Bearer ${config.supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [{
                topic: `home-camera-${homeId}`,
                event: 'camera_frame',
                payload: {
                  image: base64Image,
                  faceDetection: faceDetection || null,
                  timestamp: isoTimestamp
                }
              }]
            })
          }).catch(() => {});

          // 2. Upsert latest frame into home_states every 800ms for instant initial page loads
          if (now - this.lastStateUpsert > 800) {
            this.lastStateUpsert = now;
            await this.supabase.from('home_states').upsert({
              home_id: homeId,
              key: 'camera_feed',
              value: {
                image: base64Image,
                faceDetection: faceDetection || null,
                updatedAt: now,
                timestamp: isoTimestamp
              },
              updated_at: isoTimestamp
            }, { onConflict: 'home_id,key' });
          }

          if (now - this.lastBroadcastLog > 8000) {
            this.lastBroadcastLog = now;
            console.log(`[SmarterHomeSync] 📡 Actively broadcasting live camera frames to Supabase (size: ${frameBuffer.length} bytes, home: ${homeId.substring(0, 8)}...)`);
          }

          return true;
        }
      } catch {}
    }

    // 2. HTTP REST Gateway fallback
    if (config.smarterHomeApiUrl) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/pi/camera/live`;
        await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          body: JSON.stringify({
            image: base64Image,
            faceDetection: faceDetection || null,
            timestamp: isoTimestamp
          }),
          signal: AbortSignal.timeout(2000)
        });
      } catch {}
    }

    return true;
  }

  private cameraStreamTimer: NodeJS.Timeout | null = null;

  private startSyncLoop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.cameraStreamTimer) clearInterval(this.cameraStreamTimer);

    // 1. General telemetry sync loop (temperature, pin status, humidity)
    this.syncTimer = setInterval(async () => {
      await this.syncTelemetry();
    }, config.syncIntervalMs);

    // 2. Continuous camera frame stream loop (~3.3 FPS)
    this.cameraStreamTimer = setInterval(async () => {
      const cam = this.registry.getAllSensors().find(s => s.type === 'camera') as any;
      if (cam && typeof cam.getLatestFrame === 'function') {
        const frame = cam.getLatestFrame();
        if (frame) {
          await this.sendLiveFrameToSmarterHome(frame, cam.getFaceDetection?.()).catch(() => {});
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

    // Extract temperature/humidity
    const tempReading = sensorList.find(r => r.sensorType === 'temperature') as TemperatureReading | undefined;
    
    // Find camera face state
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

    // 1. Direct Supabase Realtime State Sync
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

        // Broadcast telemetry over Realtime channel
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

    // 2. HTTP REST Gateway Sync (optional fallback)
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
   * Immediate Face Event Dispatch (only passed fields: detected, status, person, confidence, timestamp)
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

    // 1. Direct Supabase Realtime & Database Update
    if (this.supabase) {
      try {
        // Update family_members status if recognized
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

        // Broadcast to Realtime Security channel
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

    // 2. HTTP REST Gateway fallback
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
}
