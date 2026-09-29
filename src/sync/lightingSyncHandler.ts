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
}

export class LightingSyncHandler {
  private supabase: SupabaseClient | null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;
  private activeRelayMap: Map<number, RelaySensor> = new Map(); // bcmGpio -> RelaySensor
  private roomControllerMap: Map<string, { controller: string; bcmGpio: number | null }> = new Map();

  constructor(options: LightingSyncOptions) {
    this.supabase = options.supabase;
    this.registry = options.registry;
    this.getLinkedHomeId = options.getLinkedHomeId;
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
            activeLow: true,
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
      : null;

    const controller = (room.light_controller || 'main').toLowerCase();

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

    if (bcmGpio !== null && !isNaN(bcmGpio)) {
      const relay = this.getRelayByGpio(bcmGpio);
      if (relay && typeof room.lights_power === 'boolean') {
        relay.setPower(room.lights_power, 'realtime_supabase');
        return;
      }
    }

    // Fallback match by roomId or name
    if (typeof room.lights_power === 'boolean') {
      this.setRoomLightPower(room.id || room.name, room.lights_power, 'realtime_supabase');
    }
  }

  /**
   * Handle changes from home_states (e.g. key = 'lights')
   * or direct rooms table updates.
   */
  public handleStateUpdate(key: string, value: any): void {
    if (key === 'lights' && typeof value === 'object' && value !== null) {
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
   */
  public setRoomLightPower(
    roomIdentifier: string,
    power: boolean,
    source: 'realtime_supabase' | 'local_api' | 'manual' = 'realtime_supabase'
  ): boolean {
    const normalized = roomIdentifier.toLowerCase().replace(/[\s_-]/g, '');

    // Check if room is mapped to a sub-controller
    const mapped = this.roomControllerMap.get(roomIdentifier) || this.roomControllerMap.get(normalized);
    if (mapped && mapped.controller && !['main', 'hub', 'rpi'].includes(mapped.controller)) {
      if (config.smarterHomeToken) {
        MqttBridgeService.getInstance().publishSubCommand(config.smarterHomeToken, mapped.controller, {
          action: 'set_power',
          property: 'light_gpio',
          roomId: roomIdentifier,
          pin: mapped.bcmGpio,
          power
        });
        return true;
      }
    }

    let found = false;

    for (const sensor of this.registry.getAllSensors()) {
      if (sensor instanceof RelaySensor) {
        const opt = sensor.config.options || {};
        const sensorRoomId = (opt.roomId || '').toLowerCase().replace(/[\s_-]/g, '');
        const sensorRoomName = (opt.roomName || sensor.name || '').toLowerCase().replace(/[\s_-]/g, '');

        if (
          sensorRoomId === normalized ||
          sensorRoomName.includes(normalized) ||
          (normalized === 'livingroom' && sensor.bcmGpio === 17) // Fallback default
        ) {
          sensor.setPower(power, source);
          found = true;
        }
      }
    }

    return found;
  }

  public getRelayByGpio(bcmGpio: number): RelaySensor | undefined {
    return this.activeRelayMap.get(bcmGpio) ||
      (this.registry.getAllSensors().find(s => s.type === 'relay' && s.bcmGpio === bcmGpio) as RelaySensor | undefined);
  }
}
