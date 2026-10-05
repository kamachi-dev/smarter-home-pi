import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { config } from '../config/env.js';
import { VirtualHardwareManager } from './virtualDev.js';

export class GpioManager {
  private static instance: GpioManager;
  private isLinuxHardware: boolean;
  private hasPinctrl: boolean = false;
  private sysfsPath: string;
  private virtualHardware: VirtualHardwareManager;
  private exportedPins: Set<number> = new Set();
  private simulatedPinStates: Map<number, { direction: 'in' | 'out'; value: number }> = new Map();

  private constructor() {
    this.virtualHardware = VirtualHardwareManager.getInstance();
    this.hasPinctrl = process.platform === 'linux' && fs.existsSync('/usr/bin/pinctrl');
    this.isLinuxHardware = process.platform === 'linux' && (this.hasPinctrl || fs.existsSync('/sys/class/gpio')) && !config.isSimulatedHardware;
    this.sysfsPath = this.isLinuxHardware && fs.existsSync('/sys/class/gpio') ? '/sys/class/gpio' : this.virtualHardware.getGpioSysfsPath();
    console.log(`[GpioManager] Initialized in ${this.isLinuxHardware ? (this.hasPinctrl ? 'NATIVE RASPBERRY PI PINCTRL' : 'NATIVE LINUX SYSFS') : 'SIMULATION/EMULATED'} mode (Sysfs: ${this.sysfsPath})`);
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
    this.exportedPins.add(bcmGpio);
    this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });

    if (this.hasPinctrl) {
      try {
        const mode = direction === 'out' ? 'op' : 'ip';
        execSync(`/usr/bin/pinctrl set ${bcmGpio} ${mode}`, { stdio: 'ignore' });
        return true;
      } catch {}
    }

    try {
      const pinPath = path.join(this.sysfsPath, `gpio${bcmGpio}`);
      if (!fs.existsSync(pinPath)) {
        const exportFile = path.join(this.sysfsPath, 'export');
        if (fs.existsSync(exportFile)) {
          fs.writeFileSync(exportFile, bcmGpio.toString());
        }
        if (!fs.existsSync(pinPath)) {
          fs.mkdirSync(pinPath, { recursive: true });
        }
      }
      fs.writeFileSync(path.join(pinPath, 'direction'), direction);
      fs.writeFileSync(path.join(pinPath, 'value'), '0');
      return true;
    } catch {
      return true;
    }
  }

  public unexportPin(bcmGpio: number): boolean {
    this.exportedPins.delete(bcmGpio);
    this.simulatedPinStates.delete(bcmGpio);

    if (this.hasPinctrl) {
      try {
        execSync(`/usr/bin/pinctrl set ${bcmGpio} ip`, { stdio: 'ignore' });
        return true;
      } catch {}
    }

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
    if (this.hasPinctrl) {
      try {
        const out = execSync(`/usr/bin/pinctrl get ${bcmGpio}`, { encoding: 'utf8' }).trim();
        if (out.includes('| hi')) return 1;
        if (out.includes('| lo')) return 0;
        if (out.includes('dh')) return 1;
        if (out.includes('dl')) return 0;
      } catch {}
    }

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

    if (this.hasPinctrl) {
      try {
        const drive = value === 1 ? 'dh' : 'dl';
        execSync(`/usr/bin/pinctrl set ${bcmGpio} op ${drive}`, { stdio: 'ignore' });
        return true;
      } catch (err) {
        console.warn(`[GpioManager] pinctrl set ${bcmGpio} error:`, (err as Error).message);
      }
    }

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
