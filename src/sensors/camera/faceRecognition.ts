import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import jpeg from 'jpeg-js';
import { FaceDetectionPayload, EnrolledPerson } from '../../types/index.js';
import { config } from '../../config/env.js';
import { FaceTrainer } from './faceTrainer.js';

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
  private matchDistanceThreshold = config.faceMatchThreshold || 0.62;

  private constructor() {
    // Defer neural model loading until first on-demand call
  }

  public static getInstance(): FaceRecognitionEngine {
    if (!FaceRecognitionEngine.instance) {
      FaceRecognitionEngine.instance = new FaceRecognitionEngine();
    }
    return FaceRecognitionEngine.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    if (!this.initPromise) this.initPromise = this.initNeuralModels();
    return this.initPromise;
  }

  private async initNeuralModels(): Promise<void> {
    try {
      console.log('[FaceRecognitionEngine] Initializing TensorFlow Wasm backend...');
      await tf.setBackend('wasm');
      await tf.ready();

      const modelDir = fs.existsSync(config.modelsPath) ? config.modelsPath : path.resolve(process.cwd(), 'node_modules/@vladmandic/face-api/model');
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
      await this.verifyEnrolledDescriptors();
      this.rebuildFaceMatcher();
    } catch (err) {
      console.error('[FaceRecognitionEngine] Failed to load neural face models:', (err as Error).message);
    }
  }

  private loadEnrolledPeople(): void {
    try {
      if (fs.existsSync(config.enrolledFacesPath)) {
        this.enrolledPeople = JSON.parse(fs.readFileSync(config.enrolledFacesPath, 'utf8'));
        console.log(`[FaceRecognitionEngine] Loaded ${this.enrolledPeople.length} enrolled person profile(s) from disk`);
      } else {
        this.enrolledPeople = [];
        this.saveEnrolledPeople();
      }
    } catch {
      this.enrolledPeople = [];
    }
  }

  public saveEnrolledPeople(): void {
    try {
      fs.writeFileSync(config.enrolledFacesPath, JSON.stringify(this.enrolledPeople, null, 2), 'utf8');
      this.rebuildFaceMatcher();
    } catch {}
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
      const buffer = typeof input === 'string' ? Buffer.from(input.replace(/^data:image\/\w+;base64,/, ''), 'base64') : input;
      const { width, height, data } = jpeg.decode(buffer, { useTArray: true });
      const numPixels = width * height;
      const values = new Float32Array(numPixels * 3);
      for (let i = 0; i < numPixels; i++) {
        values[i * 3] = data[i * 4];
        values[i * 3 + 1] = data[i * 4 + 1];
        values[i * 3 + 2] = data[i * 4 + 2];
      }
      return tf.tensor3d(values, [height, width, 3], 'int32');
    } catch {
      return null;
    }
  }

  public async trainPersonWithPhotos(
    name: string,
    photos: string[],
    notes?: string,
    customId?: string
  ): Promise<EnrolledPerson> {
    await this.ensureInitialized();
    const enrolledPerson = await FaceTrainer.trainPersonWithPhotos(name, photos, notes, customId);
    const existingIdx = this.enrolledPeople.findIndex(p => p.id === enrolledPerson.id || p.name.toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) {
      this.enrolledPeople[existingIdx] = enrolledPerson;
    } else {
      this.enrolledPeople.push(enrolledPerson);
    }
    this.saveEnrolledPeople();
    return enrolledPerson;
  }

  /**
   * Fast Face Detection only: Runs TinyFaceDetector without extracting 68 landmarks or 128D embeddings.
   * Only executed when motion has been detected.
   */
  public async detectFacesOnly(imageBuffer?: Buffer): Promise<FaceDetectionPayload> {
    const timestamp = new Date().toISOString();
    await this.ensureInitialized();

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
      let detections: any = null;
      for (const size of [320, 416]) {
        try {
          const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.20 });
          detections = await faceapi.detectAllFaces(tensor, opt);
          if (detections && detections.length > 0) break;
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

      const detectedFaces = detections.map((det: any) => ({
        box: {
          x: Math.round(det.box.x),
          y: Math.round(det.box.y),
          width: Math.round(det.box.width),
          height: Math.round(det.box.height)
        },
        status: 'unknown' as const,
        person: 'Unknown Person',
        confidence: Math.round(det.score * 100) / 100
      }));

      const primary = detectedFaces[0];
      return {
        detected: true,
        status: 'unknown',
        person: null,
        confidence: primary.confidence,
        timestamp,
        box: primary.box,
        faces: detectedFaces
      };
    } catch (err) {
      console.error('[FaceRecognitionEngine] Fast face detection error:', (err as Error).message);
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

  /**
   * Real Facial Recognition: Runs TinyFaceDetector + FaceLandmark68 + FaceRecognitionNet on real camera frame buffer
   */
  public async recognizeFrame(imageBuffer?: Buffer): Promise<FaceDetectionPayload> {
    const timestamp = new Date().toISOString();
    await this.ensureInitialized();

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

      for (const size of [416, 512, 320]) {
        try {
          const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: size === 416 ? 0.18 : 0.15 });
          detections = await faceapi.detectAllFaces(tensor, opt).withFaceLandmarks(true).withFaceDescriptors();
          if (detections && detections.length > 0) break;
        } catch {}
      }

      // Fallback: SSD MobileNet V1 if loaded
      if ((!detections || detections.length === 0) && faceapi.nets.ssdMobilenetv1?.params) {
        try {
          const ssdOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 });
          detections = await faceapi.detectAllFaces(tensor, ssdOptions).withFaceLandmarks(true).withFaceDescriptors();
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
          const match = this.faceMatcher.matchDescriptor(det.descriptor);
          const dist = match.distance;
          const candidate = match.label;
          if (candidate !== 'unknown' && dist <= this.matchDistanceThreshold) {
            isMatch = true;
            personName = candidate;
            conf = Math.round(Math.max(0.60, 1 - (dist * 0.7)) * 100) / 100;
          } else {
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

  public updateEnrolledPerson(id: string, updates: Partial<EnrolledPerson>): EnrolledPerson | null {
    const idx = this.enrolledPeople.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.enrolledPeople[idx] = { ...this.enrolledPeople[idx], ...updates, id };
    this.saveEnrolledPeople();
    return this.enrolledPeople[idx];
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

  public applyModelDescriptor(modelData: {
    id: string;
    name: string;
    role?: string;
    notes?: string;
    descriptor: number[];
    accuracy?: number;
    photoCount?: number;
    imageUrl?: string;
    trainingStats?: any;
  }): EnrolledPerson {
    const existingIdx = this.enrolledPeople.findIndex(
      p => p.id === modelData.id || p.name.toLowerCase() === modelData.name.toLowerCase()
    );

    const personProfile: EnrolledPerson = {
      id: modelData.id,
      name: modelData.name,
      notes: modelData.notes || modelData.role || 'Resident',
      enrolledAt: new Date().toISOString(),
      descriptor: modelData.descriptor,
      imageUrl: modelData.imageUrl,
      accuracy: modelData.accuracy,
      photoCount: modelData.photoCount,
      trainingStats: modelData.trainingStats
    };

    if (existingIdx >= 0) {
      this.enrolledPeople[existingIdx] = personProfile;
    } else {
      this.enrolledPeople.push(personProfile);
    }

    this.saveEnrolledPeople();
    const norm = modelData.descriptor ? Math.sqrt(modelData.descriptor.reduce((s, v) => s + v * v, 0)) : 0;
    if ((norm < 0.9 || norm > 2.0) && modelData.imageUrl) {
      this.extractDescriptorFromImage(modelData.imageUrl).then(realDesc => {
        if (realDesc) {
          personProfile.descriptor = realDesc;
          this.saveEnrolledPeople();
        }
      }).catch(() => {});
    }
    console.log(`[FaceRecognitionEngine] 🧠 Applied updated model descriptor for "${modelData.name}" and swapped into active FaceMatcher!`);
    return personProfile;
  }

  public async extractDescriptorFromImage(input: Buffer | string): Promise<number[] | null> {
    const tensor = this.bufferToTensor(input);
    if (!tensor) return null;
    try {
      const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.12 });
      const det = await faceapi.detectSingleFace(tensor, opt).withFaceLandmarks(true).withFaceDescriptor();
      return det?.descriptor ? Array.from(det.descriptor) : null;
    } catch {
      return null;
    } finally {
      tensor.dispose();
    }
  }

  private async verifyEnrolledDescriptors(): Promise<void> {
    let updated = false;
    for (const p of this.enrolledPeople) {
      const norm = p.descriptor ? Math.sqrt(p.descriptor.reduce((s, v) => s + v * v, 0)) : 0;
      if ((norm < 0.9 || norm > 2.0) && p.imageUrl) {
        const realDesc = await this.extractDescriptorFromImage(p.imageUrl);
        if (realDesc) {
          p.descriptor = realDesc;
          updated = true;
          console.log(`[FaceRecognitionEngine] 🧬 Verified and upgraded real 128D embedding for "${p.name}"`);
        }
      }
    }
    if (updated) this.saveEnrolledPeople();
  }

  public getEnrolledPeople(): EnrolledPerson[] {
    return [...this.enrolledPeople];
  }

  public getMatcherThreshold(): number { return this.matchDistanceThreshold; }
  public setMatcherThreshold(threshold: number): void { this.matchDistanceThreshold = threshold; this.rebuildFaceMatcher(); }
}
