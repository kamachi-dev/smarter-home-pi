import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { BaseSensor } from '../base.js';
import { SensorConfig, CameraReading, FaceDetectionPayload } from '../../types/index.js';
import { FaceRecognitionEngine } from './faceRecognition.js';
import { GpioManager } from '../../hardware/gpio.js';

const execAsync = promisify(exec);

export class CameraSensor extends BaseSensor {
  private faceEngine: FaceRecognitionEngine;
  private isProcessing: boolean = false;
  private recognitionLoopTimer: NodeJS.Timeout | null = null;
  private currentDetection: FaceDetectionPayload = {
    detected: false,
    status: 'none',
    person: null,
    confidence: 0,
    timestamp: new Date().toISOString()
  };

  constructor(config: SensorConfig) {
    super(config);
    this.faceEngine = FaceRecognitionEngine.getInstance();
  }

  public async init(): Promise<void> {
    console.log(`[CameraSensor] Initialized camera sensor [${this.config.name}] (Hardware/CSI/USB enabled)`);
  }

  public override start(): void {
    super.start();
    this.startFaceRecognitionLoop();
  }

  public override stop(): void {
    super.stop();
    if (this.recognitionLoopTimer) {
      clearInterval(this.recognitionLoopTimer);
      this.recognitionLoopTimer = null;
    }
  }

  /**
   * Continuous background loop executing facial recognition indefinitely alongside Pi
   */
  private startFaceRecognitionLoop(): void {
    if (this.recognitionLoopTimer) return;

    // Run recognition check every 1.5 seconds
    this.recognitionLoopTimer = setInterval(async () => {
      if (!this.isRunning || this.isProcessing) return;
      this.isProcessing = true;

      try {
        const frameBuffer = await this.captureFrameBuffer();
        const detection = await this.faceEngine.recognizeFrame(frameBuffer);
        this.currentDetection = detection;

        // Emit detection event for sync engine & WebSocket subscribers
        this.emit('face_detection', detection);
      } catch (err) {
        console.error('[CameraSensor] Recognition loop iteration error:', (err as Error).message);
      } finally {
        this.isProcessing = false;
      }
    }, Math.max(1000, this.config.pollIntervalMs || 2000));
  }

  private async captureFrameBuffer(): Promise<Buffer | undefined> {
    const isLinux = GpioManager.getInstance().isHardwareMode();

    if (isLinux) {
      try {
        // Attempt RPi libcamera / rpicam-still snapshot to temp file or stdout
        const tempPath = '/tmp/pi_cam_frame.jpg';
        await execAsync(`rpicam-still -t 100 --width 640 --height 480 -n -o ${tempPath} || libcamera-still -t 100 --width 640 --height 480 -n -o ${tempPath} || fswebcam -r 640x480 --no-banner ${tempPath}`);
        if (fs.existsSync(tempPath)) {
          const buf = fs.readFileSync(tempPath);
          return buf;
        }
      } catch (err) {
        // fallback to synthetic frame
      }
    }
    return undefined;
  }

  public async read(): Promise<CameraReading> {
    const reading: CameraReading = {
      sensorId: this.id,
      sensorType: 'camera',
      timestamp: new Date().toISOString(),
      status: 'ok',
      faceDetection: this.currentDetection,
    };

    this.lastReading = reading;
    return reading;
  }

  public getFaceDetection(): FaceDetectionPayload {
    return this.currentDetection;
  }

  public async cleanup(): Promise<void> {
    this.stop();
  }
}
