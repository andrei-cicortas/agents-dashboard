// Loads and saves the dashboard state (projects, panels, notifications).

import fs from 'node:fs';
import path from 'node:path';

export function emptyState() {
  return { projects: [], panels: [], notifications: [] };
}

export function createStore(filePath) {
  return {
    filePath,

    load() {
      let raw;
      try {
        raw = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return emptyState();
        throw err;
      }
      try {
        return normalize(JSON.parse(raw));
      } catch {
        // Keep the broken file for inspection instead of deleting it.
        fs.renameSync(filePath, path.join(path.dirname(filePath), 'state.corrupt.json'));
        return emptyState();
      }
    },

    save(state) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      // Write to a temp file first so a crash never leaves a half-written state.
      const tempPath = `${filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
      fs.renameSync(tempPath, filePath);
    },
  };
}

function normalize(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('State file is not an object');
  }
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    projects: list(parsed.projects),
    panels: list(parsed.panels),
    notifications: list(parsed.notifications),
  };
}
