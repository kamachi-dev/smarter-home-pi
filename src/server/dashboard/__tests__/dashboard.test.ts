import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDashboardHtmlTemplate } from '../html.js';
import { dashboardClientScript } from '../clientScript.js';

describe('Dashboard HTML & Client Script Tests', () => {
  it('should generate valid HTML template containing dashboard scripts', () => {
    const html = getDashboardHtmlTemplate(dashboardClientScript);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('id="camera-mjpeg-stream"'));
    assert.ok(html.includes('onload="handleStreamLoad()"'));
    assert.ok(html.includes('onerror="handleStreamError(this)"'));
  });

  it('should export handleStreamLoad and handleStreamError to window', () => {
    assert.ok(dashboardClientScript.includes('window.handleStreamLoad = handleStreamLoad;'));
    assert.ok(dashboardClientScript.includes('window.handleStreamError = handleStreamError;'));
    assert.ok(dashboardClientScript.includes('window.init = init;'));
  });

  it('should compile client script without syntax errors', () => {
    // Compiling string via Function constructor
    assert.doesNotThrow(() => {
      new Function(dashboardClientScript);
    });
  });
});
