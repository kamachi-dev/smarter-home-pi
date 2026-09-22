import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { SupabaseSensorMapping, RPiPin, SensorConfig } from '../types/index.js';
import { getPinByBcmGpio } from '../hardware/pinout.js';
import { config } from '../config/env.js';

export interface SensorSyncOptions {
  supabase: SupabaseClient | null;
  registry: SensorRegistry;
  getLinkedHomeId: () => Promise<string | null>;
}

export class SensorSyncHandler {
  private supabase: SupabaseClient | null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;
  private lastSyncedSensors: SupabaseSensorMapping[] = [];
  private lastSyncTime: string | null = null;
  private lastSyncSuccess: boolean = false;

  constructor(options: SensorSyncOptions) {
    this.supabase = options.supabase;
    this.registry = options.registry;
    this.getLinkedHomeId = options.getLinkedHomeId;
  }

  public updateSupabaseClient(client: SupabaseClient | null) {
    this.supabase = client;
  }

  public getSupabaseSensors(): SupabaseSensorMapping[] {
    return this.lastSyncedSensors;
  }

  public getStatus() {
    return {
      supabaseConnected: this.supabase !== null && this.lastSyncSuccess,
      lastSyncTime: this.lastSyncTime,
      sensorCount: this.lastSyncedSensors.length
    };
  }

