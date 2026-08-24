import { spawn, ChildProcess } from 'child_process';
import EventEmitter from 'events';
import fs from 'fs';
import jpeg from 'jpeg-js';
import { BaseSensor } from '../base.js';
import { SensorConfig, CameraReading, FaceDetectionPayload } from '../../types/index.js';
import { FaceRecognitionEngine } from './faceRecognition.js';
import { GpioManager } from '../../hardware/gpio.js';

export class CameraSensor extends BaseSensor {
  private faceEngine: FaceRecognitionEngine;
  private cameraProcess: ChildProcess | null = null;
  private latestFrame: Buffer | null = null;
  private isProcessingFace: boolean = false;
  private recognitionTimer: NodeJS.Timeout | null = null;
  private streamListeners: Set<(frame: Buffer) => void> = new Set();
  
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
    console.log(`[CameraSensor] Initializing Raspberry Pi Camera Module (${this.config.name})...`);
    this.startHardwareCameraCapture();
  }

  public override start(): void {
    super.start();
    this.startFaceRecognitionPipeline();
  }

  public override stop(): void {
    super.stop();
    if (this.recognitionTimer) {
      clearInterval(this.recognitionTimer);
      this.recognitionTimer = null;
    }
    if (this.cameraProcess) {
      try {
        this.cameraProcess.kill('SIGTERM');
      } catch {}
      this.cameraProcess = null;
    }
  }

  /**
   * Spawns real Raspberry Pi Camera (libcamera / rpicam-vid) or USB camera (ffmpeg/v4l2)
   */
  private startHardwareCameraCapture(): void {
    const isLinux = GpioManager.getInstance().isHardwareMode();

    if (isLinux) {
      // 1. Try Raspberry Pi Camera Module (CSI) via rpicam-vid / libcamera-vid
      const rpiCmd = 'rpicam-vid';
      const rpiArgs = ['-t', '0', '--inline', '--codec', 'mjpeg', '--width', '640', '--height', '480', '--framerate', '15', '-o', '-'];

      try {
        console.log('[CameraSensor] Spawning Raspberry Pi CSI Camera:', rpiCmd, rpiArgs.join(' '));
        this.cameraProcess = spawn(rpiCmd, rpiArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
        this.attachMjpegStreamParser(this.cameraProcess);

        this.cameraProcess.on('error', (err) => {
          console.warn('[CameraSensor] rpicam-vid error, trying v4l2 USB camera fallback:', err.message);
          this.startV4L2Fallback();
        });
      } catch {
        this.startV4L2Fallback();
      }
    } else {
      console.log('[CameraSensor] Non-Linux environment detected, starting simulated CCTV frame generator');
      this.startSimulatedFrameGenerator();
    }
  }

  private startV4L2Fallback(): void {
    try {
      console.log('[CameraSensor] Spawning ffmpeg /dev/video0 capture...');
      const args = ['-f', 'v4l2', '-video_size', '640x480', '-framerate', '15', '-i', '/dev/video0', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
      this.cameraProcess = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
      this.attachMjpegStreamParser(this.cameraProcess);

      this.cameraProcess.on('error', () => {
        console.warn('[CameraSensor] /dev/video0 not accessible, starting simulated frame stream');
        this.startSimulatedFrameGenerator();
      });
    } catch {
      this.startSimulatedFrameGenerator();
    }
  }

  /**
   * Parses incoming MJPEG stream chunks from camera stdout by finding JPEG SOI (0xFF 0xD8) and EOI (0xFF 0xD9) markers
   */
  private attachMjpegStreamParser(proc: ChildProcess): void {
    if (!proc.stdout) return;
    let buffer = Buffer.alloc(0);

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      let startIndex = 0;
      while (true) {
        const soi = buffer.indexOf(Buffer.from([0xff, 0xd8]), startIndex);
        if (soi === -1) break;

        const eoi = buffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
        if (eoi === -1) break;

        const jpegFrame = buffer.subarray(soi, eoi + 2);
        this.onNewCameraFrame(jpegFrame);

        buffer = buffer.subarray(eoi + 2);
        startIndex = 0;
      }
    });

    proc.on('close', () => {
      console.warn('[CameraSensor] Camera process closed. Attempting restart in 3s...');
      setTimeout(() => {
        if (this.isRunning) this.startHardwareCameraCapture();
      }, 3000);
    });
  }

  /**
   * Generates standard 640x480 JPEG frames if physical camera hardware is in initialization
   */
  private startSimulatedFrameGenerator(): void {
    const width = 640;
    const height = 480;
    let tick = 0;

    const generateFrame = (): Buffer => {
      tick += 0.05;
      const frameData = Buffer.alloc(width * height * 4);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          // Gradient foyer background
          const r = Math.min(60, Math.floor(25 + (y / height) * 20));
          const g = Math.min(65, Math.floor(28 + (y / height) * 20));
          const b = Math.min(75, Math.floor(32 + (y / height) * 25));

          frameData[idx] = r;
          frameData[idx + 1] = g;
          frameData[idx + 2] = b;
          frameData[idx + 3] = 255;
        }
      }

      const encoded = jpeg.encode({ data: frameData, width, height }, 60);
      return encoded.data;
    };

    const interval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }
      this.onNewCameraFrame(generateFrame());
    }, 150);
  }

  private onNewCameraFrame(frame: Buffer): void {
    this.latestFrame = frame;
    this.emit('frame', frame);

    for (const listener of Array.from(this.streamListeners)) {
      try {
        listener(frame);
      } catch {}
    }
  }

  /**
   * Continuous background AI facial recognition loop analyzing real camera frames
   */
  private startFaceRecognitionPipeline(): void {
    if (this.recognitionTimer) return;

    this.recognitionTimer = setInterval(async () => {
      if (!this.isRunning || this.isProcessingFace) return;
      this.isProcessingFace = true;

      try {
        const detection = await this.faceEngine.recognizeFrame(this.latestFrame || undefined);
        this.currentDetection = detection;
        this.emit('face_detection', detection);
      } catch (err) {
        console.error('[CameraSensor] Face recognition error:', (err as Error).message);
      } finally {
        this.isProcessingFace = false;
      }
    }, 1200);
  }

  public getLatestFrame(): Buffer | null {
    return this.latestFrame;
  }

  public subscribeStream(listener: (frame: Buffer) => void): () => void {
    this.streamListeners.add(listener);
    return () => {
      this.streamListeners.delete(listener);
    };
  }

  public async read(): Promise<CameraReading> {
    const reading: CameraReading = {
      sensorId: this.id,
      sensorType: 'camera',
      timestamp: new Date().toISOString(),
      status: 'ok',
      faceDetection: this.currentDetection,
      snapshotBase64: this.latestFrame ? this.latestFrame.toString('base64') : undefined
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
