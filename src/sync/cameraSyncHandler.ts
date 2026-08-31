import { SupabaseClient } from '@supabase/supabase-js';
import { FaceDetectionPayload } from '../types/index.js';
import { config } from '../config/env.js';

export interface CameraSyncOptions {
  supabase: SupabaseClient | null;
  getLinkedHomeId: () => Promise<string | null>;
}

export class CameraSyncHandler {
  private supabase: SupabaseClient | null;
  private getLinkedHomeId: () => Promise<string | null>;
  private lastLiveFramePush = 0;
  private lastStateUpsert = 0;
  private lastBroadcastLog = 0;

  constructor(options: CameraSyncOptions) {
    this.supabase = options.supabase;
    this.getLinkedHomeId = options.getLinkedHomeId;
  }

  public updateSupabaseClient(client: SupabaseClient | null) {
    this.supabase = client;
  }

  /**
   * Pushes live processed camera frame (with face recognition squares) to Smarter Home
   */
  public async sendLiveFrame(frameBuffer: Buffer, faceDetection?: FaceDetectionPayload, roomId?: string): Promise<boolean> {
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
                  timestamp: isoTimestamp,
                  roomId: roomId || null
                }
              }]
            })
          }).catch(() => {});

          if (now - this.lastStateUpsert > 800) {
            this.lastStateUpsert = now;
            const feedKey = roomId ? `camera_feed_${roomId}` : 'camera_feed';
            await this.supabase.from('home_states').upsert({
              home_id: homeId,
              key: feedKey,
              value: {
                image: base64Image,
                faceDetection: faceDetection || null,
                updatedAt: now,
                timestamp: isoTimestamp,
                roomId: roomId || null
              },
              updated_at: isoTimestamp
            }, { onConflict: 'home_id,key' });
          }

          if (now - this.lastBroadcastLog > 8000) {
            this.lastBroadcastLog = now;
            console.log(`[CameraSyncHandler] 📡 Broadcasting live camera frames to Supabase (home: ${homeId.substring(0, 8)}..., room: ${roomId || 'default'})`);
          }

          return true;
        }
      } catch {}
    }

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

  /**
   * Dispatches the FIRST FRAME of a newly recognized person upon arrival to Supabase.
   */
  public async sendFirstFrameArrival(
    arrival: { person: string; confidence: number; frame: Buffer; timestamp: string; box?: any },
    sensorId: string,
    sensorName: string
  ): Promise<boolean> {
    const isoNow = arrival.timestamp || new Date().toISOString();
    const base64Image = `data:image/jpeg;base64,${arrival.frame.toString('base64')}`;

    console.log(`[CameraSyncHandler] 📸 Transmitting FIRST-FRAME for "${arrival.person}" to Supabase (/supabase detected people)...`);

    const detectedPersonRecord = {
      id: `detect-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: arrival.person,
      confidence: arrival.confidence,
      timestamp: isoNow,
      sensorId,
      sensorName,
      box: arrival.box || null,
      firstFrameImage: base64Image
    };

    let supabaseHandled = false;

    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();

        await this.supabase
          .from('family_members')
          .update({
            status: 'Home',
            last_seen: 'Just now',
            via: `${sensorName} (Facial Recognition)`,
            updated_at: isoNow
          })
          .ilike('name', arrival.person);

        if (homeId) {
          const { data: existingState } = await this.supabase
            .from('home_states')
            .select('value')
            .eq('home_id', homeId)
            .eq('key', 'detected_people')
            .maybeSingle();

          const currentList = Array.isArray(existingState?.value) ? existingState.value : [];
          const updatedList = [detectedPersonRecord, ...currentList.filter((p: any) => p.name !== arrival.person || (Date.now() - new Date(p.timestamp).getTime() > 60000))].slice(0, 25);

          // Also automatically append to Security Logs with snapshot
          const timeStr = new Date(isoNow).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const newSecurityLog = {
            id: Date.now(),
            time: timeStr,
            event: `Face Verified: ${arrival.person} (${Math.round(arrival.confidence * 100)}%)`,
            location: sensorName || 'Room Camera',
            severity: 'success',
            snapshot: base64Image,
            person: arrival.person,
            confidence: arrival.confidence
          };

          const { data: existingLogsState } = await this.supabase
            .from('home_states')
            .select('value')
            .eq('home_id', homeId)
            .eq('key', 'logs')
            .maybeSingle();

          const currentLogs = Array.isArray(existingLogsState?.value) ? existingLogsState.value : [];
          const updatedLogs = [newSecurityLog, ...currentLogs].slice(0, 30);

          await this.supabase.from('home_states').upsert([
            {
              home_id: homeId,
              key: 'detected_people',
              value: updatedList,
              updated_at: isoNow
            },
            {
              home_id: homeId,
              key: 'logs',
              value: updatedLogs,
              updated_at: isoNow
            }
          ], { onConflict: 'home_id,key' });

          await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
            method: 'POST',
            headers: {
              'apikey': config.supabaseKey,
              'Authorization': `Bearer ${config.supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [{
                topic: `home-security-${homeId}`,
                event: 'person_detected_first_frame',
                payload: detectedPersonRecord
              }]
            })
          }).catch(() => {});
        }

        supabaseHandled = true;
      } catch (err) {
        console.error('[CameraSyncHandler] Error sending first frame arrival:', (err as Error).message);
      }
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
          body: JSON.stringify({
            source: 'raspberry-pi-camera',
            type: 'person_detected_first_frame',
            data: detectedPersonRecord
          }),
          signal: AbortSignal.timeout(3000)
        });
      } catch {}
    }

    return supabaseHandled;
  }
}
