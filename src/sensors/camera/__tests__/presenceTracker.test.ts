import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PresenceTracker } from '../presenceTracker.js';
import { FaceDetectionPayload } from '../../../types/index.js';

describe('PresenceTracker (Multi-Person First-Frame & Debounce)', () => {
  const dummyBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  it('should capture first frame when a recognized person appears for the first time', () => {
    const tracker = new PresenceTracker(2000);
    const detection: FaceDetectionPayload = {
      detected: true,
      status: 'recognized',
      person: 'Angelo',
      confidence: 0.95,
      timestamp: new Date().toISOString(),
      faces: [
        {
          status: 'recognized',
          person: 'Angelo',
          confidence: 0.95,
          box: { x: 50, y: 50, width: 100, height: 100 }
        }
      ]
    };

    const arrivals = tracker.processDetection(detection, dummyBuffer);
    assert.strictEqual(arrivals.length, 1);
    assert.strictEqual(arrivals[0].person, 'Angelo');
    assert.strictEqual(arrivals[0].confidence, 0.95);
    assert.strictEqual(arrivals[0].frame, dummyBuffer);
  });

  it('should prevent sending subsequent frames while person is continuously present', () => {
    const tracker = new PresenceTracker(2000);
    const detection: FaceDetectionPayload = {
      detected: true,
      status: 'recognized',
      person: 'Angelo',
      confidence: 0.95,
      timestamp: new Date().toISOString()
    };

    // First frame -> arrival triggered
    const firstArrivals = tracker.processDetection(detection, dummyBuffer);
    assert.strictEqual(firstArrivals.length, 1);

    // Immediate next frames -> NO new arrival triggered
    const secondArrivals = tracker.processDetection(detection, dummyBuffer);
    assert.strictEqual(secondArrivals.length, 0);

    const thirdArrivals = tracker.processDetection(detection, dummyBuffer);
    assert.strictEqual(thirdArrivals.length, 0);
  });

  it('should handle multiple distinct people arriving at the same time and track independently', () => {
    const tracker = new PresenceTracker(2000);
    const multiDetection: FaceDetectionPayload = {
      detected: true,
      status: 'recognized',
      person: 'Angelo',
      confidence: 0.95,
      timestamp: new Date().toISOString(),
      faces: [
        {
          status: 'recognized',
          person: 'Angelo',
          confidence: 0.95,
          box: { x: 20, y: 20, width: 80, height: 80 }
        },
        {
          status: 'recognized',
          person: 'Maria',
          confidence: 0.92,
          box: { x: 150, y: 20, width: 80, height: 80 }
        }
      ]
    };

    const arrivals = tracker.processDetection(multiDetection, dummyBuffer);
    assert.strictEqual(arrivals.length, 2);
    const names = arrivals.map(a => a.person);
    assert.ok(names.includes('Angelo'));
    assert.ok(names.includes('Maria'));

    const present = tracker.getPresentPeople();
    assert.ok(present.includes('Angelo'));
    assert.ok(present.includes('Maria'));
  });

  it('should only capture a new first frame when a person leaves and comes back later', async () => {
    const tracker = new PresenceTracker(100); // 100ms timeout for test

    const detectionAngelo: FaceDetectionPayload = {
      detected: true,
      status: 'recognized',
      person: 'Angelo',
      confidence: 0.95,
      timestamp: new Date().toISOString()
    };

    // 1. Initial Arrival
    const arr1 = tracker.processDetection(detectionAngelo, dummyBuffer);
    assert.strictEqual(arr1.length, 1);
    assert.strictEqual(arr1[0].person, 'Angelo');

    // 2. Continuous detection while in room -> no arrival
    const arr2 = tracker.processDetection(detectionAngelo, dummyBuffer);
    assert.strictEqual(arr2.length, 0);

    // 3. Person leaves: wait for absence timeout
    await new Promise(r => setTimeout(r, 150));

    // Empty frame (no one detected)
    const emptyDetection: FaceDetectionPayload = {
      detected: false,
      status: 'none',
      person: null,
      confidence: 0,
      timestamp: new Date().toISOString()
    };
    tracker.processDetection(emptyDetection, dummyBuffer);

    assert.ok(!tracker.getPresentPeople().includes('Angelo'));

    // 4. Person comes back later -> Fresh FIRST FRAME captured!
    const returnArrivals = tracker.processDetection(detectionAngelo, dummyBuffer);
    assert.strictEqual(returnArrivals.length, 1);
    assert.strictEqual(returnArrivals[0].person, 'Angelo');
  });
});
