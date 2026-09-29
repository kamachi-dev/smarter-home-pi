import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';
import { SupabaseSensorMapping, RPiPin, SensorConfig } from '../types/index.js';
import { getPinByBcmGpio } from '../hardware/pinout.js';
import { config } from '../config/env.js';
import { RoomCrudService } from './roomCrudService.js';

export interface SensorSyncOptions {
  supabase: SupabaseClient | null;
  registry: SensorRegistry;
  getLinkedHomeId: () => Promise<string | null>;
}

export class SensorSyncHandler {
  private supabase: SupabaseClient | null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;
  private roomCrud: RoomCrudService;
  private lastSyncedSensors: SupabaseSensorMapping[] = [];
  private lastSyncTime: string | null = null;
  private lastSyncSuccess: boolean = false;

  constructor(options: SensorSyncOptions) {
    this.supabase = options.supabase;
    this.registry = options.registry;
    this.getLinkedHomeId = options.getLinkedHomeId;
    this.roomCrud = new RoomCrudService({
      getSupabase: () => this.supabase,
      getLinkedHomeId: this.getLinkedHomeId,
      registry: this.registry,
      onRoomsChanged: () => this.syncSensorsFromSupabase()
    });
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
    if (rooms.length === 0 && config.smarterHomeApiUrl && config.smarterHomeToken && Boolean(config.smarterHomeApiUrl)) {
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

    let ctrlMap: Record<string, any> = {};
    if (this.supabase) {
      try {
        const homeId = await this.getLinkedHomeId();
        let q = this.supabase.from('home_states').select('value').eq('key', 'room_controllers');
        if (homeId) q = q.eq('home_id', homeId);
        const { data: ctrlData } = await q.maybeSingle();
        if (ctrlData?.value && typeof ctrlData.value === 'object') ctrlMap = ctrlData.value;
      } catch (_) {}
    }

    const isLocalPi = (c?: string) => !c || ['main', 'hub', 'rpi'].includes(c.toLowerCase());
    const discoveredMappings: SupabaseSensorMapping[] = [];
    const activeSensorIds = new Set<string>();

    for (const room of rooms) {
      const roomCtrl = ctrlMap[room.id] || {};
      const lightCtrl = room.light_controller || roomCtrl.light_controller || 'main';
      const tempCtrl = room.temp_controller || roomCtrl.temp_controller || 'main';
      const acCtrl = room.ac_controller || roomCtrl.ac_controller || 'main';

      // A. Room Light Relay (light_gpio)
      if (room.light_gpio !== null && room.light_gpio !== undefined && room.light_gpio !== '') {
        const bcmGpio = parseInt(String(room.light_gpio), 10);
        if (!isNaN(bcmGpio)) {
          const pin = getPinByBcmGpio(bcmGpio);
          if (pin) {
            const sensorId = `sensor-relay-${bcmGpio}`;
            const local = isLocalPi(lightCtrl);
            if (local) activeSensorIds.add(sensorId);

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
              controller: lightCtrl,
              state: { power: Boolean(room.lights_power), brightness: room.lights_brightness ?? 100 },
              status: 'active',
              lastUpdated: room.updated_at || room.created_at
            });

            if (local) {
              await this.ensureRegistered({
                id: sensorId,
                name: `${room.name} 12V Light Relay (GPIO ${bcmGpio})`,
                type: 'relay',
                pinNumber: pin.pinNumber,
                bcmGpio,
                pollIntervalMs: 0,
                enabled: true,
                options: { activeLow: true, roomId: room.id, roomName: room.name, source: 'supabase', initialPower: Boolean(room.lights_power) }
              });
            }
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
            const local = isLocalPi(tempCtrl);
            if (local) activeSensorIds.add(sensorId);

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
              controller: tempCtrl,
              state: { temperature: room.temperature, humidity: room.humidity },
              status: 'active',
              lastUpdated: room.updated_at || room.created_at
            });

            if (local) {
              await this.ensureRegistered({
                id: sensorId,
                name: `${room.name} Temperature & Humidity (GPIO ${bcmGpio})`,
                type: 'temperature',
                pinNumber: pin.pinNumber,
                bcmGpio,
                pollIntervalMs: 2500,
                enabled: true,
                options: { model: 'DHT22', roomId: room.id, roomName: room.name, source: 'supabase' }
              });
            }
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
            const local = isLocalPi(acCtrl);
            if (local) activeSensorIds.add(sensorId);

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
              controller: acCtrl,
              state: { power: Boolean(room.ac_power) },
              status: 'active',
              lastUpdated: room.updated_at || room.created_at
            });

