import { describe, it } from 'node:test';
import assert from 'node:assert';
import jpeg from 'jpeg-js';
import { EdgeMotionDetector } from '../motionDetector.js';

describe('EdgeMotionDetector (Fast Frame-Differencing on Edge)', () => {
  function makeSolidJpeg(width: number, height: number, r: number, g: number, b: number): Buffer {
    const frameData = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      frameData[i * 4] = r;
      frameData[i * 4 + 1] = g;
      frameData[i * 4 + 2] = b;
      frameData[i * 4 + 3] = 255;
    }
    const encoded = jpeg.encode({ data: frameData, width, height }, 50);
    return encoded.data;
  }

  it('should initialize and return no motion on the first baseline frame', () => {
    const detector = new EdgeMotionDetector();
    const frame = makeSolidJpeg(160, 120, 100, 100, 100);
    const result = detector.detectMotion(frame);

    assert.strictEqual(result.hasMotion, false);
    assert.strictEqual(result.score, 0);
  });

  it('should detect zero motion when consecutive identical frames are provided', () => {
    const detector = new EdgeMotionDetector();
    const frame1 = makeSolidJpeg(160, 120, 100, 100, 100);
    const frame2 = makeSolidJpeg(160, 120, 100, 100, 100);

    detector.detectMotion(frame1);
    const result = detector.detectMotion(frame2);

    assert.strictEqual(result.hasMotion, false);
    assert.strictEqual(result.changedPixels, 0);
    assert.strictEqual(result.score, 0);
  });

  it('should detect significant motion when frame pixels change substantially', () => {
    const detector = new EdgeMotionDetector({ pixelDiffThreshold: 20, motionRatioThreshold: 0.05, cooldownMs: 0 });
    const baseline = makeSolidJpeg(160, 120, 50, 50, 50);
    detector.detectMotion(baseline);

    // Provide a frame with high contrast shift (50 -> 200)
    const movingFrame = makeSolidJpeg(160, 120, 200, 200, 200);
    const result = detector.detectMotion(movingFrame);

    assert.strictEqual(result.hasMotion, true);
    assert.ok(result.score > 5);
    assert.ok(result.changedPixels > 100);
  });

  it('should respect cooldownMs between triggered motion events', () => {
    const detector = new EdgeMotionDetector({ pixelDiffThreshold: 20, motionRatioThreshold: 0.05, cooldownMs: 5000 });
    const frameA = makeSolidJpeg(160, 120, 30, 30, 30);
    const frameB = makeSolidJpeg(160, 120, 220, 220, 220);

    detector.detectMotion(frameA);
    const firstTrigger = detector.detectMotion(frameB);
    assert.strictEqual(firstTrigger.hasMotion, true);

    // Provide another dramatic change immediately (before 5000ms cooldown)
    const frameC = makeSolidJpeg(160, 120, 10, 10, 10);
    const immediateNext = detector.detectMotion(frameC);
    assert.strictEqual(immediateNext.hasMotion, false, 'Motion should be suppressed during cooldown');
  });
});

