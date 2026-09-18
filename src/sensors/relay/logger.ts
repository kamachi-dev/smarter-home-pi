export interface LightLogEntry {
  id: string;
  timestamp: string;
  timeStr: string;
  room: string;
  gpio: number;
  action: 'ON' | 'OFF';
  source: 'realtime_supabase' | 'local_api' | 'manual';
  message: string;
}

class LightLogManager {
  private static instance: LightLogManager;
  private logs: LightLogEntry[] = [];
  private readonly maxLogs: number = 100;

  private constructor() {}

  public static getInstance(): LightLogManager {
    if (!LightLogManager.instance) {
      LightLogManager.instance = new LightLogManager();
    }
    return LightLogManager.instance;
  }

  public record(
    room: string,
    gpio: number,
    action: 'ON' | 'OFF',
    source: 'realtime_supabase' | 'local_api' | 'manual' = 'realtime_supabase'
  ): LightLogEntry {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const iso = now.toISOString();

    const entry: LightLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: iso,
      timeStr,
      room,
      gpio,
      action,
      source,
      message: `[LIGHT] [${timeStr}] ?? "${room}" (GPIO ${gpio}) turned ${action} via ${source}`
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // High visibility console output on Raspberry Pi terminal / daemon logs
    const actionColor = action === 'ON' ? '\x1b[33m\x1b[1m' : '\x1b[90m\x1b[1m';
    const reset = '\x1b[0m';
    console.log(
      `[${timeStr}] ? [LIGHT SWITCH] Room: "${room}" | Pin: GPIO ${gpio} | State: ${actionColor}${action}${reset} | Source: ${source}`
    );

    return entry;
  }

  public getLogs(): LightLogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
  }
}

export const lightLogger = LightLogManager.getInstance();
