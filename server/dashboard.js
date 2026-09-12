// Owns the dashboard state and reacts to UI messages, agent events, and hooks.
// It has no network code: server/index.js passes messages in and sends out
// whatever this module broadcasts.

import crypto from 'node:crypto';
import path from 'node:path';
import { addNotification, markRead, markAllRead, unreadCount, removeForPanel } from './notifications.js';
import { insert, reconcile } from '../shared/tiling.js';

const HOOK_EVENTS = new Set(['finished', 'needs-input']);

// xterm.js reports terminal focus/blur as \x1b[I / \x1b[O when the pty has
// asked for focus tracking (DECSET 1004). These arrive through the same
// panel:input channel as real keystrokes, but a click elsewhere in the app
// (not typing into the panel) must not clear the "needs your input" dot.
const FOCUS_REPORT = /^(?:\x1b\[[IO])+$/;
const isFocusReport = (data) => FOCUS_REPORT.test(data);

function samePath(a, b) {
  return path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();
}

export function createDashboard({
  store,
  agentManager,
  agents,
  pickFolder,
  broadcast,
  requestStop = () => {},
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  newSessionId = () => crypto.randomUUID(),
}) {
  let projects = [];
  let panels = [];
  let notifications = [];
  // Tiling layout per workspace path; the UI owns its shape, the server only
  // keeps it so it survives closing the window.
  let layouts = {};
  // Guards against a second folder-picker process spawning while one is
  // already open (each extra click otherwise stacks another hidden dialog).
  let addingProject = false;
  // Panel each connected window reports as focused (clientId -> panelId).
  // A window that is hidden, unfocused, or closed has no entry.
  const focusByClient = new Map();

  const agentName = (agentId) => agents.find((agent) => agent.id === agentId)?.name ?? agentId;
  const findPanel = (panelId) => panels.find((panel) => panel.id === panelId);
  const panelsOfFolder = (cwd) => panels.filter((panel) => samePath(panel.cwd, cwd));

  // Layouts are keyed by the path first used for that folder; reuse that key
  // rather than adding a second one that differs only in case or slashes.
  const layoutKey = (cwd) => Object.keys(layouts).find((key) => samePath(key, cwd)) ?? cwd;
  const layoutOf = (cwd) => layouts[layoutKey(cwd)] ?? null;

  // Placing a panel on the canvas belongs here rather than in a window: two
  // windows watching the same workspace would otherwise each decide where a
  // new panel goes, and the slower one would undo the other.
  function reconcileLayouts() {
    const next = {};
    const folders = [];
    for (const panel of panels) {
      if (!folders.some((cwd) => samePath(cwd, panel.cwd))) folders.push(panel.cwd);
    }
    for (const cwd of folders) {
      const tree = reconcile(layoutOf(cwd), panelsOfFolder(cwd).map((panel) => panel.id));
      if (tree) next[layoutKey(cwd)] = tree;
    }
    layouts = next;
  }

  function state() {
    return {
      type: 'state',
      agents: agents.map(({ id, name }) => ({ id, name })),
      projects,
      panels: panels.map((panel) => ({ ...panel, agentName: agentName(panel.agentId) })),
      notifications,
      layouts,
      unread: unreadCount(notifications),
    };
  }

  function save() {
    store.save({
      projects,
      panels: panels.map(({ id, agentId, cwd, sessionId, title }) => ({ id, agentId, cwd, sessionId, title })),
      notifications,
      layouts,
    });
  }

  const publish = () => broadcast(state());
  const commit = () => {
    save();
    publish();
  };

  function launch(panel, mode) {
    try {
      agentManager.start({ panelId: panel.id, agentId: panel.agentId, cwd: panel.cwd, sessionId: panel.sessionId, mode });
    } catch (err) {
      panel.status = 'exited';
      panel.message = err.message;
      publish();
    }
  }

  agentManager.on('status', ({ panelId, status, message }) => {
    const panel = findPanel(panelId);
    if (!panel) return;
    panel.status = status;
    panel.message = message;
    if (status !== 'running' && status !== 'starting') panel.attention = false;
    publish();
  });

  agentManager.on('data', ({ panelId, data }) => {
    broadcast({ type: 'panel:data', panelId, data });
  });

  agentManager.on('title', ({ panelId, title }) => {
    const panel = findPanel(panelId);
    if (!panel || panel.title === title) return;
    panel.title = title;
    commit();
  });

  agentManager.on('session', ({ panelId, sessionId }) => {
    const panel = findPanel(panelId);
    if (!panel) return;
    panel.sessionId = sessionId;
    save();
  });

  function start() {
    const saved = store.load();
    projects = saved.projects;
    notifications = saved.notifications;
    layouts = saved.layouts ?? {};
    panels = saved.panels.map((panel) => ({ ...panel, status: 'starting', message: null, attention: false }));
    reconcileLayouts();
    panels.forEach((panel) => launch(panel, 'resume'));
    publish();
  }

  const handlers = {
    hello(_message, reply) {
      reply(state());
      for (const panel of panels) {
        reply({ type: 'panel:replay', panelId: panel.id, data: agentManager.readScrollback(panel.id) });
      }
    },

    async 'project:add'() {
      if (addingProject) return;
      addingProject = true;
      try {
        const picked = await pickFolder();
        if (!picked || projects.some((project) => samePath(project.path, picked))) return;
        projects = [...projects, { path: picked, name: path.win32.basename(picked) || picked, pinned: false }];
        commit();
      } finally {
        addingProject = false;
      }
    },

    'project:remove'({ path: projectPath }) {
      if (panels.some((panel) => samePath(panel.cwd, projectPath))) return;
      projects = projects.filter((project) => !samePath(project.path, projectPath));
      layouts = Object.fromEntries(Object.entries(layouts).filter(([key]) => !samePath(key, projectPath)));
      commit();
    },

    'project:pin'({ path: projectPath, pinned }) {
      projects = projects.map((project) => (samePath(project.path, projectPath) ? { ...project, pinned: Boolean(pinned) } : project));
      commit();
    },

    'panel:create'({ agentId, cwd, nextTo, direction }) {
      if (!agents.some((agent) => agent.id === agentId) || typeof cwd !== 'string') return;
      // A window may ask for the new panel to split one that is already there.
      const beside = panelsOfFolder(cwd).some((panel) => panel.id === nextTo) ? nextTo : null;
      const along = direction === 'column' ? 'column' : 'row';
      const panel = {
        id: newId(),
        agentId,
        cwd,
        sessionId: newSessionId(),
        title: null,
        status: 'starting',
        message: null,
        attention: false,
      };
      panels = [...panels, panel];
      layouts = { ...layouts, [layoutKey(cwd)]: insert(layoutOf(cwd), panel.id, { nextTo: beside, direction: along }) };
      commit();
      launch(panel, 'start');
    },

    'panel:close'({ panelId }) {
      if (!findPanel(panelId)) return;
      agentManager.forget(panelId);
      panels = panels.filter((panel) => panel.id !== panelId);
      notifications = removeForPanel(notifications, panelId);
      for (const [clientId, focused] of focusByClient) {
        if (focused === panelId) focusByClient.delete(clientId);
      }
      reconcileLayouts();
      commit();
    },

    'panel:restart'({ panelId }) {
      const panel = findPanel(panelId);
      if (!panel) return;
      Object.assign(panel, { sessionId: newSessionId(), title: null, status: 'starting', message: null, attention: false });
      commit();
      launch(panel, 'start');
    },

    'panel:input'({ panelId, data }) {
      const panel = findPanel(panelId);
      if (!panel || typeof data !== 'string') return;
      agentManager.write(panelId, data);
      if (panel.attention && !isFocusReport(data)) {
        panel.attention = false;
        publish();
      }
    },

    'panel:resize'({ panelId, cols, rows }) {
      if (!findPanel(panelId) || !Number.isInteger(cols) || !Number.isInteger(rows)) return;
      agentManager.resize(panelId, cols, rows);
    },

    'panel:focus'({ panelId }, _reply, clientId) {
      if (findPanel(panelId)) focusByClient.set(clientId, panelId);
      else focusByClient.delete(clientId);
    },

    'layout:set'({ path: workspacePath, layout }) {
      if (typeof workspacePath !== 'string') return;
      const usable = layout === null || (typeof layout === 'object' && !Array.isArray(layout));
      if (!usable) return;
      const rest = Object.entries(layouts).filter(([key]) => !samePath(key, workspacePath));
      layouts = Object.fromEntries(layout === null ? rest : [...rest, [workspacePath, layout]]);
      commit();
    },

    'notifications:read'({ id, all }) {
      notifications = all ? markAllRead(notifications) : markRead(notifications, id);
      commit();
    },

    'server:stop'() {
      requestStop();
    },
  };

  // clientId identifies the window (WebSocket connection) the message came from.
  async function handleMessage(message, reply, clientId) {
    const handler = message && Object.hasOwn(handlers, message.type) ? handlers[message.type] : null;
    if (handler) await handler(message, reply, clientId);
  }

  function disconnect(clientId) {
    focusByClient.delete(clientId);
  }

  function handleHook({ panelId, event }) {
    const panel = findPanel(panelId);
    if (!panel || !HOOK_EVENTS.has(event)) return false;
    if (event === 'needs-input') panel.attention = true;
    notifications = addNotification(notifications, {
      id: newId(),
      panelId,
      event,
      at: now().toISOString(),
      // Read only if someone is looking at that panel right now.
      read: [...focusByClient.values()].includes(panelId),
    });
    commit();
    return true;
  }

  function shutdown() {
    agentManager.stopAll();
    save();
  }

  return { start, handleMessage, handleHook, disconnect, shutdown, state };
}
