import fs from 'fs';
import path from 'path';

/**
 * Hardware Device & Sysfs Virtualization Manager
 * 
 * Provides transparent simulation for /dev/gpiomem, /dev/video0, /sys/bus/w1/devices,
 * and /sys/class/gpio on development machines and test environments so npm run dev
 * understands and mimics real Raspberry Pi hardware devices without throwing ENOENT errors.
 */
export class VirtualHardwareManager {
  private static instance: VirtualHardwareManager;
  private virtualRoot: string;
  private isPhysicalRPi: boolean;
  private w1UpdateTimer: NodeJS.Timeout | null = null;
  private currentTempMillidegrees: number = 22500;

  private constructor() {
    this.virtualRoot = path.resolve(process.cwd(), 'data', 'virtual_hardware');
    this.isPhysicalRPi = process.platform === 'linux' && fs.existsSync('/sys/bus/w1') && fs.existsSync('/dev/gpiomem');
    this.initEnvironment();
  }

  public static getInstance(): VirtualHardwareManager {
    if (!VirtualHardwareManager.instance) {
      VirtualHardwareManager.instance = new VirtualHardwareManager();
    }
    return VirtualHardwareManager.instance;
  }

  public isHardware(): boolean {
    return this.isPhysicalRPi;
  }

  public getVirtualRoot(): string {
    return this.virtualRoot;
  }

  private initEnvironment(): void {
    if (this.isPhysicalRPi) {
      console.log('[VirtualHardware] Real Raspberry Pi Linux hardware environment detected (/dev/gpiomem, /sys/bus/w1)');
      return;
    }

    console.log(`[VirtualHardware] Initializing virtual /dev and /sys device tree in: ${this.virtualRoot}`);

    try {
      // 1. Create Virtual /dev/ directory structure
      const devDir = path.join(this.virtualRoot, 'dev');
      fs.mkdirSync(devDir, { recursive: true });

      // Create /dev/gpiomem mock file
      const gpiomemMock = path.join(devDir, 'gpiomem');
      if (!fs.existsSync(gpiomemMock)) {
        fs.writeFileSync(gpiomemMock, Buffer.alloc(4096, 0));
      }

      // Create /dev/video0 mock device marker
      const video0Mock = path.join(devDir, 'video0');
      if (!fs.existsSync(video0Mock)) {
        fs.writeFileSync(video0Mock, 'V4L2 Virtual Video Device');
      }

      // 2. Create Virtual /sys/class/gpio directory structure
      const gpioDir = path.join(this.virtualRoot, 'sys', 'class', 'gpio');
      fs.mkdirSync(gpioDir, { recursive: true });
      fs.writeFileSync(path.join(gpioDir, 'export'), '');
      fs.writeFileSync(path.join(gpioDir, 'unexport'), '');

      // 3. Create Virtual 1-Wire Temperature Bus (/sys/bus/w1/devices/28-000000112233/w1_slave)
      const w1Dir = path.join(this.virtualRoot, 'sys', 'bus', 'w1', 'devices', '28-000000112233');
      fs.mkdirSync(w1Dir, { recursive: true });

      this.updateVirtualW1Slave(w1Dir);
      this.startW1BackgroundEmulation(w1Dir);

      console.log('[VirtualHardware] Virtual hardware device tree initialized successfully');
    } catch (err) {
      console.warn('[VirtualHardware] Error creating virtual hardware mock tree:', (err as Error).message);
    }
  }

  private updateVirtualW1Slave(w1Dir: string): void {
    try {
      const delta = Math.floor((Math.random() - 0.49) * 400);
      this.currentTempMillidegrees = Math.max(16000, Math.min(36000, this.currentTempMillidegrees + delta));

      // Standard Linux w1_slave format with CRC validation
      const hexCrc = Math.floor(Math.random() * 255).toString(16).padStart(2, '0');
      const w1Content = 
`72 01 4b 46 7f ff 0e 10 ${hexCrc} : crc=${hexCrc} YES
72 01 4b 46 7f ff 0e 10 ${hexCrc} t=${this.currentTempMillidegrees}\n`;

      fs.writeFileSync(path.join(w1Dir, 'w1_slave'), w1Content, 'utf8');
    } catch {}
  }

  private startW1BackgroundEmulation(w1Dir: string): void {
    if (this.w1UpdateTimer) clearInterval(this.w1UpdateTimer);
    this.w1UpdateTimer = setInterval(() => {
      this.updateVirtualW1Slave(w1Dir);
    }, 2000);
  }

  public get1WireDevicesPath(): string {
    if (fs.existsSync('/sys/bus/w1/devices')) {
      return '/sys/bus/w1/devices';
    }
    return path.join(this.virtualRoot, 'sys', 'bus', 'w1', 'devices');
  }

  public getGpioSysfsPath(): string {
    if (fs.existsSync('/sys/class/gpio')) {
      return '/sys/class/gpio';
    }
    return path.join(this.virtualRoot, 'sys', 'class', 'gpio');
  }

  public cleanup(): void {
    if (this.w1UpdateTimer) {
      clearInterval(this.w1UpdateTimer);
      this.w1UpdateTimer = null;
    }
  }
}
