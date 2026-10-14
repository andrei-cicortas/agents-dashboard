// Runs agent CLIs inside pseudo-terminals and reports what they do.

import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pty from '@lydell/node-pty';
import { findAgent, buildLaunch } from './agents-config.js';
import { createScrollback } from './scrollback.js';
import { createTitleTracker, isUsefulTitle } from './terminal-title.js';
import { looksTyped } from '../shared/input.js';
import { findSessionId as findCodexSession, sessionExists as codexSessionExists } from './codex-sessions.js';

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
  newSessionId = () => crypto.randomUUID(),
  // How an agent that names its own session is asked which one it opened, and
  // how often. Codex writes the answer out only once the conversation really
  // starts, which can be a while if it is waiting to be trusted.
  findSessionId = findCodexSession,
  hasSession = codexSessionExists,
  discoverEveryMs = 1000,
  discoverForMs = 120_000,
}) {
  const emitter = new EventEmitter();
  const processes = new Map();
  const scrollbacks = new Map();
  const sizes = new Map();
  // Sessions already claimed by a panel, so two panels on one folder cannot end
  // up pointing at the same conversation.
  const claimed = new Map();

  const setStatus = (panelId, status, message = null) => {
    emitter.emit('status', { panelId, status, message });
  };

  function scrollbackFor(panelId) {
    if (!scrollbacks.has(panelId)) scrollbacks.set(panelId, createScrollback());
    return scrollbacks.get(panelId);
  }

  // Waits for an agent that names its own session to write down which one it
  // opened, then tells whoever is listening so the panel can resume it later.
  function discoverSession(panelId, entry, cwd) {
    const startedAt = Date.now();
    const deadline = startedAt + discoverForMs;
    entry.timer = setInterval(() => {
      if (processes.get(panelId) !== entry) return stopDiscovering(entry);
      let found = null;
      try {
        found = findSessionId({ cwd, startedAt, taken: new Set(claimed.values()) });
      } catch {
        // Nothing to resume is better than an agent that will not start.
        found = null;
      }
      if (found) {
        claimed.set(panelId, found);
        stopDiscovering(entry);
        emitter.emit('session', { panelId, sessionId: found, reason: 'discovered' });
      } else if (Date.now() > deadline) {
        stopDiscovering(entry);
      }
    }, discoverEveryMs);
    // Waiting for this must never be the reason the server stays alive.
    entry.timer.unref?.();
  }

  function stopDiscovering(entry) {
    if (!entry.timer) return;
    clearInterval(entry.timer);
    entry.timer = null;
  }

  function sessionKnown(id) {
    try {
      return hasSession({ id });
    } catch {
      // Unsure is not the same as gone: let the agent decide.
      return true;
    }
  }

  function start(options) {
    const { panelId, agentId, cwd } = options;
    let { sessionId, mode } = options;
    stop(panelId);
    const agent = findAgent(agents, agentId);
    if (mode === 'resume' && agent.sessionSource === 'codex' && !sessionKnown(sessionId)) {
      // Nothing to resume: start a new one, and read its id back as usual.
      emitter.emit('session', { panelId, sessionId: null, reason: 'restarted' });
      mode = 'start';
      sessionId = null;
    }
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
    const entry = { term, sawOutput: false, sawInput: false, timer: null };
    const titles = createTitleTracker();
    processes.set(panelId, entry);
    if (agent.sessionSource === 'codex' && !sessionId) discoverSession(panelId, entry, cwd);

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
      // A resume can fail long after it started — the agent prints its notices
      // first, and only then says it has no such conversation. What separates
      // that from quitting on purpose is not how long it took but whether you
      // ever typed into it, so that is what decides whether to start it fresh.
      if (mode === 'resume' && !entry.sawInput) {
        // An agent that names its own session is left to name the new one too,
        // and it is read back as on any first start.
        const freshId = agent.sessionSource ? null : newSessionId();
        emitter.emit('session', { panelId, sessionId: freshId, reason: 'restarted' });
        // This runs inside a pseudo-terminal callback: a throw here would end
        // the server, so report it on the panel instead.
        try {
          start({ ...options, mode: 'start', sessionId: freshId });
        } catch (err) {
          setStatus(panelId, 'exited', err.message);
        }
        return;
      }
      setStatus(panelId, 'exited', `Exited with code ${exitCode}`);
    });
  }

  function write(panelId, data) {
    const entry = processes.get(panelId);
    if (!entry) return;
    // The terminal answers the agent's startup questions on its own; only a
    // person at the keyboard makes this panel one that was used.
    if (looksTyped(data)) entry.sawInput = true;
    entry.term.write(data);
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
