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
  private lastBroadcastLog = 0;
  private isPushing = false;
  private pendingPush: { frameBuffer: Buffer; faceDetection?: FaceDetectionPayload; roomId?: string } | null = null;

  constructor(options: CameraSyncOptions) {
    this.supabase = options.supabase;
    this.getLinkedHomeId = options.getLinkedHomeId;
  }

  public updateSupabaseClient(client: SupabaseClient | null) {
    this.supabase = client;
  }

  /**
   * Pushes live processed camera frame (with face recognition squares) to Smarter Home.
   * Ensures only the freshest/latest frame is streamed via ephemeral Supabase Realtime Broadcast.
   * Eliminates continuous high-frequency Postgres table upserts to prevent database and server load.
   */
  public async sendLiveFrame(frameBuffer: Buffer, faceDetection?: FaceDetectionPayload, roomId?: string): Promise<boolean> {
    if (!config.smarterHomeToken) return false;

    // Single-slot frame dropping: if a frame broadcast is currently in-flight,
    // buffer only this newest frame and drop intermediate backlog frames.
    if (this.isPushing) {
      this.pendingPush = { frameBuffer, faceDetection, roomId };
      return false;
    }

    const now = Date.now();
    // Throttle to max ~5 FPS for optimal balance of smooth UI feedback and network bandwidth
    if (now - this.lastLiveFramePush < 200) {
      this.pendingPush = { frameBuffer, faceDetection, roomId };
      return false;
    }

    this.isPushing = true;
    this.lastLiveFramePush = now;

    try {
      await this.executeBroadcastPush(frameBuffer, faceDetection, roomId);
    } finally {
      this.isPushing = false;
      // If a newer frame arrived while broadcasting, immediately transmit the latest pending frame
      if (this.pendingPush) {
        const next = this.pendingPush;
        this.pendingPush = null;
        setImmediate(() => {
          this.sendLiveFrame(next.frameBuffer, next.faceDetection, next.roomId).catch(() => {});
        });
      }
    }

    return true;
  }

  private async executeBroadcastPush(frameBuffer: Buffer, faceDetection?: FaceDetectionPayload, roomId?: string): Promise<void> {
    const base64Image = `data:image/jpeg;base64,${frameBuffer.toString('base64')}`;
    const isoTimestamp = new Date().toISOString();
    const now = Date.now();

    if (this.supabase && config.supabaseUrl && config.supabaseKey) {
      try {
        const homeId = await this.getLinkedHomeId();
        if (homeId) {
          // Stream directly over Supabase Realtime WebSocket broadcast (ephemeral transport; 0 DB writes)
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
            }),
            signal: AbortSignal.timeout(1500)
          }).catch(() => {});

          if (now - this.lastBroadcastLog > 10000) {
            this.lastBroadcastLog = now;
            console.log(`[CameraSyncHandler] 藤 Real-time frame broadcast active (home: ${homeId.substring(0, 8)}..., room: ${roomId || 'default'})`);
          }
          return;
        }
      } catch {}
    }

    // Direct HTTP gateway fallback only if Supabase Realtime is unreachable
    if (config.smarterHomeApiUrl && !config.smarterHomeApiUrl.includes('vercel.app')) {
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
          signal: AbortSignal.timeout(1500)
        });
      } catch {}
    }
  }

  /**
   * Dispatches the FIRST FRAME of a newly recognized person upon arrival to Supabase.
   * Uploads snapshot to Supabase Storage 'snapshots' bucket and stores the public URL in logs.
   */
  public async sendFirstFrameArrival(
    arrival: { person: string; confidence: number; frame: Buffer; timestamp: string; box?: any },
    sensorId: string,
    sensorName: string
  ): Promise<boolean> {
    const isoNow = arrival.timestamp || new Date().toISOString();
    const base64Image = `data:image/jpeg;base64,${arrival.frame.toString('base64')}`;

    console.log(`[CameraSyncHandler] 萄 Transmitting FIRST-FRAME for "${arrival.person}" to Supabase Storage + home_states...`);

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

        const isStranger = arrival.person.toLowerCase().includes('stranger') || arrival.person.toLowerCase().includes('unknown') || arrival.person.toLowerCase().includes('unverified');

        if (!isStranger) {
          await this.supabase
            .from('family_members')
            .update({
              status: 'Home',
              last_seen: 'Just now',
              via: `${sensorName} (Facial Recognition)`,
              updated_at: isoNow
            })
            .ilike('name', arrival.person);
        }

        if (homeId) {
          const { data: existingState } = await this.supabase
            .from('home_states')
            .select('value')
            .eq('home_id', homeId)
            .eq('key', 'detected_people')
            .maybeSingle();

          const currentList = Array.isArray(existingState?.value) ? existingState.value : [];
          const updatedList = [detectedPersonRecord, ...currentList.filter((p: any) => p.name !== arrival.person || (Date.now() - new Date(p.timestamp).getTime() > 60000))].slice(0, 25);

          // Upload snapshot to Supabase Storage snapshots bucket
          let snapshotUrl: string = base64Image; // fallback to base64 if upload fails
          try {
            const snapshotPath = `${homeId}/${detectedPersonRecord.id}.jpg`;
            const { error: uploadErr } = await this.supabase.storage
              .from('snapshots')
              .upload(snapshotPath, arrival.frame, {
                contentType: 'image/jpeg',
                upsert: false
              });

            if (!uploadErr) {
              const { data: urlData } = this.supabase.storage
                .from('snapshots')
                .getPublicUrl(snapshotPath);
              if (urlData?.publicUrl) {
                snapshotUrl = urlData.publicUrl;
                detectedPersonRecord.firstFrameImage = snapshotUrl;
                console.log(`[CameraSyncHandler] 翌・・Snapshot uploaded to Storage: ${snapshotPath}`);
              }
            } else {
              console.warn('[CameraSyncHandler] 笞・・Snapshot upload failed, falling back to base64:', uploadErr.message);
            }
          } catch (uploadEx) {
            console.warn('[CameraSyncHandler] 笞・・Snapshot upload exception, falling back to base64:', (uploadEx as Error).message);
          }

          // Append to Security Logs with snapshot URL
          const timeStr = new Date(isoNow).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const eventTitle = isStranger
            ? `Intruder Alert: Unrecognized Person Detected`
            : `Face Verified: ${arrival.person} (${Math.round(arrival.confidence * 100)}%)`;
          const logSeverity = isStranger ? 'warning' : 'success';

          const newSecurityLog = {
            id: Date.now(),
            time: timeStr,
            event: eventTitle,
            location: sensorName || 'Room Camera',
            severity: logSeverity,
            snapshot: snapshotUrl,
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
          const updatedLogs = [newSecurityLog, ...currentLogs].slice(0, 50);
          const { error: upsertErr } = await this.supabase.from('home_states').upsert([
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

          if (upsertErr) {
            console.error('[CameraSyncHandler] 笶・Supabase home_states upsert error:', upsertErr.message);
            // Try single row upsert fallback
            try {
              await this.supabase.from('home_states').upsert({
                home_id: homeId,
                key: 'logs',
                value: updatedLogs,
                updated_at: isoNow
              }, { onConflict: 'home_id,key' });
            } catch (e) {
              console.error('[CameraSyncHandler] Single row upsert fallback failed:', (e as Error).message);
            }
          } else {
            console.log(`[CameraSyncHandler] 笨・Saved intruder/arrival log into home_states (home: ${homeId.substring(0, 8)}...)`);
          }

          await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
            method: 'POST',
            headers: {
              'apikey': config.supabaseKey,
              'Authorization': `Bearer ${config.supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [
                {
                  topic: `home-security-${homeId}`,
                  event: 'person_detected_first_frame',
                  payload: detectedPersonRecord
                },
                {
                  topic: `home-camera-${homeId}`,
                  event: 'person_detected_first_frame',
                  payload: detectedPersonRecord
                },
                {
                  topic: `home-db-changes-${homeId}`,
                  event: 'person_detected_first_frame',
                  payload: detectedPersonRecord
                }
              ]
            })
          }).catch(() => {});
        }

        supabaseHandled = true;
      } catch (err) {
        console.error('[CameraSyncHandler] Error sending first frame arrival:', (err as Error).message);
      }
    }

    if (config.smarterHomeApiUrl && !config.smarterHomeApiUrl.includes('vercel.app')) {
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

  /**
   * Dispatches edge-detected motion alert to Supabase and Smarter Home telemetry API.
   * Passes the motion score and JPEG snapshot for Gemini situation analysis without continuous facial inference.
   */
  public async sendMotionAlert(
    event: { sensorId: string; sensorName: string; score: number; snapshot: Buffer; timestamp?: string }
  ): Promise<boolean> {
    const isoNow = event.timestamp || new Date().toISOString();
    const base64Image = `data:image/jpeg;base64,${event.snapshot.toString('base64')}`;
    let supabaseHandled = false;

    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        if (homeId) {
          const timeStr = new Date(isoNow).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const motionLog = {
            id: Date.now(),
            time: timeStr,
            event: `Major Motion Detected (${event.score}% delta)`,
            location: event.sensorName || 'Camera Room',
            severity: 'warning',
            snapshot: base64Image
          };

          const { data: existingLogsState } = await this.supabase
            .from('home_states')
            .select('value')
            .eq('home_id', homeId)
            .eq('key', 'logs')
            .maybeSingle();

          const currentLogs = Array.isArray(existingLogsState?.value) ? existingLogsState.value : [];
          await this.supabase.from('home_states').upsert([
            { home_id: homeId, key: 'motionDetected', value: true, updated_at: isoNow },
            { home_id: homeId, key: 'logs', value: [motionLog, ...currentLogs].slice(0, 50), updated_at: isoNow }
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
                event: 'motion_alert',
                payload: {
                  location: event.sensorName || 'Camera Room',
                  score: event.score,
                  snapshot: base64Image,
                  timestamp: isoNow
                }
              }]
            })
          }).catch(() => {});

          supabaseHandled = true;
          console.log(`[CameraSyncHandler] 純 Dispatched edge motion alert (${event.score}% delta) to Supabase`);
        }
      } catch (err) {
        console.error('[CameraSyncHandler] Motion alert sync error:', (err as Error).message);
      }
    }

    if (config.smarterHomeApiUrl && !config.smarterHomeApiUrl.includes('vercel.app')) {
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
            type: 'motion_alert',
            data: {
              location: event.sensorName || 'Camera Room',
              score: event.score,
              snapshot: base64Image
            }
          }),
          signal: AbortSignal.timeout(3000)
        });
      } catch {}
    }

    return supabaseHandled;
  }
}
