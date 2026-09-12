// Finding out which conversation a Codex panel is having.
//
// Claude Code is told its session id when it starts, so resuming is simply a
// matter of asking for the same id again. Codex picks its own and offers no way
// to choose it, and `resume --last` means the most recent conversation in that
// folder — which is the same one for every panel open on it. Two agents working
// side by side would come back sharing a conversation.
//
// So the id is read back afterwards instead. Codex records every run as a
// rollout file whose first line names the session and the folder it ran in.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sameFolder } from '../shared/status.js';

// Where Codex keeps its conversations, unless it has been told otherwise.
export const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

const ROLLOUT = /^rollout-.*\.jsonl$/;

function everyRollout(dir, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) everyRollout(full, found);
    else if (ROLLOUT.test(entry.name)) found.push(full);
  }
  return found;
}

function metaOf(file) {
  let first;
  try {
    // The metadata is the first line; the rest of the file is the conversation.
    first = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
    const payload = JSON.parse(first).payload ?? {};
    if (!payload.session_id || !payload.cwd) return null;
    return { id: payload.session_id, cwd: payload.cwd, at: fs.statSync(file).mtimeMs };
  } catch {
    // Still being written, or not a rollout after all.
    return null;
  }
}

// The oldest run in this folder that started after the panel did and has not
// been claimed by another panel. Oldest, so panels opened together claim the
// runs in the order those runs appeared.
export function findSessionId({ home = codexHome(), cwd, startedAt, taken = new Set() }) {
  const candidates = everyRollout(path.join(home, 'sessions'))
    .map(metaOf)
    .filter((meta) => meta && meta.at >= startedAt && !taken.has(meta.id) && sameFolder(meta.cwd, cwd))
    .sort((a, b) => a.at - b.at);
  return candidates[0]?.id ?? null;
}
