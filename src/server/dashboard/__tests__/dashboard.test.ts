import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDashboardHtmlTemplate } from '../html.js';
import { dashboardClientScript } from '../clientScript.js';

describe('Dashboard HTML & Client Script Tests', () => {
  it('should generate valid HTML template containing dashboard scripts', () => {
    const html = getDashboardHtmlTemplate(dashboardClientScript);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('id="rooms-camera-grid"'));
    assert.ok(html.includes('id="det-detected"'));
    assert.ok(html.includes('id="det-person"'));
  });

  it('should export handleStreamLoad and handleStreamError to window', () => {
    assert.ok(dashboardClientScript.includes('window.handleStreamLoad = handleStreamLoad;'));
    assert.ok(dashboardClientScript.includes('window.handleStreamError = handleStreamError;'));
    assert.ok(dashboardClientScript.includes('window.init = init;'));
  });

  it('should include room GPIO and CRUD modals with interchangeable camera dropdowns and RPi header container', () => {
    const html = getDashboardHtmlTemplate(dashboardClientScript);
    assert.ok(html.includes('id="room-gpio-modal"'), 'Should contain room GPIO modal');
    assert.ok(html.includes('id="create-room-modal"'), 'Should contain create room modal');
    assert.ok(html.includes('id="edit-room-modal"'), 'Should contain edit room modal');
    assert.ok(html.includes('id="create-room-cam-type"'), 'Should contain create room camera dropdown');
    assert.ok(html.includes('id="edit-room-cam-type"'), 'Should contain edit room camera dropdown');
    assert.ok(html.includes('id="create-cam-tapo-fields"'), 'Should contain Tapo camera credentials container');
    assert.ok(html.includes('id="create-cam-rpi-fields"'), 'Should contain Raspberry Pi camera container');
    assert.ok(html.includes('id="pin-header-container"'), 'Should contain pin header container');
    assert.ok(html.includes('id="supabase-sensors-list"'), 'Should contain Supabase sensors list');
  });

  it('should export room GPIO, camera switch, and sensor management functions to window', () => {
    assert.ok(dashboardClientScript.includes('window.openRoomGpioModal = openRoomGpioModal;'));
    assert.ok(dashboardClientScript.includes('window.closeRoomGpioModal = closeRoomGpioModal;'));
    assert.ok(dashboardClientScript.includes('window.handleSaveRoomGpio = handleSaveRoomGpio;'));
    assert.ok(dashboardClientScript.includes('window.syncPinsWithSupabase = syncPinsWithSupabase;'));
    assert.ok(dashboardClientScript.includes('window.toggleRoomLight = toggleRoomLight;'));
    assert.ok(dashboardClientScript.includes('window.openCreateRoomModal = openCreateRoomModal;'));
    assert.ok(dashboardClientScript.includes('window.openEditRoomModal = openEditRoomModal;'));
    assert.ok(dashboardClientScript.includes('window.handleDeleteRoom = handleDeleteRoom;'));
    assert.ok(dashboardClientScript.includes('window.handleCamTypeChange = handleCamTypeChange;'));
    assert.ok(dashboardClientScript.includes('window.handleTapoCredentialsInput = handleTapoCredentialsInput;'));
  });

  it('should strictly have no hardcoded placeholders in telemetry room rendering or ambient hero cards', () => {
    const html = getDashboardHtmlTemplate(dashboardClientScript);
    assert.ok(html.includes('id="temp-val" class="text-4xl font-extrabold text-white font-mono">--</span>'), 'Ambient temp initial state must be placeholder-free (--)');
    assert.ok(html.includes('id="hum-val" class="text-4xl font-extrabold text-white font-mono">--</span>'), 'Ambient humidity initial state must be placeholder-free (--)');
    assert.ok(!html.includes('22.5'), 'HTML must not have hardcoded 22.5°C placeholder');
    assert.ok(!html.includes('72.5 °F'), 'HTML must not have hardcoded 72.5°F placeholder');
    assert.ok(!html.includes('50.0'), 'HTML must not have hardcoded 50.0% placeholder');
    assert.ok(!dashboardClientScript.includes('22.0'), 'Should not contain hardcoded 22.0 degC placeholder');
    assert.ok(!dashboardClientScript.includes('45%'), 'Should not contain hardcoded 45% humidity placeholder');
    assert.ok(dashboardClientScript.includes('tempRoom.temp_gpio'), 'Script must link ambient cards to Supabase room temp_gpio');
  });

  it('should compile client script without syntax errors', () => {
    // Compiling string via Function constructor
    assert.doesNotThrow(() => {
      new Function(dashboardClientScript);
    });
  });
});
