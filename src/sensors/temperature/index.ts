import fs from 'fs';
import path from 'path';
import { BaseSensor } from '../base.js';
import { SensorConfig, TemperatureReading } from '../../types/index.js';
import { GpioManager } from '../../hardware/gpio.js';

export class TemperatureSensor extends BaseSensor {
  private gpioManager: GpioManager;
  private currentTemp: number = 22.5;
  private currentHumidity: number = 50.0;
  private model: 'DHT11' | 'DHT22' | 'DS18B20';

  constructor(config: SensorConfig) {
    super(config);
    this.gpioManager = GpioManager.getInstance();
    this.model = (config.options?.model as 'DHT11' | 'DHT22' | 'DS18B20') || 'DHT22';
  }

  public async init(): Promise<void> {
    if (this.config.bcmGpio !== undefined) {
      this.gpioManager.exportPin(this.config.bcmGpio, 'in');
    }
    console.log(`[TemperatureSensor] Initialized on Pin ${this.config.pinNumber} (BCM GPIO ${this.config.bcmGpio}) [${this.model}]`);
  }

  public async read(): Promise<TemperatureReading> {
    let tempC = this.currentTemp;
    let humidity = this.currentHumidity;

    if (this.gpioManager.isHardwareMode() && this.model === 'DS18B20') {
      try {
        const w1DevicesPath = '/sys/bus/w1/devices';
        if (fs.existsSync(w1DevicesPath)) {
          const devices = fs.readdirSync(w1DevicesPath).filter(d => d.startsWith('28-'));
          if (devices.length > 0) {
            const data = fs.readFileSync(path.join(w1DevicesPath, devices[0], 'w1_slave'), 'utf8');
            const match = data.match(/t=(\d+)/);
            if (match && match[1]) {
              tempC = parseInt(match[1], 10) / 1000.0;
            }
          }
        }
      } catch (err) {
        console.warn('[TemperatureSensor] DS18B20 read fallback:', (err as Error).message);
      }
    } else {
      // Dynamic ambient simulation with subtle natural drift
      const delta = (Math.random() - 0.49) * 0.3;
      tempC = Math.max(16.0, Math.min(35.0, tempC + delta));
      humidity = Math.max(30.0, Math.min(85.0, humidity + (Math.random() - 0.49) * 0.5));
      this.currentTemp = Math.round(tempC * 10) / 10;
      this.currentHumidity = Math.round(humidity * 10) / 10;
    }

    const tempF = Math.round((tempC * 1.8 + 32) * 10) / 10;
    const reading: TemperatureReading = {
      sensorId: this.id,
      sensorType: 'temperature',
      timestamp: new Date().toISOString(),
      status: 'ok',
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
