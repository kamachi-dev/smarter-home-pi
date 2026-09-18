import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { RelaySensor } from '../sensors/relay/index.js';
import { SensorConfig } from '../types/index.js';
import { getPinByBcmGpio } from '../hardware/pinout.js';

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

      if (bcmGpio === null || isNaN(bcmGpio)) continue;

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

    if (bcmGpio !== null && !isNaN(bcmGpio)) {
      const relay = this.getRelayByGpio(bcmGpio);
      if (relay && typeof room.lights_power === 'boolean') {
        relay.setPower(room.lights_power);
        return;
      }
    }

    // Fallback match by roomId or name
    if (typeof room.lights_power === 'boolean') {
      this.setRoomLightPower(room.id || room.name, room.lights_power);
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
          this.setRoomLightPower(roomKey, power);
        }
      }
    }
  }

  /**
   * Turn a specific room's light relay ON or OFF.
   * Matches room by ID, room name, or key (e.g. 'livingRoom').
   */
  public setRoomLightPower(roomIdentifier: string, power: boolean): boolean {
    const normalized = roomIdentifier.toLowerCase().replace(/[\s_-]/g, '');
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
          sensor.setPower(power);
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
