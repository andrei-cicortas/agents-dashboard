// Runs agent CLIs inside pseudo-terminals and reports what they do.

import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pty from '@lydell/node-pty';
import { findAgent, buildLaunch } from './agents-config.js';
import { createScrollback } from './scrollback.js';
import { createTitleTracker, isUsefulTitle } from './terminal-title.js';

export const RESUME_GRACE_MS = 5000;
const DEFAULT_SIZE = { cols: 120, rows: 30 };

export function commandExists(command) {
  return spawnSync('where.exe', [command], { stdio: 'ignore', windowsHide: true }).status === 0;
}

export function killTree(pid) {
  // cmd.exe starts the agent as a child, so kill the whole tree.
  spawnSync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
}

export function createAgentManager({
  agents,
  hookValues = {},
  env = process.env,
  spawn = pty.spawn,
  exists = commandExists,
  folderExists = (dir) => fs.existsSync(dir),
  kill = killTree,
  resumeGraceMs = RESUME_GRACE_MS,
  now = Date.now,
  newSessionId = () => crypto.randomUUID(),
}) {
  const emitter = new EventEmitter();
  const processes = new Map();
  const scrollbacks = new Map();
  const sizes = new Map();

  const setStatus = (panelId, status, message = null) => {
    emitter.emit('status', { panelId, status, message });
  };

  function scrollbackFor(panelId) {
    if (!scrollbacks.has(panelId)) scrollbacks.set(panelId, createScrollback());
    return scrollbacks.get(panelId);
  }

  function start(options) {
    const { panelId, agentId, cwd, sessionId, mode } = options;
    stop(panelId);
    const agent = findAgent(agents, agentId);
    if (!folderExists(cwd)) {
      setStatus(panelId, 'folder-missing', `Folder not found: ${cwd}`);
      return;
    }
    if (!exists(agent.command)) {
      setStatus(panelId, 'not-installed', agent.installHint);
      return;
    }

    const { file, commandLine } = buildLaunch(agent, mode, { ...hookValues, sessionId });
    const { cols, rows } = sizes.get(panelId) ?? DEFAULT_SIZE;
    setStatus(panelId, 'starting');
    const term = spawn(file, commandLine, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...env, AGENTS_DASHBOARD_PANEL_ID: panelId },
    });
    const entry = { term, startedAt: now(), sawOutput: false };
    const titles = createTitleTracker();
    processes.set(panelId, entry);

    term.onData((data) => {
      if (processes.get(panelId) !== entry) return;
      if (!entry.sawOutput) {
        entry.sawOutput = true;
        setStatus(panelId, 'running');
      }
      scrollbackFor(panelId).append(data);
      emitter.emit('data', { panelId, data });
      const title = titles.push(data);
      if (title !== null && isUsefulTitle(title)) emitter.emit('title', { panelId, title: title.trim() });
    });

    term.onExit(({ exitCode }) => {
      // Without kill() the pseudo-terminal keeps Node alive forever on Windows.
      try { term.kill(); } catch { /* already gone */ }
      if (processes.get(panelId) !== entry) return;
      processes.delete(panelId);
      if (mode === 'resume' && now() - entry.startedAt < resumeGraceMs) {
        const freshId = newSessionId();
        emitter.emit('session', { panelId, sessionId: freshId });
        start({ ...options, mode: 'start', sessionId: freshId });
        return;
      }
      setStatus(panelId, 'exited', `Exited with code ${exitCode}`);
    });
  }

  function write(panelId, data) {
    processes.get(panelId)?.term.write(data);
  }

  function resize(panelId, cols, rows) {
    if (cols < 2 || rows < 2) return;
    sizes.set(panelId, { cols, rows });
    const entry = processes.get(panelId);
    if (!entry) return;
    try { entry.term.resize(cols, rows); } catch { /* process is exiting */ }
  }

  function stop(panelId) {
    const entry = processes.get(panelId);
    if (!entry) return;
    processes.delete(panelId);
    kill(entry.term.pid);
    try { entry.term.kill(); } catch { /* already gone */ }
  }

  function stopAll() {
    for (const panelId of [...processes.keys()]) stop(panelId);
  }

  function forget(panelId) {
    stop(panelId);
    scrollbacks.delete(panelId);
    sizes.delete(panelId);
  }

  return {
    on: (event, handler) => { emitter.on(event, handler); },
    start,
    write,
    resize,
    stop,
    stopAll,
    forget,
    isRunning: (panelId) => processes.has(panelId),
    readScrollback: (panelId) => scrollbacks.get(panelId)?.read() ?? '',
  };
}
