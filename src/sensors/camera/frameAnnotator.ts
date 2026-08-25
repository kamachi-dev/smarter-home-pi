import jpeg from 'jpeg-js';
import { FaceDetectionPayload, DetectedFace } from '../../types/index.js';

// Compact 5x7 ASCII bitmap font dictionary (Characters 0-9, A-Z, symbols)
const FONT_5X7: Record<string, number[]> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
  'A': [0x7E, 0x11, 0x11, 0x11, 0x7E],
  'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
  'C': [0x3E, 0x41, 0x41, 0x41, 0x22],
  'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
  'E': [0x7F, 0x49, 0x49, 0x49, 0x41],
  'F': [0x7F, 0x09, 0x09, 0x09, 0x01],
  'G': [0x3E, 0x41, 0x49, 0x49, 0x7A],
  'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
  'I': [0x00, 0x41, 0x7F, 0x41, 0x00],
  'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
  'K': [0x7F, 0x08, 0x14, 0x22, 0x41],
  'L': [0x7F, 0x40, 0x40, 0x40, 0x40],
  'M': [0x7F, 0x02, 0x0C, 0x02, 0x7F],
  'N': [0x7F, 0x04, 0x08, 0x10, 0x7F],
  'O': [0x3E, 0x41, 0x41, 0x41, 0x3E],
  'P': [0x7F, 0x09, 0x09, 0x09, 0x06],
  'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E],
  'R': [0x7F, 0x09, 0x19, 0x29, 0x46],
  'S': [0x46, 0x49, 0x49, 0x49, 0x31],
  'T': [0x01, 0x01, 0x7F, 0x01, 0x01],
  'U': [0x3F, 0x40, 0x40, 0x40, 0x3F],
  'V': [0x1F, 0x20, 0x40, 0x20, 0x1F],
  'W': [0x7F, 0x20, 0x18, 0x20, 0x7F],
  'X': [0x63, 0x14, 0x08, 0x14, 0x63],
  'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
  'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
  '0': [0x3E, 0x51, 0x49, 0x45, 0x3E],
  '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7F, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3C, 0x4A, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '%': [0x22, 0x12, 0x08, 0x24, 0x22],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '_': [0x40, 0x40, 0x40, 0x40, 0x40],
  '[': [0x00, 0x7F, 0x41, 0x41, 0x00],
  ']': [0x00, 0x41, 0x41, 0x7F, 0x00],
  '(': [0x00, 0x1C, 0x22, 0x41, 0x00],
  ')': [0x00, 0x41, 0x22, 0x1C, 0x00],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  '+': [0x08, 0x08, 0x3E, 0x08, 0x08],
  '*': [0x14, 0x08, 0x3E, 0x08, 0x14],
  '!': [0x00, 0x00, 0x5F, 0x00, 0x00],
  '?': [0x02, 0x01, 0x51, 0x09, 0x06]
};

export class FrameAnnotator {
  /**
   * Annotates a JPEG buffer with facial recognition bounding boxes, reticles, labels, and HUD overlays.
   */
  public static annotateFrame(
    imageBuffer: Buffer,
    detection?: FaceDetectionPayload | null,
    quality: number = 50
  ): Buffer {
    try {
      const decoded = jpeg.decode(imageBuffer, { useTArray: true, maxMemoryUsageInMB: 512 });
      const { width, height, data } = decoded;

      // Extract all faces to draw
      const facesToDraw: DetectedFace[] = [];
      if (detection && detection.detected) {
        if (detection.faces && detection.faces.length > 0) {
          facesToDraw.push(...detection.faces);
        } else if (detection.box) {
          facesToDraw.push({
            box: detection.box,
            status: detection.status === 'recognized' ? 'recognized' : 'unknown',
            person: detection.person,
            confidence: detection.confidence
          });
        }
      }

      // Draw each detected face recognition square
      for (const face of facesToDraw) {
        this.drawRecognitionSquare(data, width, height, face);
      }

      // Draw Live HUD Overlay header
      this.drawHudOverlay(data, width, height, detection);

      const encoded = jpeg.encode({ data, width, height }, quality);
      return encoded.data;
    } catch {
      return imageBuffer;
    }
  }

