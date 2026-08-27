import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

export interface AppConfig {
  port: number;
  host: string;
  smarterHomeApiUrl: string;
  smarterHomeApiKey: string;
  smarterHomeToken: string;
  supabaseUrl: string;
  supabaseKey: string;
  syncIntervalMs: number;
  configFilePath: string;
  enrolledFacesPath: string;
  modelsPath: string;
  isSimulatedHardware: boolean;
  tapoCameraIp: string;
  tapoCameraUser: string;
  tapoCameraPassword: string;
}

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {}
}

const enrolledDir = path.resolve(dataDir, 'enrolled_faces');
if (!fs.existsSync(enrolledDir)) {
  try {
    fs.mkdirSync(enrolledDir, { recursive: true });
  } catch {}
}

const hubConfigPath = path.resolve(dataDir, 'hub.config.json');
let savedHubConfig: { token?: string; apiUrl?: string } = {};
if (fs.existsSync(hubConfigPath)) {
  try {
    savedHubConfig = JSON.parse(fs.readFileSync(hubConfigPath, 'utf8'));
  } catch {}
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  smarterHomeApiUrl: savedHubConfig.apiUrl || process.env.API_URL || process.env.SMARTER_HOME_API_URL || 'http://localhost:3000',
  smarterHomeApiKey: process.env.SMARTER_HOME_API_KEY || 'pi-secret-key-default',
  smarterHomeToken: savedHubConfig.token || process.env.SMARTER_HOME_TOKEN || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',
  syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '3000', 10),
  configFilePath: process.env.CONFIG_FILE_PATH || path.resolve(dataDir, 'sensors.config.json'),
  enrolledFacesPath: process.env.ENROLLED_FACES_PATH || path.resolve(dataDir, 'enrolled_faces.json'),
  modelsPath: process.env.MODELS_PATH || path.resolve(process.cwd(), 'models'),
  isSimulatedHardware: process.env.FORCE_SIMULATION === 'true' || process.platform !== 'linux',
  tapoCameraIp: process.env.TAPO_CAMERA_IP || '192.168.68.101',
  tapoCameraUser: process.env.TAPO_CAMERA_USER || 'CapstoneCam2',
  tapoCameraPassword: process.env.TAPO_CAMERA_PASSWORD || 'OliverSoriano',
};

export function saveHubConfig(token: string, apiUrl?: string): void {
  config.smarterHomeToken = token;
  if (apiUrl) config.smarterHomeApiUrl = apiUrl;
  try {
    fs.writeFileSync(hubConfigPath, JSON.stringify({ token: config.smarterHomeToken, apiUrl: config.smarterHomeApiUrl }, null, 2), 'utf8');
  } catch {}
}

