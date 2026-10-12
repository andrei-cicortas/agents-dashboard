// The parts of the app window that are plain decisions, kept apart from
// Electron so they can be tested: where the window goes, how far it zooms,
// and which of the page's requests are well formed.

import fs from 'node:fs';

export const MIN_WIDTH = 720;
export const MIN_HEIGHT = 480;

// The steps a browser zooms through.
export const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

export function nextZoom(current, step) {
  if (step > 0) return ZOOM_STEPS.find((zoom) => zoom > current + 0.001) ?? current;
  if (step < 0) return ZOOM_STEPS.findLast((zoom) => zoom < current - 0.001) ?? current;
  return 1.0;
}

export function isColour(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// The title bar colours the page asks for, or null for a message without them.
export function chromeFrom(message) {
  if (!isColour(message?.background) || !isColour(message?.text)) return null;
  return { background: message.background, text: message.text, dark: Boolean(message.dark) };
}

// Only ever an id: anything else in a notification is not passed on.
export function isNotificationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value);
}

const DEFAULT_CHROME = { background: '#0a0a0a', text: '#fafafa', dark: true };

// window.json as last saved, with anything unreadable or out of range left out.
export function readWindowState(file) {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) ?? {};
  } catch {
    // Missing or damaged: start from the defaults.
  }
  const zoom = Number(saved.zoom);
  const bounds = saved.bounds && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved.bounds[key]))
    ? { x: Math.round(saved.bounds.x), y: Math.round(saved.bounds.y), width: Math.round(saved.bounds.width), height: Math.round(saved.bounds.height) }
    : null;
  return {
    bounds,
    maximized: saved.maximized === true,
    zoom: zoom >= 0.5 && zoom <= 3 ? zoom : 1.0,
    chrome: chromeFrom(saved.chrome) ?? DEFAULT_CHROME,
    trayHintShown: saved.trayHintShown === true,
  };
}

export function writeWindowState(file, state) {
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function overlap(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

// The saved place when enough of it is still on a screen, or a window centred
// on the primary one: a screen that has since been unplugged would otherwise
// leave the window nowhere.
export function placeWindow(saved, workAreas, primary) {
  if (saved && saved.width >= MIN_WIDTH && saved.height >= MIN_HEIGHT) {
    const visible = workAreas.some((area) => {
      const shared = overlap(area, saved);
      return shared.width >= 200 && shared.height >= 100;
    });
    if (visible) return saved;
  }
  const width = Math.min(1600, Math.round(primary.width * 0.9));
  const height = Math.min(950, Math.round(primary.height * 0.9));
  return {
    x: primary.x + Math.round((primary.width - width) / 2),
    y: primary.y + Math.round((primary.height - height) / 2),
    width,
    height,
  };
}
