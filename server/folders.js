// Listing folders so the dashboard can offer its own way of choosing one.
//
// Windows' Browse For Folder dialog is a cramped tree with no address bar: to
// reach C:\Claude\Spider Tag you unfold This PC, then the drive, then two more
// levels, and there is nowhere to paste a path. It also opens as a separate
// window that can end up behind the app. So the app browses folders itself.

import { spawn as nodeSpawn } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';

const DRIVE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Sorted the way a person reads a list: case makes no difference to the order.
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// Windows keeps its own bookkeeping at the top of every drive. Nobody starts a
// project in $Recycle.Bin, and leaving them in pushes the real folders down.
const NOISE = new Set(['system volume information', 'recovery', '$winreagent']);
const isNoise = (name) => name.startsWith('$') || NOISE.has(name.toLowerCase());

function drives(fs) {
  return DRIVE_LETTERS
    .map((letter) => `${letter}:\\`)
    .filter((root) => {
      try {
        return fs.existsSync(root);
      } catch {
        return false;
      }
    })
    .map((root) => ({ name: root.slice(0, 2), path: root }));
}

export function listFolders({ path: folder, fs = nodeFs } = {}) {
  const asked = typeof folder === 'string' ? folder.trim() : '';
  if (!asked) return { path: null, parent: null, entries: drives(fs), error: null };

  let stat;
  try {
    stat = fs.statSync(asked);
  } catch {
    return { path: asked, parent: null, entries: [], error: 'That folder does not exist.' };
  }
  if (!stat.isDirectory()) {
    return { path: asked, parent: null, entries: [], error: 'That is a file, not a folder.' };
  }

  // At the top of a drive, up leads to the list of drives rather than nowhere.
  const above = path.win32.dirname(asked);
  const parent = above === asked ? null : above;

  let entries;
  try {
    entries = fs.readdirSync(asked, { withFileTypes: true });
  } catch {
    return { path: asked, parent, entries: [], error: 'That folder cannot be opened.' };
  }

  const folders = entries
    .filter((entry) => entry.isDirectory() && !isNoise(entry.name))
    .map((entry) => ({ name: entry.name, path: path.win32.join(asked, entry.name) }))
    .sort(byName);
  return { path: asked, parent, entries: folders, error: null };
}

// Showing a folder in Explorer, which is where you go the moment you want to
// look at what an agent has actually written.
//
// Only ever a folder the dashboard already knows about — a project, a panel's
// folder, an agent's — so this is a shortcut to somewhere on screen rather
// than a way to open anything at all on the disk.
export function openFolder(folder, { spawn = nodeSpawn } = {}) {
  if (typeof folder !== 'string' || !folder.trim()) return false;
  // No shell: the path goes in as one argument, whatever is in it.
  const child = spawn('explorer.exe', [path.win32.normalize(folder.trim())], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  // Explorer outlives the dashboard; nothing here waits for it.
  child.on('error', () => {});
  child.unref?.();
  return true;
}
