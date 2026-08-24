import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

export interface AppConfig {
  port: number;
  host: string;
  smarterHomeApiUrl: string;
  smarterHomeApiKey: string;
  supabaseUrl: string;
  supabaseKey: string;
  syncIntervalMs: number;
  configFilePath: string;
  enrolledFacesPath: string;
  modelsPath: string;
  isSimulatedHardware: boolean;
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

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  smarterHomeApiUrl: process.env.API_URL || process.env.SMARTER_HOME_API_URL || 'http://localhost:3000',
  smarterHomeApiKey: process.env.SMARTER_HOME_API_KEY || 'pi-secret-key-default',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',
  syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '3000', 10),
  configFilePath: process.env.CONFIG_FILE_PATH || path.resolve(dataDir, 'sensors.config.json'),
  enrolledFacesPath: process.env.ENROLLED_FACES_PATH || path.resolve(dataDir, 'enrolled_faces.json'),
  modelsPath: process.env.MODELS_PATH || path.resolve(process.cwd(), 'models'),
  isSimulatedHardware: process.env.FORCE_SIMULATION === 'true' || process.platform !== 'linux',
};
