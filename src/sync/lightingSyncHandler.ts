import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { RelaySensor } from '../sensors/relay/index.js';
import { SensorConfig } from '../types/index.js';
import { getPinByBcmGpio } from '../hardware/pinout.js';
import { MqttBridgeService } from './mqttBridge.js';
import { config } from '../config/env.js';

export interface LightingSyncOptions {
  supabase: SupabaseClient | null;
  registry: SensorRegistry;
  getLinkedHomeId: () => Promise<string | null>;
  getRooms?: () => any[];
}

export class LightingSyncHandler {
  private supabase: SupabaseClient | null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;
  private getRooms: () => any[];
  private activeRelayMap: Map<number, RelaySensor> = new Map(); // bcmGpio -> RelaySensor
  private roomControllerMap: Map<string, { controller: string; bcmGpio: number | null; name?: string }> = new Map();

  constructor(options: LightingSyncOptions) {
    this.supabase = options.supabase;
    this.registry = options.registry;
    this.getLinkedHomeId = options.getLinkedHomeId;
    this.getRooms = options.getRooms || (() => []);
    this.indexExistingRelays();
  }

  public updateSupabaseClient(client: SupabaseClient | null) {
    this.supabase = client;
  }

  private indexExistingRelays(): void {
    const sensors = this.registry.getAllSensors();
    for (const sensor of sensors) {
      if (sensor instanceof RelaySensor && sensor.bcmGpio !== undefined) {
        this.activeRelayMap.set(sensor.bcmGpio, sensor);
      }
    }
  }

  /**
   * Synchronize room definitions with light_gpio pins.
   * Ensures every room that declares light_gpio has an active RelaySensor registered.
   */
  public async syncRoomsLighting(rooms: any[]): Promise<void> {
    if (!Array.isArray(rooms)) return;

    for (const room of rooms) {
      const bcmGpio = room.light_gpio !== null && room.light_gpio !== undefined && room.light_gpio !== ''
        ? parseInt(String(room.light_gpio), 10)
        : null;

      const controller = (room.light_controller || 'main').toLowerCase();
      if (room.id) {
        this.roomControllerMap.set(room.id, { controller, bcmGpio });
      }
      if (room.name) {
        const norm = room.name.toLowerCase().replace(/[\s_-]/g, '');
        this.roomControllerMap.set(norm, { controller, bcmGpio });
      }

      if (bcmGpio === null || isNaN(bcmGpio)) continue;

      // If assigned to a sub-controller, do not claim/bind on local Pi hardware
      if (controller && !['main', 'hub', 'rpi'].includes(controller)) {
        continue;
      }

      const sensorId = `sensor-relay-${bcmGpio}`;
      let relay = this.registry.getSensor(sensorId) as RelaySensor | undefined;

      if (!relay) {
        const pin = getPinByBcmGpio(bcmGpio);
        const sensorConfig: SensorConfig = {
          id: sensorId,
          name: `${room.name || 'Room'} 12V Light Relay (GPIO ${bcmGpio})`,
          type: 'relay',
          pinNumber: pin?.pinNumber,
          bcmGpio,
          pollIntervalMs: 0,
          enabled: true,
          options: {
            activeLow: false,
            roomId: room.id,
            roomName: room.name,
            initialPower: Boolean(room.lights_power)
          }
        };

        try {
          relay = (await this.registry.registerSensor(sensorConfig, true)) as RelaySensor;
          this.activeRelayMap.set(bcmGpio, relay);
        } catch (err) {
          console.warn(`[LightingSyncHandler] Failed to register relay on GPIO ${bcmGpio}:`, (err as Error).message);
        }
      }

      // Apply initial room lighting state
      if (relay && typeof room.lights_power === 'boolean') {
        relay.setPower(room.lights_power);
      }
    }
  }

