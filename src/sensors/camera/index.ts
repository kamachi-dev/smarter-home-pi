import { spawn, ChildProcess } from 'child_process';
import EventEmitter from 'events';
import fs from 'fs';
import jpeg from 'jpeg-js';
import { BaseSensor } from '../base.js';
import { SensorConfig, CameraReading, FaceDetectionPayload } from '../../types/index.js';
import { FaceRecognitionEngine } from './faceRecognition.js';
import { FrameAnnotator } from './frameAnnotator.js';
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
   * Discovers and binds to attached physical camera hardware
   */
  private startCameraPipeline(): void {
    const isLinux = GpioManager.getInstance().isHardwareMode();
    if (!isLinux) {
      console.log('[CameraSensor] Non-Linux host detected; using standby buffer');
      this.startStandbyFrameGenerator();
      return;
    }

    this.scanAndLogHardwareVideoDevices();
    this.tryNextCaptureStrategy();
  }

  private scanAndLogHardwareVideoDevices(): void {
    try {
      if (fs.existsSync('/dev')) {
        const videoNodes = fs.readdirSync('/dev').filter(f => f.startsWith('video') || f.startsWith('media'));
        console.log(`[CameraSensor] Physical video devices detected in /dev: [${videoNodes.join(', ') || 'None'}]`);
      }
    } catch {}
  }

  private tryNextCaptureStrategy(): void {
    // Find available video devices
    let v4lDevices = ['/dev/video0'];
    try {
      if (fs.existsSync('/dev')) {
        const found = fs.readdirSync('/dev')
          .filter(f => f.startsWith('video'))
          .map(f => `/dev/${f}`);
        if (found.length > 0) v4lDevices = found;
      }
    } catch {}

    const strategies: Array<{ name: string; cmd: string; args: string[] }> = [
      {
        name: 'rpicam-vid (RPi OS Bookworm / Bullseye CSI Camera)',
        cmd: 'rpicam-vid',
        args: ['-n', '-t', '0', '--inline', '--codec', 'mjpeg', '--width', '640', '--height', '480', '--framerate', '15', '-o', '-']
      },
      {
        name: 'libcamera-vid (Standard libcamera CSI Camera)',
        cmd: 'libcamera-vid',
        args: ['-n', '-t', '0', '--inline', '--codec', 'mjpeg', '--width', '640', '--height', '480', '--framerate', '15', '-o', '-']
      }
    ];

    // Add V4L2 ffmpeg strategies for all detected /dev/video* devices
    for (const vdev of v4lDevices.slice(0, 3)) {
      strategies.push({
        name: `ffmpeg ${vdev} (V4L2 Video Device)`,
        cmd: 'ffmpeg',
        args: ['-hide_banner', '-loglevel', 'error', '-f', 'v4l2', '-video_size', '640x480', '-framerate', '15', '-i', vdev, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']
      });
    }

    if (this.captureStrategyIndex >= strategies.length) {
      console.warn('[CameraSensor] All hardware camera strategies tested. Could not establish live frame stream from attached camera. Using standby buffer.');
      this.startStandbyFrameGenerator();
      return;
    }

    const current = strategies[this.captureStrategyIndex];
    console.log(`[CameraSensor] Testing camera strategy ${this.captureStrategyIndex + 1}/${strategies.length}: [${current.name}]...`);
    const startTime = Date.now();

    try {
      this.cameraProcess = spawn(current.cmd, current.args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.attachMjpegStreamParser(this.cameraProcess, startTime, current.name);

      if (this.cameraProcess.stderr) {
        this.cameraProcess.stderr.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg) {
            console.log(`[CameraHardware: ${current.cmd}]`, msg);
          }
        });
      }

      this.cameraProcess.on('error', (err) => {
        console.warn(`[CameraSensor] ${current.cmd} spawn error (${err.message}). Trying next strategy...`);
        this.captureStrategyIndex++;
        this.tryNextCaptureStrategy();
      });
    } catch (err) {
      console.warn(`[CameraSensor] Failed to spawn ${current.cmd}: ${(err as Error).message}`);
      this.captureStrategyIndex++;
      this.tryNextCaptureStrategy();
    }
  }

  /**
   * Parses incoming MJPEG stream chunks from camera stdout
   */
  private attachMjpegStreamParser(proc: ChildProcess, spawnTime: number, strategyName: string): void {
    if (!proc.stdout) return;
    let buffer = Buffer.alloc(0);
    let receivedAnyFrame = false;
    let frameCount = 0;

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        const soi = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        if (soi === -1) break;

        const eoi = buffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
        if (eoi === -1) break;

        const jpegFrame = buffer.subarray(soi, eoi + 2);
        if (!receivedAnyFrame) {
          receivedAnyFrame = true;
          console.log(`[CameraSensor] ✅ SUCCESS: Live hardware frames streaming successfully via [${strategyName}]!`);
        }
        frameCount++;
        this.onNewCameraFrame(jpegFrame);

        buffer = buffer.subarray(eoi + 2);
      }
    });

    proc.on('close', (code) => {
      const runDuration = Date.now() - spawnTime;
      if (!receivedAnyFrame || runDuration < 2000) {
        console.warn(`[CameraSensor] Strategy [${strategyName}] exited after ${runDuration}ms (code ${code}).`);
        this.captureStrategyIndex++;
        this.tryNextCaptureStrategy();
      } else {
        console.warn(`[CameraSensor] Camera stream via [${strategyName}] interrupted. Re-establishing...`);
        setTimeout(() => {
          if (this.isRunning) this.tryNextCaptureStrategy();
        }, 3000);
      }
    });
  }

  /**
   * Generates simulation camera footage when hardware camera is not physically attached
   */
  private startStandbyFrameGenerator(): void {
    if (this.simulationInterval) return;
    const width = 640;
    const height = 480;
    let step = 0;

    const generateSimulatedFrame = (): Buffer => {
      step += 0.05;
      const frameData = Buffer.alloc(width * height * 4);

      // Gradient background (security camera night/indoor ambiance)
      for (let y = 0; y < height; y++) {
        const yNorm = y / height;
        const r = Math.round(20 + yNorm * 10);
        const g = Math.round(22 + yNorm * 12);
        const b = Math.round(26 + yNorm * 15);
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          frameData[idx] = r;
          frameData[idx + 1] = g;
          frameData[idx + 2] = b;
          frameData[idx + 3] = 255;
        }
      }

      // Draw door / entryway frame in center
      const doorX = Math.round(width / 2 - 90);
      const doorY = 70;
      const doorW = 180;
      const doorH = 340;

      for (let y = doorY; y < doorY + doorH; y++) {
        for (let x = doorX; x < doorX + doorW; x++) {
          const idx = (y * width + x) * 4;
          frameData[idx] = 14;
          frameData[idx + 1] = 16;
          frameData[idx + 2] = 20;
        }
      }

      // Light cone from top
      for (let y = 0; y < height; y++) {
        const halfW = 40 + (y / height) * 220;
        const left = Math.max(0, Math.round(width / 2 - halfW));
        const right = Math.min(width, Math.round(width / 2 + halfW));
        for (let x = left; x < right; x++) {
          const idx = (y * width + x) * 4;
          const alpha = 0.08 * (1 - y / height);
          frameData[idx] = Math.min(255, Math.round(frameData[idx] + 254 * alpha));
          frameData[idx + 1] = Math.min(255, Math.round(frameData[idx + 1] + 240 * alpha));
          frameData[idx + 2] = Math.min(255, Math.round(frameData[idx + 2] + 200 * alpha));
        }
      }

      const encoded = jpeg.encode({ data: frameData, width, height }, 65);
      return encoded.data;
    };

    this.simulationInterval = setInterval(() => {
      if (!this.isRunning) {
        if (this.simulationInterval) clearInterval(this.simulationInterval);
        return;
      }
      this.onNewCameraFrame(generateSimulatedFrame());
    }, 200);
  }

  /**
   * Processes each camera frame by running facial recognition and placing
   * recognition squares before broadcasting to the live footage stream.
   */
  private onNewCameraFrame(rawFrame: Buffer): void {
    // Annotate frame with active facial recognition squares
    const annotated = FrameAnnotator.annotateFrame(rawFrame, this.currentDetection);
    this.latestFrame = annotated;
    this.emit('frame', annotated);

    for (const listener of Array.from(this.streamListeners)) {
      try {
        listener(annotated);
      } catch {}
    }

    // Trigger asynchronous face detection on raw frame if engine is idle
    if (!this.isProcessingFace) {
      this.processFaceRecognitionAsync(rawFrame);
    }
  }

  private async processFaceRecognitionAsync(frame: Buffer): Promise<void> {
    this.isProcessingFace = true;
    try {
      const detection = await this.faceEngine.recognizeFrame(frame);
      this.currentDetection = detection;
      this.emit('face_detection', detection);
    } catch (err) {
      console.error('[CameraSensor] Face recognition error:', (err as Error).message);
    } finally {
      this.isProcessingFace = false;
    }
  }

  /**
   * Ingests an external frame (e.g. from browser webcam or external stream),
   * executes facial recognition, places recognition squares, and updates live footage.
   */
  public async ingestFrame(frameBuffer: Buffer): Promise<{ detection: FaceDetectionPayload; annotatedFrame: Buffer }> {
    const detection = await this.faceEngine.recognizeFrame(frameBuffer);
    this.currentDetection = detection;
    this.emit('face_detection', detection);

    const annotatedFrame = FrameAnnotator.annotateFrame(frameBuffer, detection);
    this.latestFrame = annotatedFrame;
    this.emit('frame', annotatedFrame);

    for (const listener of Array.from(this.streamListeners)) {
      try {
        listener(annotatedFrame);
      } catch {}
    }

    return { detection, annotatedFrame };
  }

  /**
   * Continuous background AI facial recognition loop analyzing real camera frames
   */
  private startFaceRecognitionPipeline(): void {
    if (this.recognitionTimer) return;

    this.recognitionTimer = setInterval(async () => {
      if (!this.isRunning || this.isProcessingFace || !this.latestFrame) return;
      await this.processFaceRecognitionAsync(this.latestFrame);
    }, 1000);
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
