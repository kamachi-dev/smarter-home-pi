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

  private setupListeners(): void {
    // Immediate push when face detection status changes
    this.registry.on('face_detection', async (event: { sensorId: string; sensorName: string } & FaceDetectionPayload) => {
      if (event.detected) {
        await this.sendFaceAlertToSmarterHome(event);
      }
    });

    // Listen for processed camera frames and stream live footage to Smarter Home
    this.registry.on('reading', (reading: SensorReading) => {
      if (reading.sensorType === 'camera') {
        const camSensor = this.registry.getSensor(reading.sensorId) as any;
        const frame = camSensor?.getLatestFrame?.();
        if (frame) {
          this.sendLiveFrameToSmarterHome(frame, reading.faceDetection).catch(() => {});
        }
      }
    });
  }

  /**
   * Pushes the live processed camera frame (with face recognition squares) to Smarter Home
   */
  public async sendLiveFrameToSmarterHome(frameBuffer: Buffer, faceDetection?: FaceDetectionPayload): Promise<boolean> {
    if (!config.smarterHomeToken) return false;

    const now = Date.now();
    if (now - this.lastLiveFramePush < 300) return false; // Stream at ~3-4 FPS
    this.lastLiveFramePush = now;

    try {
      const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/pi/camera/live`;
      const base64Image = `data:image/jpeg;base64,${frameBuffer.toString('base64')}`;

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pi-token': config.smarterHomeToken,
          'x-pi-api-key': config.smarterHomeApiKey
        },
        body: JSON.stringify({
          image: base64Image,
          faceDetection: faceDetection || null,
          timestamp: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(2500)
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  private startSyncLoop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);

    this.syncTimer = setInterval(async () => {
      await this.syncTelemetry();
    }, config.syncIntervalMs);
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

    const payload = {
      source: 'raspberry-pi-controller',
      timestamp: new Date().toISOString(),
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

    // 1. Direct Supabase Realtime State Sync
    if (this.supabase && tempReading?.temperatureC !== undefined) {
      try {
        await this.supabase.from('home_states').upsert({
          key: 'pi_telemetry',
          value: {
            temperature: tempReading.temperatureC,
            humidity: tempReading.humidityPct,
            updatedAt: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,key' });
      } catch {}
    }

    // 2. HTTP REST Gateway Sync to smarter-home Next.js API
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
        signal: AbortSignal.timeout(3000)
      });

      this.status.totalSyncs++;
      this.status.lastSyncTime = new Date().toISOString();

      if (response.ok) {
        this.status.lastSyncSuccess = true;
        this.status.lastError = null;
        return true;
      } else {
        const errorText = await response.text().catch(() => 'Unknown HTTP Error');
        this.status.lastSyncSuccess = false;
        this.status.failedSyncs++;
        this.status.lastError = `HTTP ${response.status}: ${errorText}`;
        return false;
      }
    } catch (err) {
      this.status.totalSyncs++;
      this.status.failedSyncs++;
      this.status.lastSyncSuccess = false;
      this.status.lastSyncTime = new Date().toISOString();
      this.status.lastError = (err as Error).message;
      return false;
    }
  }

  /**
   * Immediate Face Event Dispatch (only passed fields: detected, status, person, confidence, timestamp)
   */
  public async sendFaceAlertToSmarterHome(event: { sensorId: string; sensorName: string } & FaceDetectionPayload): Promise<boolean> {
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
        timestamp: event.timestamp
      }
    };

    // Update Supabase family_members last_seen if recognized
    if (this.supabase && event.status === 'recognized' && event.person) {
      try {
        await this.supabase
          .from('family_members')
          .update({
            status: 'Home',
            last_seen: 'Just now',
            via: 'Entrance Camera',
            updated_at: new Date().toISOString()
          })
          .ilike('name', event.person);
      } catch {}
    }

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
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch (err) {
      console.warn('[SmarterHomeSync] Failed to send instant face alert:', (err as Error).message);
      return false;
    }
  }

  public getStatus(): SyncStatus {
    return { ...this.status };
  }
}
