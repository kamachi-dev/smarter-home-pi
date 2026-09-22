import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
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

  /**
   * Reads Adafruit CircuitPython DHT sensor via python3 (standard on modern RPi OS)
   */
  private readAdafruitDht(bcmGpio: number): { tempC: number; humidity: number } | null {
    if (process.platform !== 'linux') return null;
    try {
      const sensorClass = this.model === 'DHT11' ? 'DHT11' : 'DHT22';
      const pythonScript = `import board, adafruit_dht; d=adafruit_dht.${sensorClass}(getattr(board, f'D{${bcmGpio}}')); print(f'{d.temperature:.1f},{d.humidity:.1f}')`;
      const result = spawnSync('python3', ['-c', pythonScript], {
        encoding: 'utf8',
        timeout: 4000
      });

      if (result.status === 0 && result.stdout) {
        const line = result.stdout.trim().split('\n')[0].trim();
        const parts = line.split(',');
        if (parts.length >= 2) {
          const t = parseFloat(parts[0]);
          const h = parseFloat(parts[1]);
          if (!isNaN(t) && !isNaN(h)) {
            return { tempC: t, humidity: h };
          }
        }
      }
    } catch {}
    return null;
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

    // 2. Native DHT11 / DHT22 Sensor Read (Adafruit CircuitPython or node-dht-sensor on Raspberry Pi)
    if ((this.model === 'DHT11' || this.model === 'DHT22') && this.config.bcmGpio !== undefined) {
      // 2a. First try Adafruit CircuitPython (board.D<pin> + adafruit_dht)
      const adafruitReading = this.readAdafruitDht(this.config.bcmGpio);
      if (adafruitReading) {
        tempC = adafruitReading.tempC;
        humidity = adafruitReading.humidity;
      }

      // 2b. Fallback to node-dht-sensor if available
      if (tempC === null) {
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
      }

    }

    // 3. Status when hardware sensor is not physically connected or responding
    if (tempC === null || isNaN(tempC)) {
      readStatus = 'warning';
      errorMessage = errorMessage || `Hardware DHT22/DS18B20 sensor not responding on GPIO ${this.config.bcmGpio}`;
      tempC = this.config.options?.temperature !== undefined ? this.config.options.temperature : null;
      humidity = this.config.options?.humidity !== undefined ? this.config.options.humidity : null;
    } else {
      this.currentTemp = tempC;
      if (humidity !== null) this.currentHumidity = humidity;
    }

    const tempF = tempC !== null ? Math.round((tempC * 1.8 + 32) * 10) / 10 : null;
    const reading: TemperatureReading = {
      sensorId: this.id,
      sensorType: 'temperature',
      timestamp: new Date().toISOString(),
      status: readStatus,
      errorMessage,
      temperatureC: tempC,
      temperatureF: tempF,
      humidityPct: humidity
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
