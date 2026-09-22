import { telemetryScript } from './scripts/telemetryScript.js';
import { pinHeaderScript } from './scripts/pinHeaderScript.js';
import { cameraScript } from './scripts/cameraScript.js';
import { modalScript } from './scripts/modalScript.js';
import { roomCrudScript } from './scripts/roomCrudScript.js';

export const dashboardClientScript: string = [
  telemetryScript,
  pinHeaderScript,
  cameraScript,
  modalScript,
  roomCrudScript
].join('\n\n');

