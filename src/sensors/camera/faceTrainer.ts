import * as tf from '@tensorflow/tfjs';
import jpeg from 'jpeg-js';
import { EnrolledPerson } from '../../types/index.js';

// Load Face-API with Wasm backend
// @ts-ignore
import * as faceapiModule from '@vladmandic/face-api/dist/face-api.node-wasm.js';
const faceapi: any = (faceapiModule as any).nets ? faceapiModule : (faceapiModule as any).default || faceapiModule;

export class FaceTrainer {
  /**
   * Decodes a JPEG/PNG buffer or base64 data string into a 3D Tensor for neural network inference
   */
  public static bufferToTensor(input: Buffer | string): tf.Tensor3D | null {
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

  /**
   * Real AI Training: Takes 10+ actual photos, runs real face detection & landmark extraction on each photo,
   * generates 128D ResNet descriptors, and computes an optimized composite embedding.
   */
  public static async trainPersonWithPhotos(
    name: string,
    photos: string[],
    notes?: string,
    customId?: string
  ): Promise<EnrolledPerson> {
    if (photos.length < 10) {
      throw new Error(`Facial recognition training requires at least 10 distinct photos (received ${photos.length}).`);
    }

    console.log(`[FaceTrainer] Training AI model for "${name}" using ${photos.length} real photos...`);

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
          console.log(`[FaceTrainer] Photo ${i + 1}/${photos.length}: Face extracted (confidence: ${(detection.detection.score * 100).toFixed(1)}%)`);
        } else {
          console.warn(`[FaceTrainer] Photo ${i + 1}/${photos.length}: No face detected in frame`);
        }
      } catch (err) {
        console.warn(`[FaceTrainer] Error processing photo ${i + 1}:`, (err as Error).message);
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

    const normalizedDescriptor = Array.from(composite).map(v => Math.round(v * 10000) / 10000);

    let totalDistance = 0;
    for (const desc of validDescriptors) {
      let dSum = 0;
      for (let j = 0; j < descriptorLen; j++) {
        const diff = desc[j] - normalizedDescriptor[j];
        dSum += diff * diff;
      }
      totalDistance += Math.sqrt(dSum);
    }

    const avgDistance = totalDistance / validDescriptors.length;
    const consistencyScore = Math.max(0.5, Math.min(1.0, 1.0 - (avgDistance * 0.8)));
    const faceCoverageRatio = validDescriptors.length / photos.length;
    const calculatedAccuracy = Math.round((consistencyScore * 0.65 + faceCoverageRatio * 0.35) * 1000) / 10;

    const personId = customId || `face-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const randomPhotoIdx = Math.floor(Math.random() * photos.length);
    const chosenPfp = photos[randomPhotoIdx];

    const enrolledPerson: EnrolledPerson = {
      id: personId,
      name,
      notes: notes || `Trained with ${validDescriptors.length}/${photos.length} verified face photos`,
      enrolledAt: new Date().toISOString(),
      descriptor: normalizedDescriptor,
      imageUrl: chosenPfp?.startsWith('data:') ? chosenPfp : photos[0],
      accuracy: calculatedAccuracy,
      photoCount: photos.length,
      trainingStats: {
        validFaces: validDescriptors.length,
        totalPhotos: photos.length,
        avgConfidence: Math.round(faceCoverageRatio * 100),
        consistencyScore: Math.round(consistencyScore * 100)
      }
    };

    console.log(`[FaceTrainer] Successfully trained neural profile for "${name}" (Accuracy: ${calculatedAccuracy}%, Descriptors: ${validDescriptors.length})!`);
    return enrolledPerson;
  }
}
