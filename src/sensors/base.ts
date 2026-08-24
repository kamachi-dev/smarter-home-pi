import EventEmitter from 'events';
import { SensorConfig, SensorReading, SensorType } from '../types/index.js';

export abstract class BaseSensor extends EventEmitter {
  public readonly config: SensorConfig;
  protected isRunning: boolean = false;
  protected pollTimer: NodeJS.Timeout | null = null;
  protected lastReading: SensorReading | null = null;

  constructor(config: SensorConfig) {
    super();
    this.config = config;
  }

  public get id(): string {
    return this.config.id;
  }

  public get type(): SensorType {
    return this.config.type;
  }

  public get name(): string {
    return this.config.name;
  }

  public get pinNumber(): number | undefined {
    return this.config.pinNumber;
  }

  public get bcmGpio(): number | undefined {
    return this.config.bcmGpio;
  }

  public abstract init(): Promise<void>;
  public abstract read(): Promise<SensorReading>;
  public abstract cleanup(): Promise<void>;

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Initial immediate read
    this.read().catch(err => {
      console.error(`[Sensor ${this.name}] Initial read failed:`, err);
    });

    if (this.config.pollIntervalMs > 0) {
      this.pollTimer = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          const reading = await this.read();
          this.lastReading = reading;
          this.emit('reading', reading);
        } catch (err) {
          this.emit('error', err);
        }
      }, this.config.pollIntervalMs);
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public getLastReading(): SensorReading | null {
    return this.lastReading;
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}
