import { telemetryScript } from './scripts/telemetryScript.js';
import { cameraScript } from './scripts/cameraScript.js';
import { modalScript } from './scripts/modalScript.js';

export const dashboardClientScript: string = [
  telemetryScript,
  cameraScript,
  modalScript
].join('\n\n');

