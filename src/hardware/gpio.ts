import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

export class GpioManager {
  private static instance: GpioManager;
  private isLinuxHardware: boolean;
  private sysfsPath = '/sys/class/gpio';
  private exportedPins: Set<number> = new Set();
  private simulatedPinStates: Map<number, { direction: 'in' | 'out'; value: number }> = new Map();

  private constructor() {
    this.isLinuxHardware = process.platform === 'linux' && fs.existsSync(this.sysfsPath) && !config.isSimulatedHardware;
    console.log(`[GpioManager] Initialized in ${this.isLinuxHardware ? 'NATIVE LINUX HARDWARE' : 'SIMULATION/EMULATED'} mode (Standard /sys/class/gpio - No gpiomem)`);
  }

  public static getInstance(): GpioManager {
    if (!GpioManager.instance) {
      GpioManager.instance = new GpioManager();
    }
    return GpioManager.instance;
  }

  public isHardwareMode(): boolean {
    return this.isLinuxHardware;
  }

  public exportPin(bcmGpio: number, direction: 'in' | 'out' = 'in'): boolean {
    if (!this.isLinuxHardware) {
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      this.exportedPins.add(bcmGpio);
      return true;
    }

    try {
      const pinPath = path.join(this.sysfsPath, `gpio${bcmGpio}`);
      if (!fs.existsSync(pinPath)) {
        fs.writeFileSync(path.join(this.sysfsPath, 'export'), bcmGpio.toString());
      }
      fs.writeFileSync(path.join(pinPath, 'direction'), direction);
      this.exportedPins.add(bcmGpio);
      return true;
    } catch (err) {
      console.warn(`[GpioManager] Could not export GPIO ${bcmGpio} via sysfs (using virtual pin):`, (err as Error).message);
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      this.exportedPins.add(bcmGpio);
      return false;
    }
  }

  public unexportPin(bcmGpio: number): boolean {
    this.exportedPins.delete(bcmGpio);
    if (!this.isLinuxHardware) {
      this.simulatedPinStates.delete(bcmGpio);
      return true;
    }

    try {
      const pinPath = path.join(this.sysfsPath, `gpio${bcmGpio}`);
      if (fs.existsSync(pinPath)) {
        fs.writeFileSync(path.join(this.sysfsPath, 'unexport'), bcmGpio.toString());
      }
      return true;
    } catch {
      return false;
    }
  }

  public readPin(bcmGpio: number): number {
    if (!this.isLinuxHardware) {
      const state = this.simulatedPinStates.get(bcmGpio);
      return state ? state.value : 0;
    }

    try {
      const valuePath = path.join(this.sysfsPath, `gpio${bcmGpio}`, 'value');
      if (fs.existsSync(valuePath)) {
        const valStr = fs.readFileSync(valuePath, 'utf8').trim();
        return parseInt(valStr, 10) || 0;
      }
    } catch {}
    return 0;
  }

  public writePin(bcmGpio: number, value: 0 | 1): boolean {
    if (!this.isLinuxHardware) {
      const state = this.simulatedPinStates.get(bcmGpio) || { direction: 'out', value: 0 };
      state.value = value;
      this.simulatedPinStates.set(bcmGpio, state);
      return true;
    }

    try {
      const valuePath = path.join(this.sysfsPath, `gpio${bcmGpio}`, 'value');
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
