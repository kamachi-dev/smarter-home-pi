import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

export class GpioManager {
  private static instance: GpioManager;
  private isLinux: boolean;
  private sysfsGpioPath = '/sys/class/gpio';
  private exportedPins: Set<number> = new Set();
  private simulatedPinStates: Map<number, { direction: 'in' | 'out'; value: number }> = new Map();

  private constructor() {
    this.isLinux = process.platform === 'linux' && !config.isSimulatedHardware;
    console.log(`[GpioManager] Initialized in ${this.isLinux ? 'NATIVE RASPBERRY PI HARDWARE' : 'SIMULATION/EMULATED'} mode`);
  }

  public static getInstance(): GpioManager {
    if (!GpioManager.instance) {
      GpioManager.instance = new GpioManager();
    }
    return GpioManager.instance;
  }

  public isHardwareMode(): boolean {
    return this.isLinux;
  }

  public exportPin(bcmGpio: number, direction: 'in' | 'out' = 'in'): boolean {
    if (!this.isLinux) {
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      this.exportedPins.add(bcmGpio);
      return true;
    }

    try {
      const pinPath = path.join(this.sysfsGpioPath, `gpio${bcmGpio}`);
      if (!fs.existsSync(pinPath)) {
        fs.writeFileSync(path.join(this.sysfsGpioPath, 'export'), bcmGpio.toString());
      }
      // Wait briefly for sysfs permissions / creation
      fs.writeFileSync(path.join(pinPath, 'direction'), direction);
      this.exportedPins.add(bcmGpio);
      return true;
    } catch (err) {
      console.warn(`[GpioManager] Could not export GPIO ${bcmGpio} via sysfs (falling back to virtual pin):`, (err as Error).message);
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      this.exportedPins.add(bcmGpio);
      return false;
    }
  }

  public unexportPin(bcmGpio: number): boolean {
    this.exportedPins.delete(bcmGpio);
    if (!this.isLinux) {
      this.simulatedPinStates.delete(bcmGpio);
      return true;
    }

    try {
      const pinPath = path.join(this.sysfsGpioPath, `gpio${bcmGpio}`);
      if (fs.existsSync(pinPath)) {
        fs.writeFileSync(path.join(this.sysfsGpioPath, 'unexport'), bcmGpio.toString());
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  public readPin(bcmGpio: number): number {
    if (!this.isLinux) {
      const state = this.simulatedPinStates.get(bcmGpio);
      return state ? state.value : 0;
    }

    try {
      const valuePath = path.join(this.sysfsGpioPath, `gpio${bcmGpio}`, 'value');
      if (fs.existsSync(valuePath)) {
        const valStr = fs.readFileSync(valuePath, 'utf8').trim();
        return parseInt(valStr, 10) || 0;
      }
    } catch (err) {
      // fallback
    }
    return 0;
  }

  public writePin(bcmGpio: number, value: 0 | 1): boolean {
    if (!this.isLinux) {
      const state = this.simulatedPinStates.get(bcmGpio) || { direction: 'out', value: 0 };
      state.value = value;
      this.simulatedPinStates.set(bcmGpio, state);
      return true;
    }

    try {
      const valuePath = path.join(this.sysfsGpioPath, `gpio${bcmGpio}`, 'value');
      if (fs.existsSync(valuePath)) {
        fs.writeFileSync(valuePath, value.toString());
        return true;
      }
    } catch (err) {
      console.error(`[GpioManager] Write error on GPIO ${bcmGpio}:`, (err as Error).message);
    }
    return false;
  }

  public cleanupAll(): void {
    for (const pin of Array.from(this.exportedPins)) {
      this.unexportPin(pin);
    }
    this.exportedPins.clear();
  }
}
