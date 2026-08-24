import EventEmitter from 'events';
import fs from 'fs';
import { BaseSensor } from './base.js';
import { TemperatureSensor } from './temperature/index.js';
import { CameraSensor } from './camera/index.js';
import { SensorConfig, SensorReading, SensorType, RPiPin } from '../types/index.js';
import { RPI_40_PIN_HEADER, getPinByNumber } from '../hardware/pinout.js';
import { config } from '../config/env.js';

export class SensorRegistry extends EventEmitter {
  private static instance: SensorRegistry;
  private sensors: Map<string, BaseSensor> = new Map();
  private pinAssignments: Map<number, string> = new Map(); // pinNumber -> sensorId
  private latestReadings: Map<string, SensorReading> = new Map();

  private constructor() {
    super();
    this.loadSavedConfig();
  }

  public static getInstance(): SensorRegistry {
    if (!SensorRegistry.instance) {
      SensorRegistry.instance = new SensorRegistry();
    }
    return SensorRegistry.instance;
  }

  private loadSavedConfig(): void {
    try {
      let configs: SensorConfig[] = [];
      if (fs.existsSync(config.configFilePath)) {
        try {
          const raw = fs.readFileSync(config.configFilePath, 'utf8');
          configs = JSON.parse(raw);
        } catch {}
      }

      if (Array.isArray(configs) && configs.length > 0) {
        console.log(`[SensorRegistry] Restoring ${configs.length} saved sensor configuration(s)`);
        for (const cfg of configs) {
          this.registerSensor(cfg, false);
        }
      } else {
        // Initial default configuration: Temperature on Pin 7 (GPIO 4) and Camera (CSI/USB)
        console.log('[SensorRegistry] Initializing default hardware sensors (Camera + Temperature)');
        const defaultConfigs: SensorConfig[] = [
          {
            id: 'sensor-cam-1',
            name: 'Entrance Security Camera (Face ID)',
            type: 'camera',
            pollIntervalMs: 2000,
            enabled: true,
            options: { resolution: '640x480' }
          },
          {
            id: 'sensor-temp-1',
            name: 'Living Room Temperature & Humidity',
            type: 'temperature',
            pinNumber: 7,
            bcmGpio: 4,
            pollIntervalMs: 2500,
            enabled: true,
            options: { model: 'DHT22' }
          }
        ];
        for (const cfg of defaultConfigs) {
          this.registerSensor(cfg, false);
        }
        this.saveConfig();
      }
    } catch (err) {
      console.error('[SensorRegistry] Error loading saved config:', (err as Error).message);
    }
  }

  public saveConfig(): void {
    try {
      const configs: SensorConfig[] = [];
      for (const sensor of Array.from(this.sensors.values())) {
        configs.push(sensor.config);
      }
      fs.writeFileSync(config.configFilePath, JSON.stringify(configs, null, 2), 'utf8');
    } catch (err) {
      console.error('[SensorRegistry] Failed to save sensors config:', (err as Error).message);
    }
  }

  public async registerSensor(cfg: SensorConfig, save: boolean = true): Promise<BaseSensor> {
    // If updating existing sensor, stop and remove it first
    if (this.sensors.has(cfg.id)) {
      await this.unregisterSensor(cfg.id, false);
    }

    // Validate Pin if specified
    if (cfg.pinNumber !== undefined) {
      const pin = getPinByNumber(cfg.pinNumber);
      if (!pin) {
        throw new Error(`Physical pin ${cfg.pinNumber} does not exist on 40-pin header.`);
      }
      if (!pin.capabilities.includes('GPIO')) {
        throw new Error(`Pin ${cfg.pinNumber} (${pin.name}) cannot be used as GPIO.`);
      }
      // Populate bcmGpio
      cfg.bcmGpio = pin.bcmGpio || undefined;
      this.pinAssignments.set(cfg.pinNumber, cfg.id);
    }

    let sensorInstance: BaseSensor;
    switch (cfg.type) {
      case 'temperature':
        sensorInstance = new TemperatureSensor(cfg);
        break;
      case 'camera':
        sensorInstance = new CameraSensor(cfg);
        break;
      default:
        throw new Error(`Unsupported sensor type: ${cfg.type}`);
    }

    await sensorInstance.init();

    sensorInstance.on('reading', (reading: SensorReading) => {
      this.latestReadings.set(reading.sensorId, reading);
      this.emit('reading', reading);
    });

    if (sensorInstance instanceof CameraSensor) {
      sensorInstance.on('face_detection', (detection) => {
        this.emit('face_detection', {
          sensorId: sensorInstance.id,
          sensorName: sensorInstance.name,
          ...detection
        });
      });
    }

    this.sensors.set(cfg.id, sensorInstance);

    if (cfg.enabled) {
      sensorInstance.start();
    }

    if (save) {
      this.saveConfig();
    }

    console.log(`[SensorRegistry] Registered ${cfg.type} sensor "${cfg.name}" [ID: ${cfg.id}]`);
    return sensorInstance;
  }

  public async unregisterSensor(sensorId: string, save: boolean = true): Promise<boolean> {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) return false;

    if (sensor.pinNumber) {
      this.pinAssignments.delete(sensor.pinNumber);
    }

    await sensor.cleanup();
    this.sensors.delete(sensorId);
    this.latestReadings.delete(sensorId);

    if (save) {
      this.saveConfig();
    }

    console.log(`[SensorRegistry] Unregistered sensor [ID: ${sensorId}]`);
    return true;
  }

  public getSensor(sensorId: string): BaseSensor | undefined {
    return this.sensors.get(sensorId);
  }

  public getAllSensors(): BaseSensor[] {
    return Array.from(this.sensors.values());
  }

  public getAllConfigs(): SensorConfig[] {
    return Array.from(this.sensors.values()).map(s => s.config);
  }

  public getPinsWithAssignments(): RPiPin[] {
    return RPI_40_PIN_HEADER.map(pin => {
      const assignedSensorId = this.pinAssignments.get(pin.pinNumber);
      return {
        ...pin,
        assignedSensorId
      };
    });
  }

  public getLatestReadings(): Record<string, SensorReading> {
    const obj: Record<string, SensorReading> = {};
    for (const [id, r] of Array.from(this.latestReadings.entries())) {
      obj[id] = r;
    }
    return obj;
  }
}
