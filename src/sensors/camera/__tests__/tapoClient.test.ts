import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TapoCameraService } from '../tapoClient.js';

describe('TapoCameraService Unit Tests', () => {
  it('should initialize with default credentials from environment config', () => {
    const service = new TapoCameraService();
    assert.strictEqual(service.host, '192.168.68.101');
    assert.strictEqual(service.user, 'joaquinphillipsoriano25@gmail.com');
    assert.strictEqual(service.password, 'September--25');
  });

  it('should override default credentials when custom options are provided', () => {
    const service = new TapoCameraService({
      host: '10.0.0.50',
      user: 'admin',
      password: 'customPassword123'
    });
    assert.strictEqual(service.host, '10.0.0.50');
    assert.strictEqual(service.user, 'admin');
    assert.strictEqual(service.password, 'customPassword123');
  });

  it('should construct properly encoded RTSP stream URLs', () => {
    const service = new TapoCameraService({
      host: '192.168.68.101',
      user: 'joaquinphillipsoriano25@gmail.com',
      password: 'September--25'
    });

    const stream1Url = service.getRtspStreamUrl('stream1');
    const stream2Url = service.getRtspStreamUrl('stream2');

    // Verify '@' in email is URL-encoded as '%40'
    assert.strictEqual(stream1Url, 'rtsp://joaquinphillipsoriano25%40gmail.com:September--25@192.168.68.101:554/stream1');
    assert.strictEqual(stream2Url, 'rtsp://joaquinphillipsoriano25%40gmail.com:September--25@192.168.68.101:554/stream2');
  });

  it('should handle offline status gracefully when camera is unreachable', async () => {
    const service = new TapoCameraService({
      host: '127.0.0.1', // Non-responsive port/IP for tapo api
      user: 'testuser',
      password: 'testpassword'
    });

    const initResult = await service.init();
    assert.strictEqual(initResult, false);
    assert.strictEqual(service.isOnline(), false);
    assert.strictEqual(await service.getBasicInfo(), null);
    assert.strictEqual(await service.moveMotor(10, 10), false);
    assert.strictEqual(await service.setPrivacyMode(true), false);
  });
});
