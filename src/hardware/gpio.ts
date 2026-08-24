import { Gpio } from 'onoff';
import { config } from '../config/env.js';

export class GpioManager {
  private static instance: GpioManager;
  private isAccessible: boolean;
  private activePins: Map<number, Gpio> = new Map();
  private simulatedPinStates: Map<number, { direction: 'in' | 'out'; value: number }> = new Map();

  private constructor() {
    this.isAccessible = Gpio.accessible && !config.isSimulatedHardware;
    console.log(`[GpioManager] Initialized using onoff standard GPIO library in ${this.isAccessible ? 'NATIVE RASPBERRY PI HARDWARE' : 'SIMULATION/EMULATED'} mode (no gpiomem dependency)`);
  }

  public static getInstance(): GpioManager {
    if (!GpioManager.instance) {
      GpioManager.instance = new GpioManager();
    }
    return GpioManager.instance;
  }

  public isHardwareMode(): boolean {
    return this.isAccessible;
  }

  public exportPin(bcmGpio: number, direction: 'in' | 'out' = 'in'): boolean {
    if (!this.isAccessible) {
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      return true;
    }

    try {
      if (this.activePins.has(bcmGpio)) {
        const existing = this.activePins.get(bcmGpio)!;
        existing.setDirection(direction);
        return true;
      }

      const pin = new Gpio(bcmGpio, direction);
      this.activePins.set(bcmGpio, pin);
      return true;
    } catch (err) {
      console.warn(`[GpioManager] Could not open GPIO ${bcmGpio} via onoff (falling back to virtual pin):`, (err as Error).message);
      this.simulatedPinStates.set(bcmGpio, { direction, value: 0 });
      return false;
    }
  }

  public unexportPin(bcmGpio: number): boolean {
    if (!this.isAccessible) {
      this.simulatedPinStates.delete(bcmGpio);
      return true;
    }

    try {
      const pin = this.activePins.get(bcmGpio);
      if (pin) {
        pin.unexport();
        this.activePins.delete(bcmGpio);
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  public readPin(bcmGpio: number): number {
    if (!this.isAccessible) {
      const state = this.simulatedPinStates.get(bcmGpio);
      return state ? state.value : 0;
    }

    try {
      const pin = this.activePins.get(bcmGpio);
      if (pin) {
        return pin.readSync();
      }
    } catch (err) {
      // fallback
    }
    return 0;
  }

  public writePin(bcmGpio: number, value: 0 | 1): boolean {
    if (!this.isAccessible) {
      const state = this.simulatedPinStates.get(bcmGpio) || { direction: 'out', value: 0 };
      state.value = value;
      this.simulatedPinStates.set(bcmGpio, state);
      return true;
    }

    try {
      const pin = this.activePins.get(bcmGpio);
      if (pin) {
        pin.writeSync(value);
        return true;
      }
    } catch (err) {
      console.error(`[GpioManager] Write error on GPIO ${bcmGpio}:`, (err as Error).message);
    }
    return false;
  }

  public watchPin(bcmGpio: number, callback: (err: Error | null | undefined, value: number) => void): boolean {
    if (!this.isAccessible) return false;

    try {
      const pin = this.activePins.get(bcmGpio);
      if (pin) {
        pin.watch(callback);
        return true;
      }
    } catch (err) {
      console.error(`[GpioManager] Watch error on GPIO ${bcmGpio}:`, (err as Error).message);
    }
    return false;
  }

  public cleanupAll(): void {
    for (const [_, pin] of this.activePins) {
      try {
        pin.unexport();
      } catch {}
    }
    this.activePins.clear();
  }
}
