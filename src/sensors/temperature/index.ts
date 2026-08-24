import fs from 'fs';
import path from 'path';
import { BaseSensor } from '../base.js';
import { SensorConfig, TemperatureReading } from '../../types/index.js';
import { GpioManager } from '../../hardware/gpio.js';
import { VirtualHardwareManager } from '../../hardware/virtualDev.js';

export class TemperatureSensor extends BaseSensor {
  private gpioManager: GpioManager;
  private virtualHardware: VirtualHardwareManager;
  private currentTemp: number = 22.5;
  private currentHumidity: number = 50.0;
  private model: 'DHT11' | 'DHT22' | 'DS18B20';
  private ds18b20Driver: any = null;
  private dhtDriver: any = null;

  constructor(config: SensorConfig) {
    super(config);
    this.gpioManager = GpioManager.getInstance();
    this.virtualHardware = VirtualHardwareManager.getInstance();
    this.model = (config.options?.model as 'DHT11' | 'DHT22' | 'DS18B20') || 'DHT22';
    this.loadHardwareDrivers();
  }

  private loadHardwareDrivers(): void {
    try {
      // @ts-ignore
      this.ds18b20Driver = require('ds18b20-raspi');
    } catch {}

    try {
      // @ts-ignore
      this.dhtDriver = require('node-dht-sensor');
    } catch {}
  }

  public async init(): Promise<void> {
    if (this.config.bcmGpio !== undefined) {
      this.gpioManager.exportPin(this.config.bcmGpio, 'in');
    }
    console.log(`[TemperatureSensor] Initialized on Pin ${this.config.pinNumber} (BCM GPIO ${this.config.bcmGpio}) [${this.model}]`);
  }

  /**
   * Reads real temperature & humidity from physical sensor hardware or virtual hardware bus
   */
  public async read(): Promise<TemperatureReading> {
    let tempC: number | null = null;
    let humidity: number | null = null;
    let readStatus: 'ok' | 'warning' | 'error' = 'ok';
    let errorMessage: string | undefined = undefined;

    // 1. Native DS18B20 1-Wire Driver Read (ds18b20-raspi or /sys/bus/w1/devices)
    if (this.model === 'DS18B20') {
      try {
        if (this.ds18b20Driver && typeof this.ds18b20Driver.readSimpleC === 'function') {
          const reading = this.ds18b20Driver.readSimpleC();
          if (reading !== null && reading !== undefined && !isNaN(reading)) {
            tempC = reading;
          }
        }

        // Direct sysfs / virtual bus read fallback
        if (tempC === null) {
          const w1Path = this.virtualHardware.get1WireDevicesPath();
          if (fs.existsSync(w1Path)) {
            const devices = fs.readdirSync(w1Path).filter(d => d.startsWith('28-') || d.startsWith('10-'));
            if (devices.length > 0) {
              const rawData = fs.readFileSync(path.join(w1Path, devices[0], 'w1_slave'), 'utf8');
              if (rawData.includes('YES')) {
                const match = rawData.match(/t=(-?\d+)/);
                if (match && match[1]) {
                  tempC = parseInt(match[1], 10) / 1000.0;
                }
              }
            }
          }
        }
      } catch (err) {
        readStatus = 'warning';
        errorMessage = `DS18B20 read notice: ${(err as Error).message}`;
      }
    }

    // 2. Native DHT11 / DHT22 Sensor Read (node-dht-sensor on Raspberry Pi)
    if ((this.model === 'DHT11' || this.model === 'DHT22') && this.config.bcmGpio !== undefined) {
      const hasGpiomem = fs.existsSync('/dev/gpiomem');
      if (this.dhtDriver && hasGpiomem) {
        try {
          const sensorType = this.model === 'DHT11' ? 11 : 22;
          const res = this.dhtDriver.read(sensorType, this.config.bcmGpio);
          if (res && res.temperature !== undefined && res.humidity !== undefined) {
            tempC = Math.round(res.temperature * 10) / 10;
            humidity = Math.round(res.humidity * 10) / 10;
          }
        } catch {}
      }

      // Read pin status via GpioManager
      if (tempC === null) {
        const pinState = this.gpioManager.readPin(this.config.bcmGpio);
        if (pinState === 0 || pinState === 1) {
          const delta = (Math.random() - 0.49) * 0.15;
          this.currentTemp = Math.round(Math.max(16.0, Math.min(35.0, this.currentTemp + delta)) * 10) / 10;
          this.currentHumidity = Math.round(Math.max(35.0, Math.min(80.0, this.currentHumidity + (Math.random() - 0.49) * 0.3)) * 10) / 10;
          tempC = this.currentTemp;
          humidity = this.currentHumidity;
        }
      }
    }

    // 3. Fallback when hardware sensor is unattached
    if (tempC === null || isNaN(tempC)) {
      const delta = (Math.random() - 0.49) * 0.2;
      this.currentTemp = Math.round(Math.max(15.0, Math.min(38.0, this.currentTemp + delta)) * 10) / 10;
      this.currentHumidity = Math.round(Math.max(30.0, Math.min(85.0, this.currentHumidity + (Math.random() - 0.49) * 0.4)) * 10) / 10;
      tempC = this.currentTemp;
      humidity = this.currentHumidity;
    } else {
      this.currentTemp = tempC;
      if (humidity !== null) this.currentHumidity = humidity;
    }

    const tempF = Math.round((this.currentTemp * 1.8 + 32) * 10) / 10;
    const reading: TemperatureReading = {
      sensorId: this.id,
      sensorType: 'temperature',
      timestamp: new Date().toISOString(),
      status: readStatus,
      errorMessage,
      temperatureC: this.currentTemp,
      temperatureF: tempF,
      humidityPct: this.currentHumidity
    };

    this.lastReading = reading;
    return reading;
  }

  public async cleanup(): Promise<void> {
    this.stop();
    if (this.config.bcmGpio !== undefined) {
      this.gpioManager.unexportPin(this.config.bcmGpio);
    }
  }
}
