import { SupabaseClient } from '@supabase/supabase-js';
import { SensorRegistry } from '../sensors/registry.js';

export interface RoomCrudOptions {
  getSupabase: () => SupabaseClient | null;
  getLinkedHomeId: () => Promise<string | null>;
  registry: SensorRegistry;
  onRoomsChanged: () => Promise<any>;
}

export class RoomCrudService {
  private getSupabase: () => SupabaseClient | null;
  private getLinkedHomeId: () => Promise<string | null>;
  private registry: SensorRegistry;
  private onRoomsChanged: () => Promise<any>;

  constructor(options: RoomCrudOptions) {
    this.getSupabase = options.getSupabase;
    this.getLinkedHomeId = options.getLinkedHomeId;
    this.registry = options.registry;
    this.onRoomsChanged = options.onRoomsChanged;
  }

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
    light_controller?: string;
    temp_controller?: string;
    ac_controller?: string;
  }): Promise<any> {
    const supabase = this.getSupabase();
    if (!supabase) throw new Error('Supabase client is not connected.');

    const homeId = await this.getLinkedHomeId();
    let userId: string | null = null;
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      userId = userData.user.id;
    } else {
      const { data: existing } = await supabase.from('rooms').select('user_id').limit(1).single();
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

    const { data, error } = await supabase.from('rooms').insert(newRecord).select().single();
    if (error) {
      throw new Error(`Failed to create room in Supabase: ${error.message}`);
    }

    if (data && (roomData.light_controller || roomData.temp_controller || roomData.ac_controller)) {
      try {
        let q = supabase.from('home_states').select('value').eq('key', 'room_controllers');
        if (homeId) q = q.eq('home_id', homeId);
        const { data: ctrlData } = await q.maybeSingle();
        const currentMap = ctrlData?.value && typeof ctrlData.value === 'object' ? ctrlData.value : {};
        await supabase.from('home_states').upsert({
          home_id: homeId,
          key: 'room_controllers',
          value: {
            ...currentMap,
            [data.id]: {
              light_controller: roomData.light_controller || 'main',
              temp_controller: roomData.temp_controller || 'main',
              ac_controller: roomData.ac_controller || 'main'
            }
          },
          updated_at: new Date().toISOString()
        }, { onConflict: homeId ? 'home_id,key' : 'user_id,key' });
      } catch (_) {}
    }

    await this.onRoomsChanged();
    if (data) {
      data.camera_type = isRpi ? 'rpi' : (isNone ? 'none' : (data.camera_ip ? 'tapo' : 'none'));
    }
    return data;
  }

  public async updateRoom(roomId: string, updates: Record<string, any>): Promise<any> {
    const supabase = this.getSupabase();
    if (!supabase) throw new Error('Supabase client is not connected.');

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

    const hasControllerUpdates = updates.light_controller !== undefined || updates.temp_controller !== undefined || updates.ac_controller !== undefined;
    delete payload.light_controller;
    delete payload.temp_controller;
    delete payload.ac_controller;

    const { data, error } = await supabase.from('rooms').update(payload).eq('id', roomId).select().single();
    if (error) {
      throw new Error(`Failed to update room ${roomId} in Supabase: ${error.message}`);
    }

    if (hasControllerUpdates) {
      try {
        const homeId = await this.getLinkedHomeId();
        let q = supabase.from('home_states').select('value').eq('key', 'room_controllers');
        if (homeId) q = q.eq('home_id', homeId);
        const { data: ctrlData } = await q.maybeSingle();
        const currentMap = ctrlData?.value && typeof ctrlData.value === 'object' ? ctrlData.value : {};
        await supabase.from('home_states').upsert({
          home_id: homeId,
          key: 'room_controllers',
          value: {
            ...currentMap,
            [roomId]: {
              ...(currentMap[roomId] || {}),
              ...(updates.light_controller !== undefined ? { light_controller: updates.light_controller } : {}),
              ...(updates.temp_controller !== undefined ? { temp_controller: updates.temp_controller } : {}),
              ...(updates.ac_controller !== undefined ? { ac_controller: updates.ac_controller } : {})
            }
          },
          updated_at: new Date().toISOString()
        }, { onConflict: homeId ? 'home_id,key' : 'user_id,key' });
      } catch (_) {}
    }

    await this.onRoomsChanged();
    if (data) {
      data.camera_type = data.camera_ip === 'rpi-camera' || data.camera_stream_url?.startsWith('rpicam') ? 'rpi' : (data.camera_ip ? 'tapo' : 'none');
    }
    return data;
  }

  public async deleteRoom(roomId: string): Promise<boolean> {
    const supabase = this.getSupabase();
    if (!supabase) throw new Error('Supabase client is not connected.');

    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
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

    const { error } = await supabase.from('rooms').delete().eq('id', roomId);
    if (error) {
      throw new Error(`Failed to delete room ${roomId} from Supabase: ${error.message}`);
    }

    await this.onRoomsChanged();
    return true;
  }
}
