export type SensorType = 'temperature' | 'camera' | 'motion' | 'light' | 'door' | 'gas' | 'relay';

export type PinCapability = 'GPIO' | 'POWER_3V3' | 'POWER_5V' | 'GROUND' | 'I2C_SDA' | 'I2C_SCL' | 'SPI_MOSI' | 'SPI_MISO' | 'SPI_SCLK' | 'SPI_CE0' | 'SPI_CE1' | 'UART_TX' | 'UART_RX' | 'PWM';

export interface AssignedSensorSummary {
  id: string;
  name: string;
  type: SensorType | string;
  bcmGpio: number;
  pinNumber: number;
  roomName?: string;
  roomId?: string;
  state?: any;
  reading?: any;
  source: 'supabase' | 'local';
}

export interface SupabaseSensorMapping {
  id: string;
  name: string;
  type: SensorType | string;
  bcmGpio: number;
  pinNumber: number;
  pinName: string;
  roomId: string;
  roomName: string;
  property: 'light_gpio' | 'temp_gpio' | 'ac_gpio' | string;
  state?: any;
  reading?: any;
  status: 'active' | 'simulated' | 'offline';
  lastUpdated?: string;
}

export interface RPiPin {
  pinNumber: number;        // Physical header pin (1 - 40)
  bcmGpio: number | null;   // BCM GPIO number (e.g. 4, 17, 27)
  name: string;             // Display name (e.g. "GPIO 4", "3.3V Power", "GND")
  capabilities: PinCapability[];
  assignedSensorId?: string; // ID of attached sensor if any
  assignedSensor?: AssignedSensorSummary; // Rich assigned sensor metadata
}

export interface SensorConfig {
  id: string;
  name: string;
  type: SensorType;
  pinNumber?: number;       // Physical pin number if GPIO-bound
  bcmGpio?: number;         // BCM GPIO number
  pollIntervalMs: number;   // Polling/sampling interval in ms
  enabled: boolean;
  options?: Record<string, any>;
}

export interface BaseReading {
  sensorId: string;
  sensorType: SensorType;
  timestamp: string;
  status: 'ok' | 'warning' | 'error';
  errorMessage?: string;
}

export interface TemperatureReading extends BaseReading {
  sensorType: 'temperature';
  temperatureC: number | null;
  temperatureF: number | null;
  humidityPct?: number | null;
}

export interface DetectedFace {
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  status: 'recognized' | 'unknown';
  person: string | null;
  confidence: number;
}

export interface FaceDetectionPayload {
  detected: boolean;                      // true if someone is detected
  status: 'recognized' | 'unknown' | 'none'; // recognition status
  person: string | null;                  // recognized name or "Unknown Person" / null
  confidence: number;                     // 0.0 to 1.0 confidence
  timestamp: string;                      // ISO timestamp
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  faces?: DetectedFace[];
}

export interface CameraReading extends BaseReading {
  sensorType: 'camera';
  faceDetection: FaceDetectionPayload;
  snapshotBase64?: string;
}

export interface RelayReading extends BaseReading {
  sensorType: 'relay';
  power: boolean;
  bcmGpio: number;
  activeLow: boolean;
  roomId?: string;
}

export type SensorReading = TemperatureReading | CameraReading | RelayReading | (BaseReading & Record<string, any>);

export interface EnrolledPerson {
  id: string;
  name: string;
  notes?: string;
  enrolledAt: string;
  descriptor?: number[]; // 128-dimensional face embedding array
  imageUrl?: string;
  accuracy?: number; // 0 to 100 percentage
  photoCount?: number;
  trainingStats?: {
    validFaces: number;
    totalPhotos: number;
    avgConfidence: number;
    consistencyScore: number;
  };
}

export interface ControllerState {
  status: 'running' | 'idle' | 'error';
  isHardware: boolean;
  version: string;
  uptimeSeconds: number;
  assignedSensors: SensorConfig[];
  pins: RPiPin[];
  lastTelemetry: Record<string, SensorReading>;
  lastFaceDetection: FaceDetectionPayload;
}

export type CameraType = 'tapo' | 'rpi' | 'none';

export interface RoomRecord {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  image_url?: string | null;
  camera_enabled?: boolean;
  camera_type?: CameraType;
  camera_ip?: string | null;
  camera_username?: string | null;
  camera_password?: string | null;
  camera_stream_url?: string | null;
  light_gpio?: number | null;
  temp_gpio?: number | null;
  ac_gpio?: number | null;
  lights_power?: boolean;
  lights_brightness?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  created_at?: string;
  updated_at?: string;
  home_id?: string | null;
}
