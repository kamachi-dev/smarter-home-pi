import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LightingSyncHandler } from '../lightingSyncHandler.js';
import { RelaySensor } from '../../sensors/relay/index.js';
import { GpioManager } from '../../hardware/gpio.js';

describe('LightingSyncHandler Realtime & Multi-Channel Sync Tests', () => {
  let mockRegistry: any;
  let registeredSensors: Map<string, any>;
  let cachedRooms: any[];
  let lightingHandler: LightingSyncHandler;
  let gpioManager: GpioManager;

  beforeEach(() => {
    registeredSensors = new Map();
    gpioManager = GpioManager.getInstance();

    mockRegistry = {
      getAllSensors: () => Array.from(registeredSensors.values()),
      getSensor: (id: string) => registeredSensors.get(id),
      registerSensor: async (cfg: any) => {
        const relay = new RelaySensor(cfg);
        await relay.init();
        registeredSensors.set(cfg.id, relay);
        return relay;
      },
      unregisterSensor: async (id: string) => {
        const existing = registeredSensors.get(id);
        if (existing) {
          await existing.cleanup();
          registeredSensors.delete(id);
          return true;
        }
        return false;
      }
    };

    cachedRooms = [
      {
        id: '261ac1a9-89f7-468d-81e5-6c7e6c2d1cd8',
        name: 'Living Room',
        light_gpio: 17,
        lights_power: false,
        light_controller: 'main'
      },
      {
        id: '992bc2b1-1234-4567-89ab-cdef01234567',
        name: 'Kitchen',
        light_gpio: 27,
        lights_power: false,
        light_controller: 'main'
      }
    ];

    lightingHandler = new LightingSyncHandler({
      supabase: null,
      registry: mockRegistry,
      getLinkedHomeId: async () => 'test-home-id',
      getRooms: () => cachedRooms
    });
  });

  test('should sync rooms lighting and register RelaySensors on configured GPIO pins', async () => {
    await lightingHandler.syncRoomsLighting(cachedRooms);

    const livingRelay = mockRegistry.getSensor('sensor-relay-17') as RelaySensor;
    assert.ok(livingRelay, 'Relay for GPIO 17 should be registered');
    assert.strictEqual(livingRelay.getPower(), false);

    const kitchenRelay = mockRegistry.getSensor('sensor-relay-27') as RelaySensor;
    assert.ok(kitchenRelay, 'Relay for GPIO 27 should be registered');
    assert.strictEqual(kitchenRelay.getPower(), false);
  });

  test('should handle broadcast light_toggle event by roomId UUID', async () => {
    await lightingHandler.syncRoomsLighting(cachedRooms);

    lightingHandler.handleBroadcastEvent('light_toggle', {
      roomId: '261ac1a9-89f7-468d-81e5-6c7e6c2d1cd8',
      roomName: 'Living Room',
      power: true
    });

    const livingRelay = mockRegistry.getSensor('sensor-relay-17') as RelaySensor;
    assert.strictEqual(livingRelay.getPower(), true);
    assert.strictEqual(gpioManager.readPin(17), 0); // ActiveLow: ON -> 0
  });

  test('should handle broadcast light_toggle event by roomName', async () => {
    await lightingHandler.syncRoomsLighting(cachedRooms);

    lightingHandler.handleBroadcastEvent('light_toggle', {
      roomName: 'Kitchen',
      power: true
    });

    const kitchenRelay = mockRegistry.getSensor('sensor-relay-27') as RelaySensor;
    assert.strictEqual(kitchenRelay.getPower(), true);
    assert.strictEqual(gpioManager.readPin(27), 0);
  });

  test('should auto-register relay on-the-fly when room record update is received before sync', async () => {
    const uninitializedRoom = {
      id: 'room-new-balcony',
      name: 'Balcony',
      light_gpio: 23,
      lights_power: true,
      light_controller: 'main'
    };

    lightingHandler.handleRoomRecordUpdate(uninitializedRoom);

    // Give microtask queue time for async registerSensor
    await new Promise(r => setTimeout(r, 50));

    const relay = mockRegistry.getSensor('sensor-relay-23') as RelaySensor;
    assert.ok(relay, 'New relay should have been auto-registered for GPIO 23');
    assert.strictEqual(relay.getPower(), true);
    assert.strictEqual(gpioManager.readPin(23), 0);
  });

  test('should handle lighting scene broadcast and toggle multiple rooms', async () => {
    await lightingHandler.syncRoomsLighting(cachedRooms);

    lightingHandler.handleBroadcastEvent('lighting_scene', {
      sceneName: 'focus',
      lights: {
        livingRoom: { power: false },
        kitchen: { power: true }
      }
    });

    const livingRelay = mockRegistry.getSensor('sensor-relay-17') as RelaySensor;
    const kitchenRelay = mockRegistry.getSensor('sensor-relay-27') as RelaySensor;

    assert.strictEqual(livingRelay.getPower(), false);
    assert.strictEqual(kitchenRelay.getPower(), true);
  });
});
