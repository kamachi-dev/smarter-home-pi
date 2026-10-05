import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { RelaySensor } from '../../sensors/relay/index.js';
import { GpioManager } from '../../hardware/gpio.js';

describe('RelaySensor Hardware & GPIO Pin Switching Tests', () => {
  let gpioManager: GpioManager;

  beforeEach(() => {
    gpioManager = GpioManager.getInstance();
  });

  test('should default to active-low logic: ON writes 0 (LOW), OFF writes 1 (HIGH)', async () => {
    const relay = new RelaySensor({
      id: 'sensor-relay-17',
      name: 'Living Room Light',
      type: 'relay',
      bcmGpio: 17,
      pinNumber: 11,
      pollIntervalMs: 0,
      enabled: true,
      options: {
        activeLow: true,
        initialPower: false
      }
    });

    await relay.init();

    // Initial power is false -> ActiveLow writes 1
    assert.strictEqual(relay.getPower(), false);
    assert.strictEqual(gpioManager.readPin(17), 1);

    // Turn ON -> ActiveLow writes 0
    relay.setPower(true);
    assert.strictEqual(relay.getPower(), true);
    assert.strictEqual(gpioManager.readPin(17), 0);

    // Turn OFF -> ActiveLow writes 1
    relay.setPower(false);
    assert.strictEqual(relay.getPower(), false);
    assert.strictEqual(gpioManager.readPin(17), 1);
  });

  test('should support active-high logic: ON writes 1 (HIGH), OFF writes 0 (LOW)', async () => {
    const relay = new RelaySensor({
      id: 'sensor-relay-27',
      name: 'Active High Light',
      type: 'relay',
      bcmGpio: 27,
      pinNumber: 13,
      pollIntervalMs: 0,
      enabled: true,
      options: {
        activeLow: false,
        initialPower: false
      }
    });

    await relay.init();

    // Initial power is false -> ActiveHigh writes 0
    assert.strictEqual(relay.getPower(), false);
    assert.strictEqual(gpioManager.readPin(27), 0);

    // Turn ON -> ActiveHigh writes 1
    relay.setPower(true);
    assert.strictEqual(relay.getPower(), true);
    assert.strictEqual(gpioManager.readPin(27), 1);

    // Turn OFF -> ActiveHigh writes 0
    relay.setPower(false);
    assert.strictEqual(relay.getPower(), false);
    assert.strictEqual(gpioManager.readPin(27), 0);
  });

  test('should emit reading event and update lastReading on power change', async () => {
    const relay = new RelaySensor({
      id: 'sensor-relay-22',
      name: 'Bedroom Light',
      type: 'relay',
      bcmGpio: 22,
      pinNumber: 15,
      pollIntervalMs: 0,
      enabled: true,
      options: {
        activeLow: true,
        roomId: 'room-bedroom',
        roomName: 'Master Bedroom'
      }
    });

    await relay.init();

    let emittedReading: any = null;
    relay.on('reading', (reading) => {
      emittedReading = reading;
    });

    relay.setPower(true);

    assert.ok(emittedReading);
    assert.strictEqual(emittedReading.power, true);
    assert.strictEqual(emittedReading.bcmGpio, 22);
    assert.strictEqual(emittedReading.roomId, 'room-bedroom');

    const readVal = await relay.read();
    assert.strictEqual(readVal.power, true);
  });
});
