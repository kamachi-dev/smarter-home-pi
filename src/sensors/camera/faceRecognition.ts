import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import jpeg from 'jpeg-js';
import { FaceDetectionPayload, EnrolledPerson } from '../../types/index.js';
import { config } from '../../config/env.js';

// Load Face-API with Wasm backend
// @ts-ignore
import * as faceapiModule from '@vladmandic/face-api/dist/face-api.node-wasm.js';
const faceapi: any = (faceapiModule as any).nets ? faceapiModule : (faceapiModule as any).default || faceapiModule;

export class FaceRecognitionEngine {
  private static instance: FaceRecognitionEngine;
  private enrolledPeople: EnrolledPerson[] = [];
  private faceMatcher: any = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private matchDistanceThreshold = 0.55;

  private constructor() {
    this.initPromise = this.initNeuralModels();
  }

  public static getInstance(): FaceRecognitionEngine {
    if (!FaceRecognitionEngine.instance) {
      FaceRecognitionEngine.instance = new FaceRecognitionEngine();
    }
    return FaceRecognitionEngine.instance;
  }

  private async initNeuralModels(): Promise<void> {
    try {
      console.log('[FaceRecognitionEngine] Initializing TensorFlow Wasm backend...');
      await tf.setBackend('wasm');
      await tf.ready();

      // Find models directory
      let modelDir = config.modelsPath;
      if (!fs.existsSync(modelDir)) {
        const pkgModelDir = path.resolve(process.cwd(), 'node_modules/@vladmandic/face-api/model');
        if (fs.existsSync(pkgModelDir)) {
          modelDir = pkgModelDir;
        }
      }

      console.log(`[FaceRecognitionEngine] Loading neural face recognition models from: ${modelDir}`);
      await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);
      await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(modelDir);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir);
      try {
        if (faceapi.nets.ssdMobilenetv1) {
          await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir);
        }
      } catch {}

      this.isInitialized = true;
      console.log('[FaceRecognitionEngine] Real neural models (TinyFaceDetector + FaceLandmark68 + FaceRecognitionNet) loaded successfully!');

      this.loadEnrolledPeople();
      this.rebuildFaceMatcher();
    } catch (err) {
      console.error('[FaceRecognitionEngine] Failed to load neural face models:', (err as Error).message);
    }
  }

  private loadEnrolledPeople(): void {
    try {
      if (fs.existsSync(config.enrolledFacesPath)) {
        const raw = fs.readFileSync(config.enrolledFacesPath, 'utf8');
        this.enrolledPeople = JSON.parse(raw);
        console.log(`[FaceRecognitionEngine] Loaded ${this.enrolledPeople.length} enrolled person profile(s) from disk`);
      } else {
        this.enrolledPeople = [];
        this.saveEnrolledPeople();
      }
    } catch (err) {
      console.warn('[FaceRecognitionEngine] Error loading enrolled profiles:', (err as Error).message);
      this.enrolledPeople = [];
    }
  }

  public saveEnrolledPeople(): void {
    try {
      fs.writeFileSync(config.enrolledFacesPath, JSON.stringify(this.enrolledPeople, null, 2), 'utf8');
      this.rebuildFaceMatcher();
    } catch (err) {
      console.error('[FaceRecognitionEngine] Failed to save enrolled profiles:', (err as Error).message);
    }
  }

  /**
   * Rebuilds real faceapi.FaceMatcher instance with 128-D descriptors from all enrolled members
   */
  private rebuildFaceMatcher(): void {
    if (this.enrolledPeople.length === 0) {
      this.faceMatcher = null;
      return;
    }

    try {
      const labeledDescriptors: any[] = [];
      for (const person of this.enrolledPeople) {
        if (person.descriptor && person.descriptor.length === 128) {
          const descFloat = new Float32Array(person.descriptor);
          labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(person.name, [descFloat]));
        }
      }

      if (labeledDescriptors.length > 0) {
        this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, this.matchDistanceThreshold);
        console.log(`[FaceRecognitionEngine] FaceMatcher rebuilt with ${labeledDescriptors.length} active person profile(s)`);
      }
    } catch (err) {
      console.error('[FaceRecognitionEngine] Error rebuilding FaceMatcher:', (err as Error).message);
    }
  }

  /**
   * Decodes a JPEG/PNG buffer or base64 data string into a 3D Tensor for neural network inference
   */
  private bufferToTensor(input: Buffer | string): tf.Tensor3D | null {
    try {
      let buffer: Buffer;
      if (typeof input === 'string') {
        const base64Data = input.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        buffer = input;
      }

      const decoded = jpeg.decode(buffer, { useTArray: true });
      const { width, height, data } = decoded;
      const numPixels = width * height;
      const values = new Float32Array(numPixels * 3);

      for (let i = 0; i < numPixels; i++) {
        values[i * 3 + 0] = data[i * 4 + 0];
        values[i * 3 + 1] = data[i * 4 + 1];
        values[i * 3 + 2] = data[i * 4 + 2];
      }

      return tf.tensor3d(values, [height, width, 3], 'int32');
    } catch (err) {
      console.warn('[FaceRecognitionEngine] Buffer to Tensor decode error:', (err as Error).message);
      return null;
    }
  }

  /**
   * Real AI Training: Takes 10+ actual photos, runs real face detection & landmark extraction on each photo,
   * generates 128D ResNet descriptors, and computes an optimized composite embedding.
   */
  public async trainPersonWithPhotos(
    name: string,
    photos: string[],
    notes?: string,
    customId?: string
  ): Promise<EnrolledPerson> {
    if (this.initPromise) await this.initPromise;

    if (photos.length < 10) {
      throw new Error(`Facial recognition training requires at least 10 distinct photos (received ${photos.length}).`);
    }

    console.log(`[FaceRecognitionEngine] Training AI model for "${name}" using ${photos.length} real photos...`);

    const validDescriptors: Float32Array[] = [];
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });

    for (let i = 0; i < photos.length; i++) {
      const tensor = this.bufferToTensor(photos[i]);
      if (!tensor) continue;

      try {
        const detection = await faceapi.detectSingleFace(tensor, detectorOptions)
          .withFaceLandmarks(true)
          .withFaceDescriptor();

        if (detection && detection.descriptor) {
          validDescriptors.push(detection.descriptor);
          console.log(`[FaceRecognitionEngine] Photo ${i + 1}/${photos.length}: Face extracted (confidence: ${(detection.detection.score * 100).toFixed(1)}%)`);
        } else {
          console.warn(`[FaceRecognitionEngine] Photo ${i + 1}/${photos.length}: No face detected in frame`);
        }
      } catch (err) {
        console.warn(`[FaceRecognitionEngine] Error processing photo ${i + 1}:`, (err as Error).message);
      } finally {
        tensor.dispose();
      }
    }

    if (validDescriptors.length === 0) {
      throw new Error('Could not detect a clear human face in any of the uploaded photos. Please upload clearer photos.');
    }

    // Compute composite 128-dimensional mean centroid descriptor
    const descriptorLen = 128;
    const composite = new Float32Array(descriptorLen);

    for (const desc of validDescriptors) {
      for (let j = 0; j < descriptorLen; j++) {
        composite[j] += desc[j] / validDescriptors.length;
      }
    }

    // Normalize embedding vector
    let sumSq = 0;
    for (let j = 0; j < descriptorLen; j++) sumSq += composite[j] * composite[j];
    const norm = Math.sqrt(sumSq) || 1;
    const normalizedDescriptor = Array.from(composite).map(v => Math.round((v / norm) * 10000) / 10000);

    const personId = customId || `face-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const enrolledPerson: EnrolledPerson = {
      id: personId,
      name,
      notes: notes || `Trained with ${validDescriptors.length}/${photos.length} verified face photos`,
      enrolledAt: new Date().toISOString(),
      descriptor: normalizedDescriptor,
      imageUrl: photos[0]?.startsWith('data:') ? photos[0] : undefined
    };

    const existingIdx = this.enrolledPeople.findIndex(p => p.id === personId || p.name.toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) {
      this.enrolledPeople[existingIdx] = enrolledPerson;
    } else {
      this.enrolledPeople.push(enrolledPerson);
    }

    this.saveEnrolledPeople();
    console.log(`[FaceRecognitionEngine] Successfully trained neural profile for "${name}" with ${validDescriptors.length} descriptors!`);
    return enrolledPerson;
  }

  /**
   * Real Facial Recognition: Runs TinyFaceDetector + FaceLandmark68 + FaceRecognitionNet on real camera frame buffer
   */
  public async recognizeFrame(imageBuffer?: Buffer): Promise<FaceDetectionPayload> {
    const timestamp = new Date().toISOString();
    if (this.initPromise) await this.initPromise;

    if (!imageBuffer || imageBuffer.length === 0) {
      return {
        detected: false,
        status: 'none',
        person: null,
        confidence: 0,
        timestamp,
        faces: []
      };
    }

    const tensor = this.bufferToTensor(imageBuffer);
    if (!tensor) {
      return {
        detected: false,
        status: 'none',
        person: null,
        confidence: 0,
        timestamp,
        faces: []
      };
    }

    try {
      // Multi-scale TinyFaceDetector and SsdMobilenetv1 cascade for wide-angle room cameras
      let detections: any = null;

      try {
        const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.18 });
        detections = await faceapi.detectAllFaces(tensor, detectorOptions)
          .withFaceLandmarks(true)
          .withFaceDescriptors();
      } catch {}

      // Fallback 1: 512px resolution for smaller/distant faces in room cameras
      if (!detections || detections.length === 0) {
        try {
          const hiresOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.15 });
          detections = await faceapi.detectAllFaces(tensor, hiresOptions)
            .withFaceLandmarks(true)
            .withFaceDescriptors();
        } catch {}
      }

      // Fallback 2: 320px standard resolution
      if (!detections || detections.length === 0) {
        try {
          const fallbackOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 });
          detections = await faceapi.detectAllFaces(tensor, fallbackOptions)
            .withFaceLandmarks(true)
            .withFaceDescriptors();
        } catch {}
      }

      // Fallback 3: SSD MobileNet V1 if loaded
      if ((!detections || detections.length === 0) && faceapi.nets.ssdMobilenetv1?.params) {
        try {
          const ssdOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 });
          detections = await faceapi.detectAllFaces(tensor, ssdOptions)
            .withFaceLandmarks(true)
            .withFaceDescriptors();
        } catch {}
      }

      if (!detections || detections.length === 0) {
        return {
          detected: false,
          status: 'none',
          person: null,
          confidence: 0,
          timestamp,
          faces: []
        };
      }

      const detectedFaces: any[] = [];
      let anyRecognized = false;
      let primaryPerson: string | null = null;
      let primaryConfidence = 0;

      for (const det of detections) {
        const box = {
          x: Math.round(det.detection.box.x),
          y: Math.round(det.detection.box.y),
          width: Math.round(det.detection.box.width),
          height: Math.round(det.detection.box.height)
        };

        let isMatch = false;
        let personName = 'Unknown Person';
        let conf = Math.round(det.detection.score * 100) / 100;

        if (this.faceMatcher && det.descriptor) {
          const bestMatch = this.faceMatcher.findBestMatch(det.descriptor);
          if (bestMatch.label !== 'unknown' && bestMatch.distance <= this.matchDistanceThreshold) {
            isMatch = true;
            personName = bestMatch.label;
            conf = Math.round(Math.max(0.5, 1 - bestMatch.distance) * 100) / 100;
          }
        }

        if (isMatch) {
          anyRecognized = true;
          if (!primaryPerson) {
            primaryPerson = personName;
            primaryConfidence = conf;
          }
        }

        detectedFaces.push({
          box,
          status: isMatch ? 'recognized' : 'unknown',
          person: isMatch ? personName : 'Unknown Person',
          confidence: conf
        });
      }

      const primary = detectedFaces[0];
      return {
        detected: true,
        status: anyRecognized ? 'recognized' : 'unknown',
        person: primaryPerson || primary.person,
        confidence: primaryPerson ? primaryConfidence : primary.confidence,
        timestamp,
        box: primary.box,
        faces: detectedFaces
      };

    } catch (err) {
      console.error('[FaceRecognitionEngine] Inference error on real frame:', (err as Error).message);
      return {
        detected: false,
        status: 'none',
        person: null,
        confidence: 0,
        timestamp,
        faces: []
      };
    } finally {
      tensor.dispose();
    }
  }

  public enrollPerson(name: string, notes?: string, descriptor?: number[]): EnrolledPerson {
    const newPerson: EnrolledPerson = {
      id: `face-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name,
      notes,
      enrolledAt: new Date().toISOString(),
      descriptor: descriptor || Array.from({ length: 128 }, () => 0)
    };

    this.enrolledPeople.push(newPerson);
    this.saveEnrolledPeople();
    return newPerson;
  }

  public removeEnrolledPerson(id: string): boolean {
    const initialLen = this.enrolledPeople.length;
    this.enrolledPeople = this.enrolledPeople.filter(p => p.id !== id);
    if (this.enrolledPeople.length !== initialLen) {
      this.saveEnrolledPeople();
      return true;
    }
    return false;
  }

  public getEnrolledPeople(): EnrolledPerson[] {
    return [...this.enrolledPeople];
  }
}
