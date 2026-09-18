import { BaseSensor } from '../base.js';
import { SensorConfig, RelayReading } from '../../types/index.js';
import { GpioManager } from '../../hardware/gpio.js';
import { lightLogger } from './logger.js';

export class RelaySensor extends BaseSensor {
  private gpioManager: GpioManager;
  private power: boolean = false;
  private activeLow: boolean = true; // Most 5V/12V relay modules are active LOW
  private bcm: number;

  constructor(config: SensorConfig) {
    super(config);
    this.gpioManager = GpioManager.getInstance();
    this.bcm = config.bcmGpio ?? 17;
    // Allow overriding activeLow via config options
    this.activeLow = config.options?.activeLow !== false;
    this.power = Boolean(config.options?.initialPower);
  }

  public async init(): Promise<void> {
    this.gpioManager.exportPin(this.bcm, 'out');
    this.applyHardwareState();
    console.log(`[RelaySensor] Initialized on BCM GPIO ${this.bcm} (Pin ${this.config.pinNumber ?? 'N/A'}) [ActiveLow: ${this.activeLow}, Power: ${this.power}]`);
  }

  private applyHardwareState(): void {
    // Active low: power ON -> write 0, power OFF -> write 1
    // Active high: power ON -> write 1, power OFF -> write 0
    const rawVal = this.activeLow ? (this.power ? 0 : 1) : (this.power ? 1 : 0);
    this.gpioManager.writePin(this.bcm, rawVal as 0 | 1);
  }

  public setPower(power: boolean, source: 'realtime_supabase' | 'local_api' | 'manual' = 'realtime_supabase'): void {
    if (this.power === power) return;
    this.power = power;
    this.applyHardwareState();

    const roomLabel = this.config.options?.roomName || this.config.options?.roomId || this.name;
    lightLogger.record(roomLabel, this.bcm, this.power ? 'ON' : 'OFF', source);

    const reading: RelayReading = {
      sensorId: this.id,
      sensorType: 'relay',
      power: this.power,
      bcmGpio: this.bcm,
      activeLow: this.activeLow,
      roomId: this.config.options?.roomId || this.config.options?.room_id,
      timestamp: new Date().toISOString(),
      status: 'ok'
    };

    this.lastReading = reading;
    this.emit('reading', reading);
  }

  public getPower(): boolean {
    return this.power;
  }

  public async read(): Promise<RelayReading> {
    return {
      sensorId: this.id,
      sensorType: 'relay',
      power: this.power,
      bcmGpio: this.bcm,
      activeLow: this.activeLow,
      roomId: this.config.options?.roomId || this.config.options?.room_id,
      timestamp: new Date().toISOString(),
      status: 'ok'
    };
  }

  public async cleanup(): Promise<void> {
    // On shutdown, turn off relay switch safely
    this.power = false;
    this.applyHardwareState();
    this.gpioManager.unexportPin(this.bcm);
  }
}