  /**
   * Directly handle Realtime UPDATE/INSERT from the `rooms` table
   * allowing instantaneous relay switching when user toggles lights on the Rooms page.
   */
  public handleRoomRecordUpdate(room: any): void {
    if (!room) return;
    const bcmGpio = room.light_gpio !== null && room.light_gpio !== undefined && room.light_gpio !== ''
      ? parseInt(String(room.light_gpio), 10)
      : (room.name && room.name.toLowerCase().includes('living') ? 17 : null);

    const controller = (room.light_controller || 'main').toLowerCase();
    console.log(`[LightingSyncHandler] handleRoomRecordUpdate for room "${room.name}" (GPIO: ${bcmGpio}, controller: ${controller}, power: ${room.lights_power})`);

    // If assigned to a sub-controller, forward command over MQTT
    if (controller && !['main', 'hub', 'rpi'].includes(controller)) {
      if (config.smarterHomeToken && typeof room.lights_power === 'boolean') {
        MqttBridgeService.getInstance().publishSubCommand(config.smarterHomeToken, controller, {
          action: 'set_power',
          property: 'light_gpio',
          roomId: room.id,
          pin: bcmGpio,
          power: room.lights_power
        });
      }
      return;
    }

    if (bcmGpio !== null && !isNaN(bcmGpio) && typeof room.lights_power === 'boolean') {
      let relay = this.getRelayByGpio(bcmGpio);
      if (!relay) {
        const pin = getPinByBcmGpio(bcmGpio);
        const sensorConfig: SensorConfig = {
          id: `sensor-relay-${bcmGpio}`,
          name: `${room.name || 'Room'} 12V Light Relay (GPIO ${bcmGpio})`,
          type: 'relay',
          pinNumber: pin?.pinNumber,
          bcmGpio,
          pollIntervalMs: 0,
          enabled: true,
          options: {
            activeLow: false,
            roomId: room.id,
            roomName: room.name,
            initialPower: room.lights_power
          }
        };
        this.registry.registerSensor(sensorConfig, true).then(r => {
          const registeredRelay = r as RelaySensor;
          this.activeRelayMap.set(bcmGpio, registeredRelay);
          registeredRelay.setPower(room.lights_power, 'realtime_supabase');
        }).catch(err => console.warn(`[LightingSyncHandler] Failed to auto-register relay on GPIO ${bcmGpio}:`, err));
        return;
      }
      relay.setPower(room.lights_power, 'realtime_supabase');
      return;
    }

    // Fallback match by roomId or name
    if (typeof room.lights_power === 'boolean') {
      this.setRoomLightPower(room.id || room.name, room.lights_power, 'realtime_supabase');
    }
  }

  /**
   * Handle real-time broadcast events from Supabase channels (e.g. 'light_toggle', 'set_lights', 'lighting_scene')
   */
  public handleBroadcastEvent(event: string, payload: any): void {
    if (!payload) return;
    console.log(`[LightingSyncHandler] handleBroadcastEvent: "${event}"`, payload);

    if (event === 'light_toggle') {
      const keys = [payload.roomId, payload.roomName, payload.room].filter(Boolean);
      if (typeof payload.power === 'boolean') {
        let applied = false;
        for (const k of keys) {
          if (this.setRoomLightPower(k, payload.power, 'realtime_supabase')) {
            applied = true;
            break;
          }
        }
        if (!applied && keys.length > 0) {
          this.setRoomLightPower(keys[0], payload.power, 'realtime_supabase');
        }
      }
    } else if (event === 'set_lights' || event === 'lighting_scene') {
      const lightsObj = payload.lights || payload;
      if (typeof lightsObj === 'object' && lightsObj !== null) {
        for (const [roomKey, lightObj] of Object.entries(lightsObj)) {
          const power = (lightObj as any)?.power;
          if (typeof power === 'boolean') {
            this.setRoomLightPower(roomKey, power, 'realtime_supabase');
          }
        }
      }
    }
  }

  /**
   * Handle changes from home_states (e.g. key = 'lights')
   * or direct rooms table updates.
   */
  public handleStateUpdate(key: string, value: any): void {
    if (key === 'lights' && typeof value === 'object' && value !== null) {
      console.log('[LightingSyncHandler] handleStateUpdate lights:', value);
      // e.g. value: { livingRoom: { power: true, brightness: 80 }, kitchen: { power: false } }
      for (const [roomKey, lightObj] of Object.entries(value)) {
        const power = (lightObj as any)?.power;
        if (typeof power === 'boolean') {
          this.setRoomLightPower(roomKey, power, 'realtime_supabase');
        }
      }
    }
  }

