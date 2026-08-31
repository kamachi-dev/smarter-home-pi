import { FaceDetectionPayload, DetectedFace } from '../../types/index.js';

export interface PersonArrivalEvent {
  person: string;
  confidence: number;
  frame: Buffer;
  timestamp: string;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TrackedPersonState {
  name: string;
  status: 'present' | 'away';
  firstSeenAt: number;
  lastSeenAt: number;
  firstFrameBase64?: string;
  lastConfidence: number;
}

export class PresenceTracker {
  private static instance: PresenceTracker;
  private trackedPeople: Map<string, TrackedPersonState> = new Map();
  private absenceTimeoutMs: number;

  constructor(absenceTimeoutMs: number = 10000) {
    this.absenceTimeoutMs = absenceTimeoutMs;
  }

  public static getInstance(absenceTimeoutMs: number = 10000): PresenceTracker {
    if (!PresenceTracker.instance) {
      PresenceTracker.instance = new PresenceTracker(absenceTimeoutMs);
    }
    return PresenceTracker.instance;
  }

  public setAbsenceTimeout(ms: number): void {
    this.absenceTimeoutMs = ms;
  }

  public processDetection(
    detection: FaceDetectionPayload,
    annotatedOrRawFrame: Buffer
  ): PersonArrivalEvent[] {
    const now = Date.now();
    const isoTimestamp = detection.timestamp || new Date(now).toISOString();
    const newlyArrived: PersonArrivalEvent[] = [];

    this.evaluateAbsences(now);

    if (!detection || !detection.detected) {
      return newlyArrived;
    }

    const detectedFaces: Array<{ name: string; conf: number; isRecognized: boolean; box?: any }> = [];

    if (detection.faces && detection.faces.length > 0) {
      for (const face of detection.faces) {
        const isKnown = face.status === 'recognized' && face.person && face.person !== 'Unknown Person';
        detectedFaces.push({
          name: isKnown ? face.person : 'Stranger / Unverified Person',
          conf: face.confidence || 0.5,
          isRecognized: isKnown,
          box: face.box
        });
      }
    } else if (detection.detected) {
      const isKnown = detection.status === 'recognized' && detection.person && detection.person !== 'Unknown Person';
      detectedFaces.push({
        name: isKnown ? detection.person : 'Stranger / Unverified Person',
        conf: detection.confidence || 0.5,
        isRecognized: isKnown,
        box: detection.box
      });
    }

    for (const rec of detectedFaces) {
      const normalizedName = rec.name.trim();
      const existing = this.trackedPeople.get(normalizedName);

      if (!existing || existing.status === 'away') {
        const state: TrackedPersonState = {
          name: normalizedName,
          status: 'present',
          firstSeenAt: now,
          lastSeenAt: now,
          lastConfidence: rec.conf
        };
        this.trackedPeople.set(normalizedName, state);

        newlyArrived.push({
          person: normalizedName,
          confidence: rec.conf,
          frame: annotatedOrRawFrame,
          timestamp: isoTimestamp,
          box: rec.box
        });

        console.log(
          `[PresenceTracker] 👤 FIRST FRAME CAPTURE: "${normalizedName}" detected (Confidence: ${(rec.conf * 100).toFixed(1)}%). Dispatching to Supabase!`
        );
      } else {
        existing.lastSeenAt = now;
        existing.lastConfidence = rec.conf;
      }
    }

    return newlyArrived;
  }

  private evaluateAbsences(now: number): void {
    for (const [name, state] of this.trackedPeople.entries()) {
      if (state.status === 'present' && now - state.lastSeenAt > this.absenceTimeoutMs) {
        state.status = 'away';
        const durationSec = Math.round((state.lastSeenAt - state.firstSeenAt) / 1000);
        console.log(
          `[PresenceTracker] 🚪 DEPARTURE: "${name}" left camera field of view (Present for ${durationSec}s). Next return will trigger fresh first-frame capture.`
        );
      }
    }
  }

  public getPresentPeople(): string[] {
    this.evaluateAbsences(Date.now());
    const present: string[] = [];
    for (const [name, state] of this.trackedPeople.entries()) {
      if (state.status === 'present') {
        present.push(name);
      }
    }
    return present;
  }

  public getTrackedPeople(): TrackedPersonState[] {
    this.evaluateAbsences(Date.now());
    return Array.from(this.trackedPeople.values());
  }

  public clear(): void {
    this.trackedPeople.clear();
  }
}
