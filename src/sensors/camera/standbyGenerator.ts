import jpeg from 'jpeg-js';
import { FaceDetectionPayload } from '../../types/index.js';

export class StandbyFrameGenerator {
  private static step = 0;

  public static generateFrame(width = 640, height = 480): { frameData: Buffer; detection: FaceDetectionPayload } {
    this.step += 0.05;
    const buffer = Buffer.alloc(width * height * 4);

    // 1. Porch background & ambient wall gradient
    for (let y = 0; y < height; y++) {
      const yNorm = y / height;
      const r = Math.round(35 + yNorm * 20);
      const g = Math.round(38 + yNorm * 22);
      const b = Math.round(44 + yNorm * 26);
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        buffer[idx] = r;
        buffer[idx + 1] = g;
        buffer[idx + 2] = b;
        buffer[idx + 3] = 255;
      }
    }

    // 2. Doorway & Trim
    const doorX = Math.round(width / 2 - 100);
    const doorY = 60;
    const doorW = 200;
    const doorH = 380;

    for (let y = doorY - 8; y < doorY + doorH; y++) {
      for (let x = doorX - 10; x < doorX + doorW + 10; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          buffer[idx] = 28;
          buffer[idx + 1] = 30;
          buffer[idx + 2] = 36;
        }
      }
    }

    for (let y = doorY; y < doorY + doorH; y++) {
      for (let x = doorX; x < doorX + doorW; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          buffer[idx] = 18;
          buffer[idx + 1] = 22;
          buffer[idx + 2] = 28;
        }
      }
    }

    // Smart door lock circular keypad / handle
    const lockX = doorX + 165;
    const lockY = 250;
    for (let dy = -16; dy <= 16; dy++) {
      for (let dx = -16; dx <= 16; dx++) {
        if (dx * dx + dy * dy <= 256) {
          const px = lockX + dx;
          const py = lockY + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            buffer[idx] = 180;
            buffer[idx + 1] = 190;
            buffer[idx + 2] = 205;
          }
        }
      }
    }

    // 3. Warm Porch Overhead Sconce Light
    const lightX = width / 2;
    const lightY = 30;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - lightX;
        const dy = y - lightY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const intensity = Math.max(0, 1 - dist / 380);
        if (intensity > 0) {
          const idx = (y * width + x) * 4;
          buffer[idx] = Math.min(255, Math.round(buffer[idx] + 120 * intensity));
          buffer[idx + 1] = Math.min(255, Math.round(buffer[idx + 1] + 110 * intensity));
          buffer[idx + 2] = Math.min(255, Math.round(buffer[idx + 2] + 70 * intensity));
        }
      }
    }

    // 4. Simulated Person in Entryway with animated movement
    const personX = Math.round(width / 2 + Math.sin(this.step) * 12);
    const personHeadY = 175 + Math.round(Math.cos(this.step * 1.5) * 4);
    const headRadius = 40;

    // Torso & Jacket
    for (let y = personHeadY + headRadius; y < personHeadY + 230; y++) {
      const span = Math.round(55 + (y - (personHeadY + headRadius)) * 0.4);
      for (let x = personX - span; x < personX + span; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          buffer[idx] = 30;
          buffer[idx + 1] = 45;
          buffer[idx + 2] = 60;
        }
      }
    }

    // Head / Face
    for (let dy = -headRadius; dy <= headRadius; dy++) {
      for (let dx = -Math.round(headRadius * 0.85); dx <= Math.round(headRadius * 0.85); dx++) {
        if (dx * dx + dy * dy <= headRadius * headRadius) {
          const px = personX + dx;
          const py = personHeadY + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            buffer[idx] = 215;
            buffer[idx + 1] = 175;
            buffer[idx + 2] = 145;
          }
        }
      }
    }

    // Hair
    for (let dy = -headRadius; dy <= -10; dy++) {
      for (let dx = -Math.round(headRadius * 0.88); dx <= Math.round(headRadius * 0.88); dx++) {
        if (dx * dx + dy * dy <= headRadius * headRadius + 12) {
          const px = personX + dx;
          const py = personHeadY + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            buffer[idx] = 40;
            buffer[idx + 1] = 30;
            buffer[idx + 2] = 25;
          }
        }
      }
    }

    // Eyes
    for (const eyeOffsetX of [-14, 14]) {
      for (let dy = -6; dy <= -2; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const px = personX + eyeOffsetX + dx;
          const py = personHeadY + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            buffer[idx] = 45;
            buffer[idx + 1] = 35;
            buffer[idx + 2] = 30;
          }
        }
      }
    }

    const detection: FaceDetectionPayload = {
      detected: true,
      status: 'recognized',
      person: 'Angelo',
      confidence: 0.94,
      timestamp: new Date().toISOString(),
      faces: [
        {
          box: {
            x: personX - 45,
            y: personHeadY - 45,
            width: 90,
            height: 95
          },
          status: 'recognized',
          person: 'Angelo',
          confidence: 0.94
        }
      ]
    };

    const encoded = jpeg.encode({ data: buffer, width, height }, 75);
    return { frameData: encoded.data, detection };
  }
}
