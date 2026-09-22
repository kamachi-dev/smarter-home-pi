import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SensorSyncHandler } from '../sensorSyncHandler.js';
import { RPI_40_PIN_HEADER } from '../../hardware/pinout.js';

describe('SensorSyncHandler & Supabase GPIO Mapping Tests', () => {
  let mockRegistry: any;
  let mockSupabase: any;
  let sampleRooms: any[];
  let registeredSensors: Map<string, any>;
  let pinAssignments: Map<number, string>;

  beforeEach(() => {
    registeredSensors = new Map();
    pinAssignments = new Map();

    mockRegistry = {
      getSensor: (id: string) => registeredSensors.get(id),
      registerSensor: async (cfg: any) => {
        registeredSensors.set(cfg.id, { config: cfg });
        if (cfg.pinNumber) {
          pinAssignments.set(cfg.pinNumber, cfg.id);
        }
        return { config: cfg };
      },
      getPinsWithAssignments: () => {
        return RPI_40_PIN_HEADER.map(pin => {
          const assignedId = pinAssignments.get(pin.pinNumber);
          const s = assignedId ? registeredSensors.get(assignedId) : null;
          return {
            ...pin,
            assignedSensorId: assignedId,
            assignedSensor: s ? {
              id: s.config.id,
              name: s.config.name,
              type: s.config.type,
              bcmGpio: s.config.bcmGpio,
              pinNumber: pin.pinNumber,
              roomName: s.config.options?.roomName,
              roomId: s.config.options?.roomId,
              state: s.config.options?.initialPower !== undefined ? { power: s.config.options.initialPower } : undefined,
              source: 'supabase'
            } : undefined
          };
        });
      }
    };

    sampleRooms = [
      {
        id: 'room-living',
        name: 'Living Room',
        light_gpio: 17,
        temp_gpio: 4,
        ac_gpio: 22,
        lights_power: true,
        temperature: 24.2,
        humidity: 48,
        ac_power: false
      },
      {
        id: 'room-kitchen',
        name: 'Kitchen',
        light_gpio: 27,
        temp_gpio: null,
        ac_gpio: null,
        lights_power: false
      }
    ];

    mockRegistry.unregisterSensor = async (id: string) => {
      registeredSensors.delete(id);
      for (const [pin, sId] of pinAssignments.entries()) {
        if (sId === id) pinAssignments.delete(pin);
      }
      return true;
    };

    mockSupabase = {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null })
      },
      from: (table: string) => {
        return {
          select: () => ({
            eq: (_col: string, id: string) => {
              const singleRoom = sampleRooms.find(r => r.id === id);
              return {
                single: () => Promise.resolve({ data: singleRoom || null, error: null }),
                then: (fn: any) => Promise.resolve({ data: sampleRooms, error: null }).then(fn)
              };
            },
            limit: () => ({
              single: () => Promise.resolve({ data: sampleRooms[0] || null, error: null })
            }),
            then: (fn: any) => Promise.resolve({ data: sampleRooms, error: null }).then(fn)
          }),
          insert: (payload: any) => ({
            select: () => ({
              single: () => {
                const newRoom = { ...payload, id: 'room-' + Date.now().toString(36) };
                sampleRooms.push(newRoom);
                return Promise.resolve({ data: newRoom, error: null });
              }
            })
          }),
          update: (payload: any) => ({
            eq: (_col: string, id: string) => {
              const room = sampleRooms.find(r => r.id === id);
              if (room) Object.assign(room, payload);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: room, error: null })
                }),
                then: (fn: any) => Promise.resolve({ data: room, error: null }).then(fn)
              };
            }
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              const idx = sampleRooms.findIndex(r => r.id === id);
              if (idx !== -1) sampleRooms.splice(idx, 1);
              return Promise.resolve({ error: null });
            }
          })
        };
      }
    };
  });

  test('should look through all sensors and which GPIO number they are connected to in Supabase', async () => {
    const handler = new SensorSyncHandler({
      supabase: mockSupabase,
      registry: mockRegistry,
      getLinkedHomeId: async () => 'test-home-id'
    });

    const result = await handler.syncSensorsFromSupabase();
    assert.strictEqual(result.supabaseConnected, true);
    assert.strictEqual(result.supabaseSensors.length, 4);

    // Verify Living Room Light (GPIO 17 -> Pin 11)
    const livingLight = result.supabaseSensors.find(s => s.bcmGpio === 17 && s.property === 'light_gpio');
    assert.ok(livingLight, 'Living Room light on GPIO 17 must be discovered');
    assert.strictEqual(livingLight.pinNumber, 11);
    assert.strictEqual(livingLight.roomName, 'Living Room');
    assert.strictEqual(livingLight.type, 'relay');
    assert.strictEqual(livingLight.state?.power, true);

    // Verify Living Room Temp (GPIO 4 -> Pin 7)
    const livingTemp = result.supabaseSensors.find(s => s.bcmGpio === 4 && s.property === 'temp_gpio');
    assert.ok(livingTemp, 'Living Room DHT22 on GPIO 4 must be discovered');
    assert.strictEqual(livingTemp.pinNumber, 7);
    assert.strictEqual(livingTemp.type, 'temperature');

    // Verify Living Room AC Relay (GPIO 22 -> Pin 15)
    const livingAc = result.supabaseSensors.find(s => s.bcmGpio === 22 && s.property === 'ac_gpio');
    assert.ok(livingAc, 'Living Room AC Relay on GPIO 22 must be discovered');
    assert.strictEqual(livingAc.pinNumber, 15);
    assert.strictEqual(livingAc.type, 'relay');

    // Verify Kitchen Light (GPIO 27 -> Pin 13)
    const kitchenLight = result.supabaseSensors.find(s => s.bcmGpio === 27 && s.property === 'light_gpio');
    assert.ok(kitchenLight, 'Kitchen light on GPIO 27 must be discovered');
    assert.strictEqual(kitchenLight.pinNumber, 13);
    assert.strictEqual(kitchenLight.roomName, 'Kitchen');

    // Verify 40-pin header assignments
    const pin11 = result.pins.find(p => p.pinNumber === 11);
    assert.ok(pin11?.assignedSensor, 'Pin 11 must have assignedSensor metadata');
    assert.strictEqual(pin11?.assignedSensor?.bcmGpio, 17);

    const pin7 = result.pins.find(p => p.pinNumber === 7);
    assert.ok(pin7?.assignedSensor, 'Pin 7 must have assignedSensor metadata');
    assert.strictEqual(pin7?.assignedSensor?.bcmGpio, 4);

    const pin13 = result.pins.find(p => p.pinNumber === 13);
    assert.ok(pin13?.assignedSensor, 'Pin 13 must have assignedSensor metadata');
    assert.strictEqual(pin13?.assignedSensor?.bcmGpio, 27);
  });

  test('should allow assigning a room sensor to a new GPIO in Supabase', async () => {
    const handler = new SensorSyncHandler({
      supabase: mockSupabase,
      registry: mockRegistry,
      getLinkedHomeId: async () => 'test-home-id'
    });

    // Assign Kitchen Temperature sensor to GPIO 23 (Pin 16)
    await handler.assignRoomSensor('room-kitchen', 'temp_gpio', 23);

    const kitchen = sampleRooms.find(r => r.id === 'room-kitchen');
    assert.strictEqual(kitchen?.temp_gpio, 23);

    const sensors = handler.getSupabaseSensors();
    const kitchenTemp = sensors.find(s => s.roomId === 'room-kitchen' && s.property === 'temp_gpio');
    assert.ok(kitchenTemp, 'Kitchen temp on GPIO 23 must be present after assignment');
    assert.strictEqual(kitchenTemp.bcmGpio, 23);
    assert.strictEqual(kitchenTemp.pinNumber, 16);
  });

  test('should create a new room in Supabase and register its sensors', async () => {
    const handler = new SensorSyncHandler({
      supabase: mockSupabase,
      registry: mockRegistry,
      getLinkedHomeId: async () => 'test-home-id'
    });

    const newRoom = await handler.createRoom({
      name: 'Server Room',
      description: 'Main rack and UPS power',
      light_gpio: 18,
      temp_gpio: 24
    });

    assert.ok(newRoom?.id, 'New room should have an ID');
    assert.strictEqual(newRoom.name, 'Server Room');
    assert.strictEqual(newRoom.light_gpio, 18);
    assert.strictEqual(newRoom.temp_gpio, 24);

    const sensors = handler.getSupabaseSensors();
    const serverLight = sensors.find(s => s.bcmGpio === 18 && s.property === 'light_gpio');
    assert.ok(serverLight, 'Server Room light on GPIO 18 should be registered');
    assert.strictEqual(serverLight.roomName, 'Server Room');
  });

  test('should update a room in Supabase and update its GPIO assignments', async () => {
    const handler = new SensorSyncHandler({
      supabase: mockSupabase,
      registry: mockRegistry,
      getLinkedHomeId: async () => 'test-home-id'
    });

    const updated = await handler.updateRoom('room-kitchen', {
      name: 'Chef Kitchen & Dining',
      light_gpio: 25
    });

    assert.strictEqual(updated.name, 'Chef Kitchen & Dining');
    assert.strictEqual(updated.light_gpio, 25);
  });

  test('should delete a room in Supabase and release its assigned GPIO sensors', async () => {
    const handler = new SensorSyncHandler({
      supabase: mockSupabase,
      registry: mockRegistry,
      getLinkedHomeId: async () => 'test-home-id'
    });

    // Verify room-living initially has sensors registered
    await handler.syncSensorsFromSupabase();
    const initialSensors = handler.getSupabaseSensors();
    assert.ok(initialSensors.some(s => s.roomId === 'room-living'), 'room-living sensors exist initially');

    // Delete room
    const success = await handler.deleteRoom('room-living');
    assert.strictEqual(success, true);

    const remainingRooms = sampleRooms.find(r => r.id === 'room-living');
    assert.strictEqual(remainingRooms, undefined, 'room-living must be removed from sampleRooms');

    // Re-verify sensors after deletion
    const sensorsAfter = handler.getSupabaseSensors();
    assert.ok(!sensorsAfter.some(s => s.roomId === 'room-living'), 'room-living sensors should no longer exist');
  });

  test('should support interchangeable Tapo and Raspberry Pi camera assignments in Supabase', async () => {
    const handler = new SensorSyncHandler({
      supabase: mockSupabase,
      registry: mockRegistry,
      getLinkedHomeId: async () => 'test-home-id'
    });

    // 1. Create a room with Direct RPi camera
    const rpiRoom = await handler.createRoom({
      name: 'Workshop Lab',
      camera_type: 'rpi'
    });

    assert.strictEqual(rpiRoom.camera_enabled, true);
    assert.strictEqual(rpiRoom.camera_ip, 'rpi-camera');
    assert.strictEqual(rpiRoom.camera_stream_url, 'rpicam://0');
    assert.strictEqual(rpiRoom.camera_type, 'rpi');

    // 2. Switch camera to Tapo IP Camera with RTSP credentials
    const switchedToTapo = await handler.updateRoom(rpiRoom.id, {
      camera_type: 'tapo',
      camera_ip: '192.168.1.150',
      camera_username: 'tapo_user',
      camera_password: 'secret_password',
      camera_stream_url: 'rtsp://tapo_user:secret_password@192.168.1.150:554/stream1'
    });

    assert.strictEqual(switchedToTapo.camera_enabled, true);
    assert.strictEqual(switchedToTapo.camera_ip, '192.168.1.150');
    assert.strictEqual(switchedToTapo.camera_username, 'tapo_user');
    assert.strictEqual(switchedToTapo.camera_type, 'tapo');

    // 3. Switch camera to None (disabled)
    const switchedToNone = await handler.updateRoom(rpiRoom.id, {
      camera_type: 'none'
    });

    assert.strictEqual(switchedToNone.camera_enabled, false);
    assert.strictEqual(switchedToNone.camera_ip, null);
    assert.strictEqual(switchedToNone.camera_stream_url, null);
    assert.strictEqual(switchedToNone.camera_type, 'none');
  });
});
