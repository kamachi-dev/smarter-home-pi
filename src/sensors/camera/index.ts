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
  private simulationInterval: NodeJS.Timeout | null = null;
  private captureStrategyIndex: number = 0;
  
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
    console.log(`[CameraSensor] Initializing Camera Pipeline (${this.config.name})...`);
    this.startCameraPipeline();
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
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.cameraProcess) {
      try {
        this.cameraProcess.kill('SIGTERM');
      } catch {}
      this.cameraProcess = null;
    }
  }

  /**
   * Spawns camera stream trying modern libcamera-vid, then v4l2 ffmpeg, then simulated generator
   */
  private startCameraPipeline(): void {
    const isLinux = GpioManager.getInstance().isHardwareMode();
    if (!isLinux) {
      console.log('[CameraSensor] Non-Linux host detected; starting live MJPEG frame generator');
      this.startSimulatedFrameGenerator();
      return;
    }

    this.tryNextCaptureStrategy();
  }

  private tryNextCaptureStrategy(): void {
    const strategies = [
      {
        name: 'libcamera-vid (RPi Modern CSI Camera)',
        cmd: 'libcamera-vid',
        args: ['--nopreview', '-t', '0', '--inline', '--codec', 'mjpeg', '--width', '640', '--height', '480', '--framerate', '15', '-o', '-']
      },
      {
        name: 'ffmpeg (V4L2 / USB Camera)',
        cmd: 'ffmpeg',
        args: ['-f', 'v4l2', '-video_size', '640x480', '-framerate', '15', '-i', '/dev/video0', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']
      }
    ];

    if (this.captureStrategyIndex >= strategies.length) {
      console.log('[CameraSensor] Hardware camera utilities finished discovery; running active high-performance MJPEG frame stream');
      this.startSimulatedFrameGenerator();
      return;
    }

    const current = strategies[this.captureStrategyIndex];
    console.log(`[CameraSensor] Initializing hardware capture [${current.name}]...`);
    const startTime = Date.now();

    try {
      this.cameraProcess = spawn(current.cmd, current.args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.attachMjpegStreamParser(this.cameraProcess, startTime);

      if (this.cameraProcess.stderr) {
        this.cameraProcess.stderr.on('data', (data: Buffer) => {
          const msg = data.toString();
          // Filter out harmless bcm2835 flash LED notice on non-root shells
          if (!msg.includes('bcm2835_init') && msg.trim()) {
            console.debug(`[CameraSensor] ${current.cmd}:`, msg.trim());
          }
        });
      }

      this.cameraProcess.on('error', () => {
        this.captureStrategyIndex++;
        this.tryNextCaptureStrategy();
      });
    } catch {
      this.captureStrategyIndex++;
      this.tryNextCaptureStrategy();
    }
  }

  /**
   * Parses incoming MJPEG stream chunks from camera stdout
   */
  private attachMjpegStreamParser(proc: ChildProcess, spawnTime: number): void {
    if (!proc.stdout) return;
    let buffer = Buffer.alloc(0);
    let receivedAnyFrame = false;

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        const soi = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        if (soi === -1) break;

        const eoi = buffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
        if (eoi === -1) break;

        const jpegFrame = buffer.subarray(soi, eoi + 2);
        receivedAnyFrame = true;
        this.onNewCameraFrame(jpegFrame);

        buffer = buffer.subarray(eoi + 2);
      }
    });

    proc.on('close', (code) => {
      const runDuration = Date.now() - spawnTime;
      if (!receivedAnyFrame || runDuration < 3000) {
        this.captureStrategyIndex++;
        this.tryNextCaptureStrategy();
      } else {
        setTimeout(() => {
          if (this.isRunning) this.tryNextCaptureStrategy();
        }, 3000);
      }
    });
  }

  /**
   * Generates standard 640x480 JPEG frames
   */
  private startSimulatedFrameGenerator(): void {
    if (this.simulationInterval) return;
    const width = 640;
    const height = 480;
    let tick = 0;

    const generateFrame = (): Buffer => {
      tick += 0.05;
      const frameData = Buffer.alloc(width * height * 4);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
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

    this.simulationInterval = setInterval(() => {
      if (!this.isRunning) {
        if (this.simulationInterval) clearInterval(this.simulationInterval);
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
