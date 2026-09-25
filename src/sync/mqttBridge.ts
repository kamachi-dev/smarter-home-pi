import mqtt, { MqttClient } from 'mqtt';
import { SensorRegistry } from '../sensors/registry.js';
import { config } from '../config/env.js';

export interface MqttBridgeStatus {
  connected: boolean;
  brokerUrl: string;
  subControllers: Record<string, { lastSeen: string; readingsCount: number }>;
  totalBroadcasts: number;
  lastBroadcastTime: string | null;
  lastError: string | null;
}

export class MqttBridgeService {
  private static instance: MqttBridgeService;
  private client: MqttClient | null = null;
  private registry: SensorRegistry;
  private getLinkedHomeId: () => Promise<string | null>;
  private status: MqttBridgeStatus = {
    connected: false,
    brokerUrl: config.mqttBrokerUrl || 'mqtt://localhost:1883',
    subControllers: {},
    totalBroadcasts: 0,
    lastBroadcastTime: null,
    lastError: null,
  };

  private constructor(registry: SensorRegistry, getLinkedHomeId: () => Promise<string | null>) {
    this.registry = registry;
    this.getLinkedHomeId = getLinkedHomeId;
    this.initMqtt();
  }

  public static getInstance(registry?: SensorRegistry, getLinkedHomeId?: () => Promise<string | null>): MqttBridgeService {
    if (!MqttBridgeService.instance) {
      MqttBridgeService.instance = new MqttBridgeService(
        registry || SensorRegistry.getInstance(),
        getLinkedHomeId || (async () => null)
      );
    }
    return MqttBridgeService.instance;
  }

  private initMqtt(): void {
    const brokerUrl = config.mqttBrokerUrl || 'mqtt://localhost:1883';
    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId: `smarter-pi-hub-${Math.random().toString(16).substring(2, 8)}`,
        reconnectPeriod: 3000,
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        this.status.connected = true;
        this.status.lastError = null;
        console.log(`[MqttBridge] Hub connected to Mosquitto broker: ${brokerUrl}`);

        // Subscribe to sub-controller readings: smarterhome/{homeToken}/sub/+/readings
        const subTopic = 'smarterhome/+/sub/+/readings';
        this.client?.subscribe(subTopic, (err) => {
          if (!err) {
            console.log(`[MqttBridge] Subscribed to sub-controller telemetry topic: ${subTopic}`);
          }
        });
      });

      this.client.on('message', (topic, message) => {
        try {
          const parts = topic.split('/');
          // smarterhome/{token}/sub/{deviceId}/readings
          if (parts[0] === 'smarterhome' && parts[2] === 'sub') {
            const token = parts[1];
            const deviceId = parts[3];
            const payload = JSON.parse(message.toString());

            this.status.subControllers[deviceId] = {
              lastSeen: new Date().toISOString(),
              readingsCount: Array.isArray(payload.readings) ? payload.readings.length : 1,
            };

            // Republish aggregated live telemetry for web clients
            this.broadcastSubTelemetry(token, deviceId, payload);
          }
        } catch (parseErr) {
          console.warn('[MqttBridge] Failed to parse incoming sub MQTT message:', (parseErr as Error).message);
        }
      });

      this.client.on('error', (err) => {
        this.status.connected = false;
        this.status.lastError = err.message;
      });

      this.client.on('close', () => {
        this.status.connected = false;
      });
    } catch (err) {
      this.status.connected = false;
      this.status.lastError = (err as Error).message;
    }
  }

  /**
   * Broadcast sub-controller telemetry to the client-facing topic
   */
  private broadcastSubTelemetry(token: string, deviceId: string, payload: any): void {
    if (!this.client || !this.status.connected) return;
    const clientTopic = `smarterhome/${token}/telemetry`;
    const outbound = JSON.stringify({
      source: `sub-controller:${deviceId}`,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    this.client.publish(clientTopic, outbound, { qos: 0 });
    this.status.totalBroadcasts++;
    this.status.lastBroadcastTime = new Date().toISOString();
  }

  /**
   * Broadcast local Pi sensors directly to connected web clients over MQTT
   */
  public broadcastLocalTelemetry(homeToken: string, telemetryPayload: any): void {
    if (!this.client || !this.status.connected || !homeToken) return;

    const topic = `smarterhome/${homeToken}/telemetry`;
    const outbound = JSON.stringify({
      source: 'raspberry-pi-main-hub',
      timestamp: new Date().toISOString(),
      ...telemetryPayload,
    });

    this.client.publish(topic, outbound, { qos: 0 });
    this.status.totalBroadcasts++;
    this.status.lastBroadcastTime = new Date().toISOString();
  }

  public getStatus(): MqttBridgeStatus {
    return { ...this.status };
  }
}
