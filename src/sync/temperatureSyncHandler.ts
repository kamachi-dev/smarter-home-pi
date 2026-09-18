import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { TemperatureSensor } from '../sensors/temperature/index.js';
import { SensorConfig, TemperatureReading } from '../types/index.js';
import { getPinByBcmGpio } from '../hardware/pinout.js';

export interface TemperatureSyncOptions {
  supabase: SupabaseClient | null;
  registry: SensorRegistry;
  getLinkedHomeId: () => Promise<string | null>;
}

export class TemperatureSyncHandler {
  private supabase: SupabaseClient | null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;
  private activeTempSensors: Map<number, TemperatureSensor> = new Map(); // bcmGpio -> TemperatureSensor
  private lastSyncedReadings: Map<string, { temp: number; hum: number }> = new Map(); // roomId -> { temp, hum }

  constructor(options: TemperatureSyncOptions) {
    this.supabase = options.supabase;
    this.registry = options.registry;
    this.getLinkedHomeId = options.getLinkedHomeId;
    this.indexExistingSensors();
  }

  public updateSupabaseClient(client: SupabaseClient | null) {
    this.supabase = client;
  }

  private indexExistingSensors(): void {
    const sensors = this.registry.getAllSensors();
    for (const sensor of sensors) {
      if (sensor instanceof TemperatureSensor && sensor.bcmGpio !== undefined) {
        this.activeTempSensors.set(sensor.bcmGpio, sensor);
      }
    }
  }

  /**
   * Synchronize room definitions with temp_gpio pins.
   * Ensures every room declaring temp_gpio has an active TemperatureSensor registered.
   */
  public async syncRoomsTemperature(rooms: any[]): Promise<void> {
    if (!Array.isArray(rooms)) return;

    for (const room of rooms) {
      const bcmGpio = room.temp_gpio !== null && room.temp_gpio !== undefined && room.temp_gpio !== ''
        ? parseInt(String(room.temp_gpio), 10)
        : null;

      if (bcmGpio === null || isNaN(bcmGpio)) continue;

      const sensorId = `sensor-temp-${bcmGpio}`;
      let tempSensor = this.registry.getSensor(sensorId) as TemperatureSensor | undefined;

      if (!tempSensor) {
        const pin = getPinByBcmGpio(bcmGpio);
        const sensorConfig: SensorConfig = {
          id: sensorId,
          name: `${room.name || 'Room'} Temperature & Humidity (GPIO ${bcmGpio})`,
          type: 'temperature',
          pinNumber: pin?.pinNumber,
          bcmGpio,
          pollIntervalMs: 2500,
          enabled: true,
          options: {
            model: 'DHT22',
            roomId: room.id,
            roomName: room.name
          }
        };

        try {
          tempSensor = (await this.registry.registerSensor(sensorConfig, true)) as TemperatureSensor;
          this.activeTempSensors.set(bcmGpio, tempSensor);
        } catch (err) {
          console.warn(`[TemperatureSyncHandler] Failed to register temp sensor on GPIO ${bcmGpio}:`, (err as Error).message);
        }
      }
    }
  }

  /**
   * Pushes latest temperature and humidity values for rooms with temp_gpio to Supabase
   */
  public async syncReadingsToRooms(rooms: any[]): Promise<void> {
    if (!this.supabase || !Array.isArray(rooms) || rooms.length === 0) return;

    for (const room of rooms) {
      const bcmGpio = room.temp_gpio !== null && room.temp_gpio !== undefined && room.temp_gpio !== ''
        ? parseInt(String(room.temp_gpio), 10)
        : null;

      if (bcmGpio === null || isNaN(bcmGpio)) continue;

      const sensor = this.activeTempSensors.get(bcmGpio) ||
        (this.registry.getSensor(`sensor-temp-${bcmGpio}`) as TemperatureSensor | undefined);

      if (!sensor) continue;

      const latest = sensor.getLastReading() as TemperatureReading | null;
      if (!latest || latest.temperatureC === undefined) continue;

      const tempVal = Math.round(latest.temperatureC * 10) / 10;
      const humVal = latest.humidityPct !== undefined ? Math.round(latest.humidityPct) : null;

      const lastSent = this.lastSyncedReadings.get(room.id);
      const hasChanged = !lastSent ||
        Math.abs(lastSent.temp - tempVal) >= 0.1 ||
        (humVal !== null && lastSent.hum !== humVal);

      if (hasChanged) {
        try {
          const updatePayload: { temperature: number; humidity?: number; updated_at: string } = {
            temperature: tempVal,
            updated_at: new Date().toISOString()
          };
          if (humVal !== null) {
            updatePayload.humidity = humVal;
          }

          await this.supabase
            .from('rooms')
            .update(updatePayload)
            .eq('id', room.id);

          this.lastSyncedReadings.set(room.id, { temp: tempVal, hum: humVal ?? 0 });
        } catch (err) {
          console.warn(`[TemperatureSyncHandler] Room ${room.name} temp sync error:`, (err as Error).message);
        }
      }
    }
  }

  public getSensorByGpio(bcmGpio: number): TemperatureSensor | undefined {
    return this.activeTempSensors.get(bcmGpio);
  }
}
