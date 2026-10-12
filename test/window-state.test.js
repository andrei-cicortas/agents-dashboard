import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromeFrom, isNotificationId, nextZoom, placeWindow, readWindowState } from '../app/window-state.js';

const primary = { x: 0, y: 0, width: 1920, height: 1040 };

test('nextZoom walks the browser steps and stops at either end', () => {
  assert.equal(nextZoom(1.0, 1), 1.1);
  assert.equal(nextZoom(1.0, -1), 0.9);
  assert.equal(nextZoom(2.0, 1), 2.0);
  assert.equal(nextZoom(0.67, -1), 0.67);
  // A zoom between steps goes to the next one along, and 0 resets.
  assert.equal(nextZoom(1.05, 1), 1.1);
  assert.equal(nextZoom(1.75, 0), 1.0);
});

test('chromeFrom takes only #rrggbb colours', () => {
  assert.deepEqual(chromeFrom({ background: '#ffffff', text: '#000000', dark: false }), { background: '#ffffff', text: '#000000', dark: false });
  assert.equal(chromeFrom({ background: 'red', text: '#000000' }), null);
  assert.equal(chromeFrom({ background: '#fff', text: '#000000' }), null);
  assert.equal(chromeFrom(null), null);
});

test('isNotificationId accepts ids and nothing else', () => {
  assert.equal(isNotificationId('n-12ab'), true);
  assert.equal(isNotificationId('../etc'), false);
  assert.equal(isNotificationId(''), false);
  assert.equal(isNotificationId(7), false);
});

test('placeWindow keeps a saved place that is still on a screen', () => {
  const saved = { x: 100, y: 80, width: 1200, height: 800 };
  assert.deepEqual(placeWindow(saved, [primary], primary), saved);
});

test('placeWindow centres the window when its screen is gone or it is too small', () => {
  const centred = { x: 160, y: 52, width: 1600, height: 936 };
  assert.deepEqual(placeWindow({ x: 3000, y: 0, width: 1200, height: 800 }, [primary], primary), centred);
  assert.deepEqual(placeWindow({ x: 0, y: 0, width: 300, height: 200 }, [primary], primary), centred);
  assert.deepEqual(placeWindow(null, [primary], primary), centred);
});

test('readWindowState reads what the old window saved and fills in the rest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'window-state-'));
  const file = path.join(dir, 'window.json');
  // Windows PowerShell wrote it with a byte order mark.
  fs.writeFileSync(file, '﻿' + JSON.stringify({
    bounds: { x: 10, y: 20, width: 1000, height: 700 },
    maximized: true,
    zoom: 1.25,
    chrome: { background: '#fafafa', text: '#111111', dark: false },
  }));
  assert.deepEqual(readWindowState(file), {
    bounds: { x: 10, y: 20, width: 1000, height: 700 },
    maximized: true,
    zoom: 1.25,
    chrome: { background: '#fafafa', text: '#111111', dark: false },
    trayHintShown: false,
  });
  fs.writeFileSync(file, '{ not json');
  assert.equal(readWindowState(file).zoom, 1.0);
  assert.equal(readWindowState(path.join(dir, 'missing.json')).bounds, null);
  fs.rmSync(dir, { recursive: true, force: true });
});