  /**
   * Turn a specific room's light relay ON or OFF.
   * Matches room by ID, room name, or key (e.g. 'livingRoom').
   * Strictly targets ONLY the designated light_gpio pin for this room.
   */
  public setRoomLightPower(
    roomIdentifier: string,
    power: boolean,
    source: 'realtime_supabase' | 'local_api' | 'manual' = 'realtime_supabase'
  ): boolean {
    if (!roomIdentifier) return false;
    const normalized = roomIdentifier.toLowerCase().replace(/[\s_-]/g, '');

    // 1. Resolve room from known cached rooms or controller mapping
    const knownRooms = this.getRooms ? this.getRooms() : [];
    const matchedRoom = knownRooms.find((r: any) =>
      r.id === roomIdentifier ||
      (r.id && r.id.toLowerCase().replace(/[\s_-]/g, '') === normalized) ||
      (r.name && r.name.toLowerCase().replace(/[\s_-]/g, '') === normalized)
    );

    const mapped = this.roomControllerMap.get(roomIdentifier) || this.roomControllerMap.get(normalized);
    const controller = (matchedRoom?.light_controller || mapped?.controller || 'main').toLowerCase();

    // Check if room is mapped to a sub-controller
    if (controller && !['main', 'hub', 'rpi'].includes(controller)) {
      if (config.smarterHomeToken) {
        MqttBridgeService.getInstance().publishSubCommand(config.smarterHomeToken, controller, {
          action: 'set_power',
          property: 'light_gpio',
          roomId: roomIdentifier,
          pin: matchedRoom?.light_gpio || mapped?.bcmGpio,
          power
        });
        return true;
      }
    }

    // Determine the exact single target GPIO for this room
    let targetGpio: number | null = null;
    if (matchedRoom && matchedRoom.light_gpio !== null && matchedRoom.light_gpio !== undefined && !isNaN(parseInt(String(matchedRoom.light_gpio), 10))) {
      targetGpio = parseInt(String(matchedRoom.light_gpio), 10);
    } else if (mapped && mapped.bcmGpio !== null && !isNaN(mapped.bcmGpio)) {
      targetGpio = mapped.bcmGpio;
    } else if (normalized === 'livingroom' || (matchedRoom?.name && matchedRoom.name.toLowerCase().includes('living'))) {
      targetGpio = 17; // Standard Living Room light pin
    }

    if (targetGpio !== null && !isNaN(targetGpio)) {
      let relay = this.getRelayByGpio(targetGpio);
      if (!relay) {
        const pin = getPinByBcmGpio(targetGpio);
        const roomLabel = matchedRoom?.name || roomIdentifier;
        const sensorConfig: SensorConfig = {
          id: `sensor-relay-${targetGpio}`,
          name: `${roomLabel} 12V Light Relay (GPIO ${targetGpio})`,
          type: 'relay',
          pinNumber: pin?.pinNumber,
          bcmGpio: targetGpio,
          pollIntervalMs: 0,
          enabled: true,
          options: {
            activeLow: false,
            roomId: matchedRoom?.id || roomIdentifier,
            roomName: roomLabel,
            initialPower: power
          }
        };
        this.registry.registerSensor(sensorConfig, true).then(r => {
          const registeredRelay = r as RelaySensor;
          this.activeRelayMap.set(targetGpio!, registeredRelay);
          registeredRelay.setPower(power, source);
        }).catch(err => console.warn(`[LightingSyncHandler] Auto-create relay failed on GPIO ${targetGpio}:`, err));
        return true;
      }

      relay.setPower(power, source);
      return true;
    }

    // Fallback: only if no specific GPIO could be determined, find exact sensor ID
    for (const sensor of this.registry.getAllSensors()) {
      if (sensor instanceof RelaySensor && !sensor.config.options?.isAcRelay) {
        const opt = sensor.config.options || {};
        const sensorRoomId = (opt.roomId || '').toLowerCase().replace(/[\s_-]/g, '');
        if (sensorRoomId === normalized || sensor.id === `sensor-relay-${normalized}`) {
          sensor.setPower(power, source);
          return true;
        }
      }
    }

    return false;
  }

  public getRelayByGpio(bcmGpio: number): RelaySensor | undefined {
    return this.activeRelayMap.get(bcmGpio) ||
      (this.registry.getAllSensors().find(s => s.type === 'relay' && s.bcmGpio === bcmGpio && !s.config.options?.isAcRelay) as RelaySensor | undefined);
  }
}