  /**
   * Connect to Supabase, query all rooms and sensor fields (light_gpio, temp_gpio, ac_gpio),
   * map them to BCM GPIO numbers and physical header pins, and synchronize with SensorRegistry.
   */
  public async syncSensorsFromSupabase(): Promise<{
    pins: RPiPin[];
    supabaseSensors: SupabaseSensorMapping[];
    supabaseConnected: boolean;
    lastSyncTime: string | null;
  }> {
    let rooms: any[] = [];
    let connected = false;

    // 1. Fetch from Supabase direct client if available
    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        let query = this.supabase.from('rooms').select('*');
        if (homeId) {
          query = query.eq('home_id', homeId);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          rooms = data;
          connected = true;
        }
      } catch (err) {
        console.warn('[SensorSyncHandler] Direct Supabase query warning:', (err as Error).message);
      }
    }

    // 2. Fallback to Smarter Home REST API if direct query returned no rooms
    if (rooms.length === 0 && config.smarterHomeApiUrl && config.smarterHomeToken && !config.smarterHomeApiUrl.includes('vercel.app')) {
      try {
        const targetUrl = `${config.smarterHomeApiUrl.replace(/\/$/, '')}/api/rooms`;
        const res = await fetch(targetUrl, {
          headers: {
            'x-pi-token': config.smarterHomeToken,
            'x-pi-api-key': config.smarterHomeApiKey
          },
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const json = (await res.json()) as any;
          if (json && Array.isArray(json.rooms)) {
            rooms = json.rooms;
            connected = true;
          }
        }
      } catch (err) {
        console.warn('[SensorSyncHandler] REST API rooms fallback warning:', (err as Error).message);
      }
    }

    this.lastSyncSuccess = connected;
    this.lastSyncTime = new Date().toISOString();

    const discoveredMappings: SupabaseSensorMapping[] = [];
    const activeSensorIds = new Set<string>();

    for (const room of rooms) {
      // A. Room Light Relay (light_gpio)
      if (room.light_gpio !== null && room.light_gpio !== undefined && room.light_gpio !== '') {
        const bcmGpio = parseInt(String(room.light_gpio), 10);
        if (!isNaN(bcmGpio)) {
          const pin = getPinByBcmGpio(bcmGpio);
          if (pin) {
            const sensorId = `sensor-relay-${bcmGpio}`;
            activeSensorIds.add(sensorId);

            discoveredMappings.push({
              id: sensorId,
              name: `${room.name} 12V Light Relay`,
              type: 'relay',
              bcmGpio,
              pinNumber: pin.pinNumber,
              pinName: pin.name,
              roomId: room.id,
              roomName: room.name,
              property: 'light_gpio',
              state: { power: Boolean(room.lights_power), brightness: room.lights_brightness ?? 100 },
              status: 'active',
              lastUpdated: room.updated_at || room.created_at
            });

            // Ensure registered in registry
            await this.ensureRegistered({
              id: sensorId,
              name: `${room.name} 12V Light Relay (GPIO ${bcmGpio})`,
              type: 'relay',
              pinNumber: pin.pinNumber,
              bcmGpio,
              pollIntervalMs: 0,
              enabled: true,
              options: {
                activeLow: true,
                roomId: room.id,
                roomName: room.name,
                source: 'supabase',
                initialPower: Boolean(room.lights_power)
              }
            });
          }
        }
      }

      // B. Room Temperature & Humidity (temp_gpio)
      if (room.temp_gpio !== null && room.temp_gpio !== undefined && room.temp_gpio !== '') {
        const bcmGpio = parseInt(String(room.temp_gpio), 10);
        if (!isNaN(bcmGpio)) {
          const pin = getPinByBcmGpio(bcmGpio);
          if (pin) {
            const sensorId = `sensor-temp-${bcmGpio}`;
            activeSensorIds.add(sensorId);

            discoveredMappings.push({
              id: sensorId,
              name: `${room.name} Temperature & Humidity (DHT22)`,
              type: 'temperature',
              bcmGpio,
              pinNumber: pin.pinNumber,
              pinName: pin.name,
              roomId: room.id,
              roomName: room.name,
              property: 'temp_gpio',
              state: { temperature: room.temperature, humidity: room.humidity },
              status: 'active',
              lastUpdated: room.updated_at || room.created_at
            });

            await this.ensureRegistered({
              id: sensorId,
              name: `${room.name} Temperature & Humidity (GPIO ${bcmGpio})`,
              type: 'temperature',
              pinNumber: pin.pinNumber,
              bcmGpio,
              pollIntervalMs: 2500,
              enabled: true,
              options: {
                model: 'DHT22',
                roomId: room.id,
                roomName: room.name,
                source: 'supabase'
              }
            });
          }
        }
      }

      // C. Room AC Power Relay (ac_gpio)
      if (room.ac_gpio !== null && room.ac_gpio !== undefined && room.ac_gpio !== '') {
        const bcmGpio = parseInt(String(room.ac_gpio), 10);
        if (!isNaN(bcmGpio)) {
          const pin = getPinByBcmGpio(bcmGpio);
          if (pin) {
            const sensorId = `sensor-ac-relay-${bcmGpio}`;
            activeSensorIds.add(sensorId);

            discoveredMappings.push({
              id: sensorId,
              name: `${room.name} AC Power Relay`,
              type: 'relay',
              bcmGpio,
              pinNumber: pin.pinNumber,
              pinName: pin.name,
              roomId: room.id,
              roomName: room.name,
              property: 'ac_gpio',
              state: { power: Boolean(room.ac_power) },
              status: 'active',
              lastUpdated: room.updated_at || room.created_at
            });

            await this.ensureRegistered({
              id: sensorId,
              name: `${room.name} AC Power Relay (GPIO ${bcmGpio})`,
              type: 'relay',
              pinNumber: pin.pinNumber,
              bcmGpio,
              pollIntervalMs: 0,
              enabled: true,
              options: {
                activeLow: true,
                isAcRelay: true,
                roomId: room.id,
                roomName: room.name,
                source: 'supabase',
                initialPower: Boolean(room.ac_power)
              }
            });
          }
        }
      }
    }

    this.lastSyncedSensors = discoveredMappings;
    const pins = this.registry.getPinsWithAssignments();

    return {
      pins,
      supabaseSensors: discoveredMappings,
      supabaseConnected: connected,
      lastSyncTime: this.lastSyncTime
    };
  }

  private async ensureRegistered(cfg: SensorConfig): Promise<void> {
    const existing = this.registry.getSensor(cfg.id);
    if (!existing) {
      try {
        await this.registry.registerSensor(cfg, true);
      } catch (err) {
        console.warn(`[SensorSyncHandler] Could not register sensor ${cfg.id}:`, (err as Error).message);
      }
    }
  }

  /**
   * Assign or reassign a room's hardware sensor to a specific GPIO pin in Supabase
   */
  public async assignRoomSensor(
    roomId: string,
    property: 'light_gpio' | 'temp_gpio' | 'ac_gpio',
    bcmGpio: number | null
  ): Promise<boolean> {
    if (!this.supabase) {
      throw new Error('Supabase client is not connected.');
    }

    const { error } = await this.supabase
      .from('rooms')
      .update({ [property]: bcmGpio, updated_at: new Date().toISOString() })
      .eq('id', roomId);

    if (error) {
      throw new Error(`Failed to update Supabase room ${roomId}: ${error.message}`);
    }

    // Immediately re-sync sensors to update hardware daemon and dashboard
    await this.syncSensorsFromSupabase();
    return true;
  }

  /**
   * Batch configure a room's hardware GPIO pin connections in Supabase
   */
  public async configureRoomSensors(
    roomId: string,
    assignments: {
      light_gpio?: number | null;
      temp_gpio?: number | null;
      ac_gpio?: number | null;
    }
  ): Promise<boolean> {
    if (!this.supabase) {
      throw new Error('Supabase client is not connected.');
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (assignments.light_gpio !== undefined) updates.light_gpio = assignments.light_gpio;
    if (assignments.temp_gpio !== undefined) updates.temp_gpio = assignments.temp_gpio;
    if (assignments.ac_gpio !== undefined) updates.ac_gpio = assignments.ac_gpio;

    const { error } = await this.supabase
      .from('rooms')
      .update(updates)
      .eq('id', roomId);

    if (error) {
      throw new Error(`Failed to configure Supabase room ${roomId}: ${error.message}`);
    }

    await this.syncSensorsFromSupabase();
    return true;
  }

  /**
   * Update room power state (e.g. lights_power or ac_power) in Supabase
   */
  public async updateRoomPower(
    roomId: string,
    field: 'lights_power' | 'ac_power',
    power: boolean
  ): Promise<void> {
    if (!this.supabase) return;
    try {
      await this.supabase
        .from('rooms')
        .update({ [field]: power, updated_at: new Date().toISOString() })
        .eq('id', roomId);
    } catch (err) {
      console.warn(`[SensorSyncHandler] Failed to update room ${roomId} power:`, (err as Error).message);
    }
  }

  /**
   * Create a new room in Supabase and optionally initialize its sensors
   */
  public async createRoom(roomData: {
    name: string;
    description?: string;
    icon?: string;
    image_url?: string;
    camera_type?: 'tapo' | 'rpi' | 'none';
    camera_ip?: string | null;
    camera_username?: string | null;
    camera_password?: string | null;
    camera_stream_url?: string | null;
    camera_enabled?: boolean;
    light_gpio?: number | null;
    temp_gpio?: number | null;
    ac_gpio?: number | null;
  }): Promise<any> {
    if (!this.supabase) throw new Error('Supabase client is not connected.');

    const homeId = await this.getLinkedHomeId();
    let userId: string | null = null;
    const { data: userData } = await this.supabase.auth.getUser();
    if (userData?.user?.id) {
      userId = userData.user.id;
    } else {
      const { data: existing } = await this.supabase.from('rooms').select('user_id').limit(1).single();
      userId = existing?.user_id || null;
    }

    const isRpi = roomData.camera_type === 'rpi' || roomData.camera_ip === 'rpi-camera';
    const isNone = roomData.camera_type === 'none';

    const newRecord: Record<string, any> = {
      name: roomData.name,
      description: roomData.description || '',
      icon: roomData.icon || 'Home',
      image_url: roomData.image_url || '/images/rooms/living-room.jpg',
      home_id: homeId,
      user_id: userId,
      camera_ip: isRpi ? 'rpi-camera' : (isNone ? null : (roomData.camera_ip || null)),
      camera_username: isRpi || isNone ? null : (roomData.camera_username || null),
      camera_password: isRpi || isNone ? null : (roomData.camera_password || null),
      camera_stream_url: isRpi ? 'rpicam://0' : (isNone ? null : (roomData.camera_stream_url || null)),
      camera_enabled: isNone ? false : (isRpi ? true : Boolean(roomData.camera_enabled || roomData.camera_ip)),
      light_gpio: roomData.light_gpio !== undefined ? roomData.light_gpio : null,
      temp_gpio: roomData.temp_gpio !== undefined ? roomData.temp_gpio : null,
      ac_gpio: roomData.ac_gpio !== undefined ? roomData.ac_gpio : null,
      temperature: null,
      humidity: null,
      lights_power: false,
      ac_power: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase.from('rooms').insert(newRecord).select().single();
    if (error) {
      throw new Error(`Failed to create room in Supabase: ${error.message}`);
    }

    await this.syncSensorsFromSupabase();
    if (data) {
      data.camera_type = isRpi ? 'rpi' : (isNone ? 'none' : (data.camera_ip ? 'tapo' : 'none'));
    }
    return data;
  }

  /**
   * Update an existing room's metadata and GPIO configurations in Supabase
   */
  public async updateRoom(roomId: string, updates: Record<string, any>): Promise<any> {
    if (!this.supabase) throw new Error('Supabase client is not connected.');

    const payload: Record<string, any> = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    delete payload.id;
    delete payload.created_at;

    if (payload.camera_type === 'rpi') {
      payload.camera_enabled = true;
      payload.camera_ip = 'rpi-camera';
      payload.camera_username = null;
      payload.camera_password = null;
      payload.camera_stream_url = payload.camera_stream_url || 'rpicam://0';
    } else if (payload.camera_type === 'none') {
      payload.camera_enabled = false;
      payload.camera_ip = null;
      payload.camera_username = null;
      payload.camera_password = null;
      payload.camera_stream_url = null;
    } else if (payload.camera_type === 'tapo') {
      payload.camera_enabled = Boolean(payload.camera_ip);
    }
    delete payload.camera_type;

    const { data, error } = await this.supabase.from('rooms').update(payload).eq('id', roomId).select().single();
    if (error) {
      throw new Error(`Failed to update room ${roomId} in Supabase: ${error.message}`);
    }

    await this.syncSensorsFromSupabase();
    if (data) {
      data.camera_type = data.camera_ip === 'rpi-camera' || data.camera_stream_url?.startsWith('rpicam') ? 'rpi' : (data.camera_ip ? 'tapo' : 'none');
    }
    return data;
  }

  /**
   * Delete a room from Supabase and release any attached hardware GPIO sensors
   */
  public async deleteRoom(roomId: string): Promise<boolean> {
    if (!this.supabase) throw new Error('Supabase client is not connected.');

    // 1. Find room to release associated GPIO sensors from registry
    const { data: room } = await this.supabase.from('rooms').select('*').eq('id', roomId).single();
    if (room) {
      if (room.light_gpio !== null && room.light_gpio !== undefined) {
        await this.registry.unregisterSensor(`sensor-relay-${room.light_gpio}`, false);
      }
      if (room.temp_gpio !== null && room.temp_gpio !== undefined) {
        await this.registry.unregisterSensor(`sensor-temp-${room.temp_gpio}`, false);
      }
      if (room.ac_gpio !== null && room.ac_gpio !== undefined) {
        await this.registry.unregisterSensor(`sensor-ac-${room.ac_gpio}`, false);
      }
    }

    // 2. Delete room from Supabase
    const { error } = await this.supabase.from('rooms').delete().eq('id', roomId);
    if (error) {
      throw new Error(`Failed to delete room ${roomId} from Supabase: ${error.message}`);
    }

    await this.syncSensorsFromSupabase();
    return true;
  }
}
