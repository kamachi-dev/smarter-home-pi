import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SmarterHomeSync } from '../../sync/smarterHomeSync.js';
import { SensorRegistry } from '../../sensors/registry.js';

export const roomRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const syncGateway = SmarterHomeSync.getInstance();
  const registry = SensorRegistry.getInstance();

  // GET /api/rooms - List all rooms with synchronized state from Supabase
  server.get('/api/rooms', async (request, reply) => {
    try {
      const rooms = await syncGateway.getRooms();
      // Synchronize camera sensors in background without blocking API response
      syncGateway.syncRoomsFromSupabase().catch(() => {});
      return { rooms };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // POST /api/rooms - Create a new room in Supabase
  server.post<{
    Body: {
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
    };
  }>('/api/rooms', async (request, reply) => {
    const body = request.body;
    if (!body || !body.name || !body.name.trim()) {
      return reply.code(400).send({ error: 'Room name is required.' });
    }

    try {
      const sensorSync = syncGateway.getSensorSync();
      const room = await sensorSync.createRoom(body);
      await syncGateway.syncRoomsFromSupabase();
      const rooms = await syncGateway.getRooms();

      return {
        success: true,
        room,
        rooms,
        pins: registry.getPinsWithAssignments(),
        supabaseSensors: sensorSync.getSupabaseSensors()
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // GET /api/rooms/:id - Get a single room by ID
  server.get<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const { id } = request.params;
    const rooms = await syncGateway.getRooms();
    const room = rooms.find(r => r.id === id);
    if (!room) {
      return reply.code(404).send({ error: `Room with ID "${id}" not found.` });
    }
    return { room };
  });

  // PUT /api/rooms/:id - Update room metadata and GPIO assignments in Supabase
  server.put<{
    Params: { id: string };
    Body: Record<string, any>;
  }>('/api/rooms/:id', async (request, reply) => {
    const { id: roomId } = request.params;
    const updates = request.body || {};

    try {
      const sensorSync = syncGateway.getSensorSync();
      const room = await sensorSync.updateRoom(roomId, updates);
      await syncGateway.syncRoomsFromSupabase();
      const rooms = await syncGateway.getRooms();

      return {
        success: true,
        room,
        rooms,
        pins: registry.getPinsWithAssignments(),
        supabaseSensors: sensorSync.getSupabaseSensors()
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // DELETE /api/rooms/:id - Delete a room from Supabase and release its GPIO pins
  server.delete<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const { id: roomId } = request.params;

    try {
      const sensorSync = syncGateway.getSensorSync();
      await sensorSync.deleteRoom(roomId);
      await syncGateway.syncRoomsFromSupabase();
      const rooms = await syncGateway.getRooms();

      return {
        success: true,
        message: `Room ${roomId} deleted.`,
        rooms,
        pins: registry.getPinsWithAssignments(),
        supabaseSensors: sensorSync.getSupabaseSensors()
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // POST /api/rooms/:id/sensors - Configure hardware sensors & GPIO pins for a room
  server.post<{
    Params: { id: string };
    Body: { light_gpio?: number | null; temp_gpio?: number | null; ac_gpio?: number | null };
  }>('/api/rooms/:id/sensors', async (request, reply) => {
    const { id: roomId } = request.params;
    const { light_gpio, temp_gpio, ac_gpio } = request.body || {};
    try {
      const sensorSync = syncGateway.getSensorSync();
      await sensorSync.configureRoomSensors(roomId, { light_gpio, temp_gpio, ac_gpio });
      await syncGateway.syncRoomsFromSupabase();
      const rooms = await syncGateway.getRooms();
      return {
        success: true,
        rooms,
        pins: registry.getPinsWithAssignments(),
        supabaseSensors: sensorSync.getSupabaseSensors()
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // POST /api/pins/assign - Assign or reassign a room's hardware sensor to a GPIO pin
  server.post<{
    Body: { roomId: string; property: 'light_gpio' | 'temp_gpio' | 'ac_gpio'; bcmGpio: number | null };
  }>('/api/pins/assign', async (request, reply) => {
    const { roomId, property, bcmGpio } = request.body || {};
    if (!roomId || !property) {
      return reply.code(400).send({ error: 'roomId and property are required.' });
    }
    try {
      const sensorSync = syncGateway.getSensorSync();
      await sensorSync.assignRoomSensor(roomId, property, bcmGpio);
      return {
        success: true,
        pins: registry.getPinsWithAssignments(),
        supabaseSensors: sensorSync.getSupabaseSensors()
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
};
