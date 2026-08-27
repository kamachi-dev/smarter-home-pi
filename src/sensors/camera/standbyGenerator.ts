import jpeg from 'jpeg-js';
import { FaceDetectionPayload } from '../../types/index.js';

export class StandbyFrameGenerator {
  private static step = 0;

  public static generateFrame(width = 640, height = 480): { frameData: Buffer; detection: FaceDetectionPayload } {
    this.step += 0.08;
    const buffer = Buffer.alloc(width * height * 4);

    // Dark sleek security feed background
    for (let y = 0; y < height; y++) {
      const yNorm = y / height;
      const r = Math.round(12 + yNorm * 8);
      const g = Math.round(14 + yNorm * 9);
      const b = Math.round(18 + yNorm * 12);
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        buffer[idx] = r;
        buffer[idx + 1] = g;
        buffer[idx + 2] = b;
        buffer[idx + 3] = 255;
      }
    }

    // Reticle Center Box
    const cx = width / 2;
    const cy = height / 2;
    const boxSize = 140;
    const bx = cx - boxSize / 2;
    const by = cy - boxSize / 2;

    for (let y = by; y < by + boxSize; y++) {
      for (let x = bx; x < bx + boxSize; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const isBorder = (x === bx || x === bx + boxSize - 1 || y === by || y === by + boxSize - 1);
          if (isBorder) {
            const idx = (y * width + x) * 4;
            buffer[idx] = 40;
            buffer[idx + 1] = 180;
            buffer[idx + 2] = 240;
          }
        }
      }
    }

    // Animated sweeping radar line
    const sweepY = Math.round(by + ((Math.sin(this.step) + 1) / 2) * boxSize);
    for (let x = bx + 2; x < bx + boxSize - 2; x++) {
      if (sweepY >= 0 && sweepY < height && x >= 0 && x < width) {
        const idx = (sweepY * width + x) * 4;
        buffer[idx] = 56;
        buffer[idx + 1] = 189;
        buffer[idx + 2] = 248;
      }
    }

    const detection: FaceDetectionPayload = {
      detected: false,
      status: 'none',
      person: null,
      confidence: 0,
      timestamp: new Date().toISOString()
    };

    const encoded = jpeg.encode({ data: buffer, width, height }, 70);
    return { frameData: encoded.data, detection };
  }
}
