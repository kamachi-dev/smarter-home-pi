import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { RelaySensor } from '../sensors/relay/index.js';
import { SensorConfig } from '../types/index.js';
import { getPinByBcmGpio } from '../hardware/pinout.js';

export interface AcSyncOptions {
  supabase: SupabaseClient | null;
  registry: SensorRegistry;
  getLinkedHomeId: () => Promise<string | null>;
}

export class AcSyncHandler {
  private supabase: SupabaseClient | null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;
  private activeRelayMap: Map<number, RelaySensor> = new Map(); // bcmGpio -> RelaySensor

  constructor(options: AcSyncOptions) {
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
        if (sensor.id.startsWith('sensor-ac-relay-')) {
          this.activeRelayMap.set(sensor.bcmGpio, sensor);
        }
      }
    }
  }

  /**
   * Synchronize room definitions with ac_gpio pins.
   * Ensures every room that declares ac_gpio has an active RelaySensor registered.
   */
  public async syncRoomsAc(rooms: any[]): Promise<void> {
    if (!Array.isArray(rooms)) return;

    for (const room of rooms) {
      const bcmGpio = room.ac_gpio !== null && room.ac_gpio !== undefined && room.ac_gpio !== ''
        ? parseInt(String(room.ac_gpio), 10)
        : null;

      if (bcmGpio === null || isNaN(bcmGpio)) continue;

      const sensorId = `sensor-ac-relay-${bcmGpio}`;
      let relay = this.registry.getSensor(sensorId) as RelaySensor | undefined;

      if (!relay) {
        const pin = getPinByBcmGpio(bcmGpio);
        const sensorConfig: SensorConfig = {
          id: sensorId,
          name: `${room.name || 'Room'} AC Power Relay (GPIO ${bcmGpio})`,
          type: 'relay',
          pinNumber: pin?.pinNumber,
          bcmGpio,
          pollIntervalMs: 0,
          enabled: true,
          options: {
            activeLow: true,
            isAcRelay: true,
            roomId: room.id,
            roomName: room.name,
            initialPower: Boolean(room.ac_power)
          }
        };

        try {
          relay = (await this.registry.registerSensor(sensorConfig, true)) as RelaySensor;
          this.activeRelayMap.set(bcmGpio, relay);
          console.log(`[AcSyncHandler] Registered AC Relay for room "${room.name}" on GPIO ${bcmGpio}`);
        } catch (err) {
          console.warn(`[AcSyncHandler] Failed to register AC relay on GPIO ${bcmGpio}:`, (err as Error).message);
        }
      }

      // Apply initial room AC power state
      if (relay && typeof room.ac_power === 'boolean') {
        relay.setPower(room.ac_power, 'realtime_supabase');
      }
    }
  }

  /**
   * Directly handle Realtime UPDATE/INSERT from the `rooms` table
   * allowing instantaneous AC relay switching when user toggles AC on Climate/Rooms page.
   */
  public handleRoomRecordUpdate(room: any): void {
    if (!room) return;
    const bcmGpio = room.ac_gpio !== null && room.ac_gpio !== undefined && room.ac_gpio !== ''
      ? parseInt(String(room.ac_gpio), 10)
      : null;

    if (bcmGpio !== null && !isNaN(bcmGpio)) {
      const relay = this.getRelayByGpio(bcmGpio);
      if (relay && typeof room.ac_power === 'boolean') {
        console.log(`[AcSyncHandler] Realtime AC state update for room "${room.name || room.id}" (GPIO ${bcmGpio}): ${room.ac_power ? 'ON' : 'OFF'}`);
        relay.setPower(room.ac_power, 'realtime_supabase');
        return;
      }
    }

    // Fallback match by roomId or room name
    if (typeof room.ac_power === 'boolean') {
      this.setRoomAcPower(room.id || room.name, room.ac_power, 'realtime_supabase');
    }
  }

  /**
   * Turn a specific room's AC relay ON or OFF.
   * Matches room by ID or room name.
   */
  public setRoomAcPower(
    roomIdentifier: string,
    power: boolean,
    source: 'realtime_supabase' | 'local_api' | 'manual' = 'realtime_supabase'
  ): boolean {
    const normalized = roomIdentifier.toLowerCase().replace(/[\s_-]/g, '');
    let found = false;

    for (const sensor of this.registry.getAllSensors()) {
      if (sensor instanceof RelaySensor && sensor.config.options?.isAcRelay) {
        const opt = sensor.config.options || {};
        const sensorRoomId = (opt.roomId || '').toLowerCase().replace(/[\s_-]/g, '');
        const sensorRoomName = (opt.roomName || sensor.name || '').toLowerCase().replace(/[\s_-]/g, '');

        if (sensorRoomId === normalized || sensorRoomName.includes(normalized)) {
          sensor.setPower(power, source);
          found = true;
        }
      }
    }

    return found;
  }

  public getRelayByGpio(bcmGpio: number): RelaySensor | undefined {
    return this.activeRelayMap.get(bcmGpio) ||
      (this.registry.getAllSensors().find(s => s.type === 'relay' && s.bcmGpio === bcmGpio && s.config.options?.isAcRelay) as RelaySensor | undefined);
  }
}
