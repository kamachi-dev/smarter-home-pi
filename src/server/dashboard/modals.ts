export {
  getSensorModalHtml,
  getPinDetailsModalHtml,
  getEnrollFaceModalHtml,
  getTokenModalHtml
} from './modals/sensorModals.js';

export {
  getRoomGpioModalHtml,
  getCreateRoomModalHtml,
  getEditRoomModalHtml
} from './modals/roomModals.js';

import {
  getSensorModalHtml,
  getPinDetailsModalHtml,
  getEnrollFaceModalHtml,
  getTokenModalHtml
} from './modals/sensorModals.js';

import {
  getRoomGpioModalHtml,
  getCreateRoomModalHtml,
  getEditRoomModalHtml
} from './modals/roomModals.js';

export function getAllModalsHtml(): string {
  return [
    getSensorModalHtml(),
    getPinDetailsModalHtml(),
    getRoomGpioModalHtml(),
    getCreateRoomModalHtml(),
    getEditRoomModalHtml(),
    getEnrollFaceModalHtml(),
    getTokenModalHtml()
  ].join('\n');
}