  private static drawRecognitionSquare(
    data: Uint8Array,
    imgWidth: number,
    imgHeight: number,
    face: DetectedFace
  ): void {
    const isRecognized = face.status === 'recognized';
    const primaryColor: [number, number, number, number] = isRecognized
      ? [16, 185, 129, 255]  // Emerald Green (#10b981)
      : [245, 158, 11, 255]; // Amber Orange (#f59e0b)

    const bx = Math.max(2, Math.min(imgWidth - 10, Math.round(face.box.x)));
    const by = Math.max(2, Math.min(imgHeight - 10, Math.round(face.box.y)));
    const bw = Math.max(20, Math.min(imgWidth - bx - 2, Math.round(face.box.width)));
    const bh = Math.max(20, Math.min(imgHeight - by - 2, Math.round(face.box.height)));

    // 1. Semi-transparent background tint inside the recognition box
    const tintAlpha = 0.15;
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const idx = (y * imgWidth + x) * 4;
        data[idx + 0] = Math.round(data[idx + 0] * (1 - tintAlpha) + primaryColor[0] * tintAlpha);
        data[idx + 1] = Math.round(data[idx + 1] * (1 - tintAlpha) + primaryColor[1] * tintAlpha);
        data[idx + 2] = Math.round(data[idx + 2] * (1 - tintAlpha) + primaryColor[2] * tintAlpha);
      }
    }

    // 2. Outer bounding box rectangle (2px border)
    this.drawRectOutline(data, imgWidth, imgHeight, bx, by, bw, bh, 2, primaryColor);

    // 3. Thick Corner Reticles (length: 18px, thickness: 4px)
    const reticleLen = Math.min(22, Math.floor(Math.min(bw, bh) / 3));
    this.drawCornerReticles(data, imgWidth, imgHeight, bx, by, bw, bh, reticleLen, 4, primaryColor);

    // 4. Center Landmark Focus Reticle
    const cx = Math.round(bx + bw / 2);
    const cy = Math.round(by + bh / 2);
    this.drawFilledRect(data, imgWidth, imgHeight, cx - 12, cy, 24, 2, primaryColor);
    this.drawFilledRect(data, imgWidth, imgHeight, cx, cy - 12, 2, 24, primaryColor);

    // 5. Name and Confidence Tag Banner
    const confPct = Math.round((face.confidence || 0.95) * 100);
    const labelText = isRecognized
      ? `${(face.person || 'MEMBER').toUpperCase()} [${confPct}%]`
      : `UNKNOWN [ALERT ${confPct}%]`;

    const tagScale = 1;
    const tagH = 18;
    const tagW = Math.min(bw + 10, labelText.length * 7 * tagScale + 12);
    const tagY = Math.max(2, by - tagH - 3);

    // Banner Background
    this.drawFilledRect(data, imgWidth, imgHeight, bx, tagY, tagW, tagH, primaryColor);

    // Text on Banner
    this.drawText(data, imgWidth, imgHeight, labelText, bx + 6, tagY + 4, [0, 0, 0, 255], tagScale);
  }

  private static drawHudOverlay(
    data: Uint8Array,
    imgWidth: number,
    imgHeight: number,
    detection?: FaceDetectionPayload | null
  ): void {
    const isDetected = detection && detection.detected;
    const isRec = isDetected && detection.status === 'recognized';
    const hudStatus = isDetected
      ? (isRec ? `AI MATCH: ${(detection.person || '').toUpperCase()}` : 'AI TARGET DETECTED: UNVERIFIED')
      : 'AI SURVEILLANCE: MONITORING';

    const statusColor: [number, number, number, number] = isDetected
      ? (isRec ? [16, 185, 129, 255] : [245, 158, 11, 255])
      : [120, 113, 108, 255];

    // Top status pill
    this.drawFilledRect(data, imgWidth, imgHeight, 8, 8, Math.min(imgWidth - 16, hudStatus.length * 7 + 16), 16, [12, 10, 9, 220]);
    this.drawText(data, imgWidth, imgHeight, hudStatus, 14, 12, statusColor, 1);

    // Live microsecond timecode at bottom-right of frame
    const now = new Date();
    const timeStr = now.toISOString().replace('T', ' ').substring(0, 23);
    const timeW = timeStr.length * 6 + 12;
    this.drawFilledRect(data, imgWidth, imgHeight, imgWidth - timeW - 8, imgHeight - 24, timeW, 16, [12, 10, 9, 220]);
    this.drawText(data, imgWidth, imgHeight, timeStr, imgWidth - timeW - 2, imgHeight - 20, [16, 185, 129, 255], 1);
  }

  private static drawFilledRect(
    data: Uint8Array,
    imgW: number,
    imgH: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    color: [number, number, number, number]
  ): void {
    const x0 = Math.max(0, rx);
    const y0 = Math.max(0, ry);
    const x1 = Math.min(imgW, rx + rw);
    const y1 = Math.min(imgH, ry + rh);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * imgW + x) * 4;
        data[idx + 0] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = color[3];
      }
    }
  }

  private static drawRectOutline(
    data: Uint8Array,
    imgW: number,
    imgH: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    thick: number,
    color: [number, number, number, number]
  ): void {
    this.drawFilledRect(data, imgW, imgH, rx, ry, rw, thick, color); // top
    this.drawFilledRect(data, imgW, imgH, rx, ry + rh - thick, rw, thick, color); // bottom
    this.drawFilledRect(data, imgW, imgH, rx, ry, thick, rh, color); // left
    this.drawFilledRect(data, imgW, imgH, rx + rw - thick, ry, thick, rh, color); // right
  }

  private static drawCornerReticles(
    data: Uint8Array,
    imgW: number,
    imgH: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    len: number,
    thick: number,
    color: [number, number, number, number]
  ): void {
    // Top-Left
    this.drawFilledRect(data, imgW, imgH, bx, by, len, thick, color);
    this.drawFilledRect(data, imgW, imgH, bx, by, thick, len, color);
    // Top-Right
    this.drawFilledRect(data, imgW, imgH, bx + bw - len, by, len, thick, color);
    this.drawFilledRect(data, imgW, imgH, bx + bw - thick, by, thick, len, color);
    // Bottom-Left
    this.drawFilledRect(data, imgW, imgH, bx, by + bh - thick, len, thick, color);
    this.drawFilledRect(data, imgW, imgH, bx, by + bh - len, thick, len, color);
    // Bottom-Right
    this.drawFilledRect(data, imgW, imgH, bx + bw - len, by + bh - thick, len, thick, color);
    this.drawFilledRect(data, imgW, imgH, bx + bw - thick, by + bh - len, thick, len, color);
  }

  public static drawText(
    data: Uint8Array,
    imgW: number,
    imgH: number,
    text: string,
    startX: number,
    startY: number,
    color: [number, number, number, number],
    scale: number = 1
  ): void {
    let curX = startX;
    const upper = text.toUpperCase();

    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      const glyph = FONT_5X7[ch] || FONT_5X7['?'] || [0, 0, 0, 0, 0];

      for (let col = 0; col < 5; col++) {
        const colBits = glyph[col];
        for (let row = 0; row < 7; row++) {
          if ((colBits & (1 << row)) !== 0) {
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                const px = curX + col * scale + dx;
                const py = startY + row * scale + dy;
                if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
                  const idx = (py * imgW + px) * 4;
                  data[idx + 0] = color[0];
                  data[idx + 1] = color[1];
                  data[idx + 2] = color[2];
                  data[idx + 3] = color[3];
                }
              }
            }
          }
        }
      }
      curX += 6 * scale;
    }
  }
}
