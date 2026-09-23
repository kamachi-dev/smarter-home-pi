import jpeg from 'jpeg-js';

export interface MotionDetectionOptions {
  sampleWidth?: number;
  sampleHeight?: number;
  pixelDiffThreshold?: number; // pixel brightness difference (0-255) to count as changed
  motionRatioThreshold?: number; // fraction of sampled pixels changed to trigger motion (e.g. 0.04 = 4%)
  cooldownMs?: number; // minimum ms between triggered motion events
}

export interface MotionDetectionResult {
  hasMotion: boolean;
  score: number; // percentage 0-100 of changed pixels
  changedPixels: number;
  totalPixels: number;
}

export class EdgeMotionDetector {
  private sampleWidth: number;
  private sampleHeight: number;
  private pixelDiffThreshold: number;
  private motionRatioThreshold: number;
  private cooldownMs: number;
  private lastTriggerTime: number = 0;
  private previousLumaBuffer: Uint8Array | null = null;

  constructor(options: MotionDetectionOptions = {}) {
    this.sampleWidth = options.sampleWidth || 160;
    this.sampleHeight = options.sampleHeight || 120;
    this.pixelDiffThreshold = options.pixelDiffThreshold ?? 25;
    this.motionRatioThreshold = options.motionRatioThreshold ?? 0.035; // 3.5% area change
    this.cooldownMs = options.cooldownMs ?? 2000;
  }

  /**
   * Fast downsampling and grayscale luminance conversion from raw JPEG buffer.
   * Runs in sub-millisecond CPU time on Raspberry Pi without neural overhead.
   */
  public extractLuminance(jpegBuffer: Buffer): Uint8Array | null {
    try {
      const decoded = jpeg.decode(jpegBuffer, { useTArray: true, formatAsRGBA: false });
      if (!decoded || !decoded.data || decoded.width <= 0 || decoded.height <= 0) {
        return null;
      }

      const srcW = decoded.width;
      const srcH = decoded.height;
      const dstW = this.sampleWidth;
      const dstH = this.sampleHeight;
      const luma = new Uint8Array(dstW * dstH);

      const xRatio = srcW / dstW;
      const yRatio = srcH / dstH;
      const data = decoded.data;

      for (let y = 0; y < dstH; y++) {
        const srcY = Math.floor(y * yRatio);
        const yOffset = y * dstW;
        for (let x = 0; x < dstW; x++) {
          const srcX = Math.floor(x * xRatio);
          const srcIdx = (srcY * srcW + srcX) * 3; // RGB
          const r = data[srcIdx];
          const g = data[srcIdx + 1];
          const b = data[srcIdx + 2];
          // Standard ITU-R BT.601 perceptual luminance weights
          luma[yOffset + x] = ((r * 299 + g * 587 + b * 114) / 1000) | 0;
        }
      }

      return luma;
    } catch {
      return null;
    }
  }

  /**
   * Compares current frame with previous reference frame using fast pixel differencing.
   */
  public detectMotion(jpegBuffer: Buffer): MotionDetectionResult {
    const currentLuma = this.extractLuminance(jpegBuffer);
    const totalPixels = this.sampleWidth * this.sampleHeight;

    if (!currentLuma) {
      return { hasMotion: false, score: 0, changedPixels: 0, totalPixels };
    }

    if (!this.previousLumaBuffer || this.previousLumaBuffer.length !== currentLuma.length) {
      this.previousLumaBuffer = currentLuma;
      return { hasMotion: false, score: 0, changedPixels: 0, totalPixels };
    }

    let changedCount = 0;
    const prev = this.previousLumaBuffer;

    for (let i = 0; i < totalPixels; i++) {
      const diff = Math.abs(currentLuma[i] - prev[i]);
      if (diff >= this.pixelDiffThreshold) {
        changedCount++;
      }
    }

    // Update previous frame
    this.previousLumaBuffer = currentLuma;

    const ratio = changedCount / totalPixels;
    const score = Math.round(ratio * 1000) / 10;
    const now = Date.now();
    const exceedsThreshold = ratio >= this.motionRatioThreshold;
    const isCooledDown = now - this.lastTriggerTime >= this.cooldownMs;

    const hasMotion = exceedsThreshold && isCooledDown;
    if (hasMotion) {
      this.lastTriggerTime = now;
    }

    return {
      hasMotion,
      score,
      changedPixels: changedCount,
      totalPixels
    };
  }

  public reset(): void {
    this.previousLumaBuffer = null;
    this.lastTriggerTime = 0;
  }
}