            if (local) {
              await this.ensureRegistered({
                id: sensorId,
                name: `${room.name} AC Power Relay (GPIO ${bcmGpio})`,
                type: 'relay',
                pinNumber: pin.pinNumber,
                bcmGpio,
                pollIntervalMs: 0,
                enabled: true,
                options: { activeLow: true, isAcRelay: true, roomId: room.id, roomName: room.name, source: 'supabase', initialPower: Boolean(room.ac_power) }
              });
            }
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

  public async assignRoomSensor(
    roomId: string,
    property: 'light_gpio' | 'temp_gpio' | 'ac_gpio',
    bcmGpio: number | null,
    controller?: string
  ): Promise<boolean> {
    if (!this.supabase) throw new Error('Supabase client is not connected.');

    const { error } = await this.supabase
      .from('rooms')
      .update({ [property]: bcmGpio, updated_at: new Date().toISOString() })
      .eq('id', roomId);

    if (error) throw new Error(`Failed to update Supabase room ${roomId}: ${error.message}`);

    if (controller) {
      try {
        const homeId = await this.getLinkedHomeId();
        let q = this.supabase.from('home_states').select('value').eq('key', 'room_controllers');
        if (homeId) q = q.eq('home_id', homeId);
        const { data: ctrlData } = await q.maybeSingle();
        const currentMap = ctrlData?.value && typeof ctrlData.value === 'object' ? ctrlData.value : {};
        const ctrlProp = property === 'light_gpio' ? 'light_controller' : (property === 'temp_gpio' ? 'temp_controller' : 'ac_controller');
        await this.supabase.from('home_states').upsert({
          home_id: homeId,
          key: 'room_controllers',
          value: { ...currentMap, [roomId]: { ...(currentMap[roomId] || {}), [ctrlProp]: controller } },
          updated_at: new Date().toISOString()
        }, { onConflict: homeId ? 'home_id,key' : 'user_id,key' });
      } catch (_) {}
    }

    await this.syncSensorsFromSupabase();
    return true;
  }

  public async configureRoomSensors(
    roomId: string,
    assignments: {
      light_gpio?: number | null;
      temp_gpio?: number | null;
      ac_gpio?: number | null;
      light_controller?: string;
      temp_controller?: string;
      ac_controller?: string;
    }
  ): Promise<boolean> {
    if (!this.supabase) throw new Error('Supabase client is not connected.');

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (assignments.light_gpio !== undefined) updates.light_gpio = assignments.light_gpio;
    if (assignments.temp_gpio !== undefined) updates.temp_gpio = assignments.temp_gpio;
    if (assignments.ac_gpio !== undefined) updates.ac_gpio = assignments.ac_gpio;

    const { error } = await this.supabase.from('rooms').update(updates).eq('id', roomId);
    if (error) throw new Error(`Failed to configure Supabase room ${roomId}: ${error.message}`);

    const hasCtrl = assignments.light_controller !== undefined || assignments.temp_controller !== undefined || assignments.ac_controller !== undefined;
    if (hasCtrl) {
      try {
        const homeId = await this.getLinkedHomeId();
        let q = this.supabase.from('home_states').select('value').eq('key', 'room_controllers');
        if (homeId) q = q.eq('home_id', homeId);
        const { data: ctrlData } = await q.maybeSingle();
        const currentMap = ctrlData?.value && typeof ctrlData.value === 'object' ? ctrlData.value : {};
        await this.supabase.from('home_states').upsert({
          home_id: homeId,
          key: 'room_controllers',
          value: {
            ...currentMap,
            [roomId]: {
              ...(currentMap[roomId] || {}),
              ...(assignments.light_controller ? { light_controller: assignments.light_controller } : {}),
              ...(assignments.temp_controller ? { temp_controller: assignments.temp_controller } : {}),
              ...(assignments.ac_controller ? { ac_controller: assignments.ac_controller } : {})
            }
          },
          updated_at: new Date().toISOString()
        }, { onConflict: homeId ? 'home_id,key' : 'user_id,key' });
      } catch (_) {}
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

  public async createRoom(roomData: any): Promise<any> {
    return this.roomCrud.createRoom(roomData);
  }

  public async updateRoom(roomId: string, updates: Record<string, any>): Promise<any> {
    return this.roomCrud.updateRoom(roomId, updates);
  }

  public async deleteRoom(roomId: string): Promise<boolean> {
    return this.roomCrud.deleteRoom(roomId);
  }
}
