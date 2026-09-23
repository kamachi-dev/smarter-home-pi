import { spawn, ChildProcess } from 'child_process';
import EventEmitter from 'events';
import fs from 'fs';
import jpeg from 'jpeg-js';
import { BaseSensor } from '../base.js';
import { SensorConfig, CameraReading, FaceDetectionPayload } from '../../types/index.js';
import { FaceRecognitionEngine } from './faceRecognition.js';
import { FrameAnnotator } from './frameAnnotator.js';
import { StandbyFrameGenerator } from './standbyGenerator.js';
import { EdgeMotionDetector, MotionDetectionResult } from './motionDetector.js';
import { PresenceTracker, PersonArrivalEvent } from './presenceTracker.js';
import { GpioManager } from '../../hardware/gpio.js';
import { TapoCameraService } from './tapoClient.js';

export class CameraSensor extends BaseSensor {
  private faceEngine: FaceRecognitionEngine;
  private presenceTracker: PresenceTracker;
  private tapoService: TapoCameraService;
  private cameraProcess: ChildProcess | null = null;
  private latestFrame: Buffer | null = null;
  private latestRawFrame: Buffer | null = null;
  private isProcessingFace: boolean = false;
  private recognitionTimer: NodeJS.Timeout | null = null;
  private streamListeners: Set<(frame: Buffer) => void> = new Set();
  private simulationInterval: NodeJS.Timeout | null = null;
  private captureStrategyIndex: number = 0;
  private motionDetector: EdgeMotionDetector;
  private latestMotion: MotionDetectionResult = { hasMotion: false, score: 0, changedPixels: 0, totalPixels: 0 };
  
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
    this.presenceTracker = PresenceTracker.getInstance();
    this.motionDetector = new EdgeMotionDetector();
    this.tapoService = new TapoCameraService({
      host: config.options?.tapoIp || config.options?.ip,
      user: config.options?.tapoUser || config.options?.user,
      password: config.options?.tapoPassword || config.options?.password,
    });
  }

  public async init(): Promise<void> {
    console.log(`[CameraSensor] Initializing Camera Pipeline (${this.config.name})...`);
    await this.tapoService.init();
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
   * Discovers and binds to attached camera hardware (Tapo IP Camera or RPi physical hardware)
   */
  private startCameraPipeline(): void {
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
    const customStreamUrl = this.config.options?.streamUrl || this.config.options?.camera_stream_url;
    const isRpi = this.config.options?.cameraType === 'rpi' ||
                  this.config.options?.ip === 'rpi-camera' ||
                  Boolean(customStreamUrl && customStreamUrl.startsWith('rpicam://'));

    let procName = 'ffmpeg';
    let procArgs: string[] = [];

    if (isRpi) {
      const hasRpicam = fs.existsSync('/usr/bin/rpicam-vid');
      if (hasRpicam) {
        procName = '/usr/bin/rpicam-vid';
        procArgs = ['-t', '0', '-n', '--width', '640', '--height', '480', '--codec', 'mjpeg', '--framerate', '10', '-o', '-'];
        console.log(`[CameraSensor] Initializing native CSI camera pipeline for "${this.config.name}" (/usr/bin/rpicam-vid)...`);
      } else if (fs.existsSync('/dev/video0')) {
        procName = 'ffmpeg';
        procArgs = [
          '-hide_banner', '-loglevel', 'warning',
          '-f', 'v4l2',
          '-input_format', 'mjpeg',
          '-video_size', '640x480',
          '-framerate', '10',
          '-i', '/dev/video0',
          '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '4', '-'
        ];
        console.log(`[CameraSensor] Initializing V4L2 camera pipeline for "${this.config.name}" (/dev/video0)...`);
      } else {
        console.log(`[CameraSensor] Native RPi camera hardware not detected, activating standby frame generator.`);
        this.startStandbyFrameGenerator();
        return;
      }
    } else {
      if (!customStreamUrl) {
        this.startStandbyFrameGenerator();
        return;
      }

      // Match VLC's standard RTSP connection options
      procName = 'ffmpeg';
      procArgs = [
        '-hide_banner', '-loglevel', 'warning',
        '-rtsp_transport', 'tcp',
        '-i', customStreamUrl,
        '-vf', 'scale=640:480',
        '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '4', '-r', '15', '-'
      ];
      console.log(`[CameraSensor] Ingesting RTSP stream for "${this.config.name}"...`);
    }

    const startTime = Date.now();

    try {
      this.cameraProcess = spawn(procName, procArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.attachMjpegStreamParser(this.cameraProcess, startTime, this.config.name);

      if (this.cameraProcess.stderr) {
        this.cameraProcess.stderr.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg) {
            console.log(`[CameraSensor: ${this.config.name}]`, msg);
          }
        });
      }

      this.cameraProcess.on('error', (err) => {
        console.warn(`[CameraSensor] ${procName} process error: ${err.message}`);
        this.startStandbyFrameGenerator();
        setTimeout(() => {
          if (this.isRunning) this.tryNextCaptureStrategy();
        }, 5000);
      });
    } catch (err) {
      console.warn(`[CameraSensor] Failed to spawn ${procName}: ${(err as Error).message}`);
      this.startStandbyFrameGenerator();
      setTimeout(() => {
        if (this.isRunning) this.tryNextCaptureStrategy();
      }, 5000);
    }
  }

  /**
   * Parses incoming MJPEG stream chunks from camera stdout
   */
  private attachMjpegStreamParser(proc: ChildProcess, spawnTime: number, strategyName: string): void {
    if (!proc.stdout) return;
    let buffer = Buffer.alloc(0);
    let receivedAnyFrame = false;

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      let latestCompleteFrame: Buffer | null = null;

      while (true) {
        const soi = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        if (soi === -1) {
          if (buffer.length > 2000000) buffer = Buffer.alloc(0);
          break;
        }
        if (soi > 0) {
          buffer = buffer.subarray(soi);
        }

        // Look for the next SOI to extract complete unbroken JPEG frame
        const nextSoi = buffer.indexOf(Buffer.from([0xff, 0xd8]), 2);
        if (nextSoi !== -1) {
          latestCompleteFrame = buffer.subarray(0, nextSoi);
          buffer = buffer.subarray(nextSoi);
          continue;
        }

        // If no next SOI yet, check for EOI followed by bytes
        const eoi = buffer.indexOf(Buffer.from([0xff, 0xd9]), 2);
        if (eoi !== -1 && buffer.length > eoi + 4) {
          latestCompleteFrame = buffer.subarray(0, eoi + 2);
          buffer = buffer.subarray(eoi + 2);
          continue;
        }

        break;
      }

      // Skip intermediate frames and always display & process ONLY the last frame of the stream
      if (latestCompleteFrame) {
        if (!receivedAnyFrame) {
          receivedAnyFrame = true;
          if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
          }
          console.log(`[CameraSensor] ✅ SUCCESS: Live camera frames streaming successfully via [${strategyName}]!`);
        }
        this.onNewCameraFrame(latestCompleteFrame);
      }
    });

    proc.on('close', (code) => {
      const runDuration = Date.now() - spawnTime;
      if (!receivedAnyFrame || runDuration < 2000) {
        console.warn(`[CameraSensor] Strategy [${strategyName}] exited after ${runDuration}ms (code ${code}).`);
        this.captureStrategyIndex++;
        this.tryNextCaptureStrategy();
      } else {
        console.warn(`[CameraSensor] Tapo camera stream via [${strategyName}] interrupted. Reconnecting...`);
        setTimeout(() => {
          if (this.isRunning) this.tryNextCaptureStrategy();
        }, 2000);
      }
    });
  }

  /**
   * Generates simulation camera footage when hardware camera is not physically attached
   */
  private startStandbyFrameGenerator(): void {
    if (this.simulationInterval) return;

    this.simulationInterval = setInterval(() => {
      if (!this.isRunning) {
        if (this.simulationInterval) clearInterval(this.simulationInterval);
        return;
      }
      const { frameData, detection } = StandbyFrameGenerator.generateFrame(640, 480);
      this.currentDetection = detection;
      this.onNewCameraFrame(frameData);
    }, 200);
  }

  /**
   * Processes each camera frame in real-time.
   * Ensures facial recognition and annotation is performed before distributing the frame.
   * Always displays the last frame of the stream, skipping intermediate frames.
   */
  private onNewCameraFrame(rawFrame: Buffer): void {
    this.latestRawFrame = rawFrame;

    // Fast edge motion detection (~0.5ms on Pi) before any expensive operations
    const motion = this.motionDetector.detectMotion(rawFrame);
    this.latestMotion = motion;

    if (motion.hasMotion) {
      this.emit('motion_detected', {
        sensorId: this.id,
        sensorName: this.config.name,
        score: motion.score,
        snapshot: rawFrame,
        timestamp: new Date().toISOString()
      });
    }

    // Immediately display the latest frame using active face detection annotations
    const annotated = this.currentDetection?.detected
      ? FrameAnnotator.annotateFrame(rawFrame, this.currentDetection)
      : rawFrame;
    this.broadcastFrame(annotated);

    // Only invoke face recognition when major motion is detected or currently tracking an active face
    if (!this.isProcessingFace && (motion.hasMotion || this.currentDetection?.detected)) {
      this.processFaceRecognitionAsync(rawFrame);
    }
  }

  private broadcastFrame(frame: Buffer): void {
    this.latestFrame = frame;
    this.emit('frame', frame);

    for (const listener of Array.from(this.streamListeners)) {
      try {
        listener(frame);
      } catch {}
    }
  }

  private async processFaceRecognitionAsync(rawFrame: Buffer): Promise<void> {
    this.isProcessingFace = true;
    try {
      const detection = await this.faceEngine.recognizeFrame(rawFrame);
      this.currentDetection = detection;
      this.emit('face_detection', detection);

      // Re-annotate and broadcast the current latest frame if a face is detected
      if (this.latestRawFrame && detection.detected) {
        const annotatedFrame = FrameAnnotator.annotateFrame(this.latestRawFrame, detection);
        this.broadcastFrame(annotatedFrame);
      }

      // Evaluate PresenceTracker to capture FIRST FRAME of any newly recognized people
      const newlyArrived = this.presenceTracker.processDetection(detection, rawFrame);
      for (const arrival of newlyArrived) {
        this.emit('person_arrival', arrival);
      }
    } catch (err) {
      console.error('[CameraSensor] Face recognition error:', (err as Error).message);
    } finally {
      this.isProcessingFace = false;
      // If a newer frame arrived while calculating, immediately process the latest frame (skipping intermediate frames)
      if (this.latestRawFrame && this.latestRawFrame !== rawFrame) {
        const next = this.latestRawFrame;
        setImmediate(() => {
          if (this.isRunning && !this.isProcessingFace) {
            this.processFaceRecognitionAsync(next);
          }
        });
      }
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
    this.broadcastFrame(annotatedFrame);

    // Evaluate PresenceTracker for first frame
    const newlyArrived = this.presenceTracker.processDetection(detection, annotatedFrame);
    for (const arrival of newlyArrived) {
      this.emit('person_arrival', arrival);
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
      if (this.latestMotion.hasMotion || this.currentDetection?.detected) {
        await this.processFaceRecognitionAsync(this.latestFrame);
      }
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

  public getLatestMotion(): MotionDetectionResult {
    return this.latestMotion;
  }

  public getFaceDetection(): FaceDetectionPayload {
    return this.currentDetection;
  }

  public getTapoService(): TapoCameraService {
    return this.tapoService;
  }

  public async cleanup(): Promise<void> {
    this.stop();
  }
}
