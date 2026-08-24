import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { VirtualHardwareManager } from './virtualDev.js';

export class GpioManager {
  private static instance: GpioManager;
  private isLinuxHardware: boolean;
  private sysfsPath: string;
  private virtualHardware: VirtualHardwareManager;
  private exportedPins: Set<number> = new Set();
  private simulatedPinStates: Map<number, { direction: 'in' | 'out'; value: number }> = new Map();

  private constructor() {
    this.virtualHardware = VirtualHardwareManager.getInstance();
    this.sysfsPath = this.virtualHardware.getGpioSysfsPath();
    this.isLinuxHardware = process.platform === 'linux' && fs.existsSync('/sys/class/gpio') && !config.isSimulatedHardware;
    console.log(`[GpioManager] Initialized in ${this.isLinuxHardware ? 'NATIVE LINUX HARDWARE' : 'SIMULATION/EMULATED'} mode (Sysfs: ${this.sysfsPath})`);
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
    try {
      const pinPath = path.join(this.sysfsPath, `gpio${bcmGpio}`);
      if (!fs.existsSync(pinPath)) {
        fs.mkdirSync(pinPath, { recursive: true });
        const exportFile = path.join(this.sysfsPath, 'export');
        if (fs.existsSync(exportFile)) {
          fs.writeFileSync(exportFile, bcmGpio.toString());
        }
      }
      fs.writeFileSync(path.join(pinPath, 'direction'), direction);
      fs.writeFileSync(path.join(pinPath, 'value'), '0');
      this.exportedPins.add(bcmGpio);
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      return true;
    } catch (err) {
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      this.exportedPins.add(bcmGpio);
      return true;
    }
  }

  public unexportPin(bcmGpio: number): boolean {
    this.exportedPins.delete(bcmGpio);
    this.simulatedPinStates.delete(bcmGpio);

    try {
      const unexportFile = path.join(this.sysfsPath, 'unexport');
      if (fs.existsSync(unexportFile)) {
        fs.writeFileSync(unexportFile, bcmGpio.toString());
      }
      return true;
    } catch {
      return false;
    }
  }

  public readPin(bcmGpio: number): number {
    try {
      const valuePath = path.join(this.sysfsPath, `gpio${bcmGpio}`, 'value');
      if (fs.existsSync(valuePath)) {
        const valStr = fs.readFileSync(valuePath, 'utf8').trim();
        return parseInt(valStr, 10) || 0;
      }
    } catch {}

    const state = this.simulatedPinStates.get(bcmGpio);
    return state ? state.value : 0;
  }

  public writePin(bcmGpio: number, value: 0 | 1): boolean {
    const state = this.simulatedPinStates.get(bcmGpio) || { direction: 'out', value: 0 };
    state.value = value;
    this.simulatedPinStates.set(bcmGpio, state);

    try {
      const valuePath = path.join(this.sysfsPath, `gpio${bcmGpio}`, 'value');
      if (fs.existsSync(valuePath)) {
        fs.writeFileSync(valuePath, value.toString());
        return true;
      }
    } catch {}

    return true;
  }

  public cleanupAll(): void {
    for (const pin of Array.from(this.exportedPins)) {
      this.unexportPin(pin);
    }
    this.exportedPins.clear();
  }
}
