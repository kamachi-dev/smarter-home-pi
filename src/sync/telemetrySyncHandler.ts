import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { FaceDetectionPayload, TemperatureReading } from '../types/index.js';
import { config } from '../config/env.js';

export interface TelemetrySyncOptions {
  supabase: SupabaseClient | null;
  registry: SensorRegistry;
  getLinkedHomeId: () => Promise<string | null>;
}

export class TelemetrySyncHandler {
  private supabase: SupabaseClient | null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;

  constructor(options: TelemetrySyncOptions) {
    this.supabase = options.supabase;
    this.registry = options.registry;
    this.getLinkedHomeId = options.getLinkedHomeId;
  }

  public updateSupabaseClient(client: SupabaseClient | null) {
    this.supabase = client;
  }

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

    return supabaseSynced || httpSynced;
  }

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
}
