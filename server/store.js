// Loads and saves the dashboard state (projects, panels, notifications).

import nodeFs from 'node:fs';
import path from 'node:path';

// On Windows, antivirus or the search indexer can briefly lock the state file,
// so a rename over it fails with one of these codes for a moment.
const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 5;
const RETRY_DELAY_MS = 50;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function emptyState() {
  return { projects: [], panels: [], notifications: [], layouts: {}, profiles: [], threads: [] };
}

// `fs` can be replaced in tests to simulate disk errors.
export function createStore(filePath, { fs = nodeFs } = {}) {
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

    // Never throws: save runs inside event callbacks, where an exception would
    // end the server and every agent with it. A failed save is logged instead.
    save(state) {
      // Write to a temp file first so a crash never leaves a half-written state.
      const tempPath = `${filePath}.tmp`;
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
      } catch (err) {
        console.error(`Could not save state to ${filePath}:`, err);
        return;
      }
      for (let attempt = 1; ; attempt += 1) {
        try {
          fs.renameSync(tempPath, filePath);
          return;
        } catch (err) {
          if (!RETRYABLE_CODES.has(err.code) || attempt === RENAME_ATTEMPTS) {
            console.error(`Could not save state to ${filePath}:`, err);
            return;
          }
          sleepSync(RETRY_DELAY_MS);
        }
      }
    },
  };
}

function normalize(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('State file is not an object');
  }
  const list = (value) => (Array.isArray(value) ? value : []);
  const map = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  return {
    projects: list(parsed.projects),
    panels: list(parsed.panels),
    notifications: list(parsed.notifications),
    layouts: map(parsed.layouts),
    profiles: list(parsed.profiles),
    threads: list(parsed.threads),
  };
}
