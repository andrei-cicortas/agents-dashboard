// Owns the dashboard state and reacts to UI messages, agent events, and hooks.
// It has no network code: server/index.js passes messages in and sends out
// whatever this module broadcasts.

import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { addNotification, markRead, markAllRead, unreadCount, removeForPanel } from './notifications.js';
import { insert, reconcile } from '../shared/tiling.js';
import { webAddress } from '../shared/address.js';
import { applyEvent, emptyTranscript } from '../shared/transcript.js';
import { looksTyped } from '../shared/input.js';

const HOOK_EVENTS = new Set(['finished', 'needs-input']);

// xterm.js reports terminal focus/blur as \x1b[I / \x1b[O when the pty has
// asked for focus tracking (DECSET 1004). These arrive through the same
// panel:input channel as real keystrokes, but a click elsewhere in the app
// (not typing into the panel) must not clear the "needs your input" dot.

const isBrowser = (panel) => panel.kind === 'browser';

function samePath(a, b) {
  return path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();
}

export function createDashboard({
  store,
  agentManager,
  agentRunner = null,
  agents,
  pickFolder,
  broadcast,
  requestStop = () => {},
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  newSessionId = () => crypto.randomUUID(),
  // Whoever is signed in to this PC; the sidebar shows it where a hosted app
  // would show an account.
  userName = os.userInfo().username,
}) {
  let projects = [];
  let panels = [];
  let notifications = [];
  // Tiling layout per workspace path; the UI owns its shape, the server only
  // keeps it so it survives closing the window.
  let layouts = {};
  // Agent mode. A profile is a named agent — a name, a folder and standing
  // instructions; a thread is one conversation with it, which is a session of
  // the Claude CLI continued by its id. Runs in progress are not saved: a run
  // dies with the server, so it is deliberately kept out of the state file.
  let profiles = [];
  let threads = [];
  const runsByThread = new Map();

  // Guards against a second folder-picker process spawning while one is
  // already open (each extra click otherwise stacks another hidden dialog).
  let addingProject = false;
  // Panel each connected window reports as focused (clientId -> panelId).
  // A window that is hidden, unfocused, or closed has no entry.
  const focusByClient = new Map();

  const agentName = (agentId) => agents.find((agent) => agent.id === agentId)?.name ?? agentId;
  const findProfile = (profileId) => profiles.find((profile) => profile.id === profileId);
  const findThread = (threadId) => threads.find((thread) => thread.id === threadId);
  // Enough colours to tell a rail of agents apart at a glance; past the end it
  // starts over rather than inventing something unreadable.
  const PROFILE_COLOURS = ['#f97362', '#5c8fff', '#22c55e', '#eab308', '#a855f7', '#06b6d4'];
  const TITLE_LENGTH = 60;
  const threadTitle = (text) => (text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1)}…` : text);
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
      panels: panels.map((panel) => (isBrowser(panel) ? { ...panel } : { ...panel, agentName: agentName(panel.agentId) })),
      notifications,
      layouts,
      profiles,
      threads,
      user: { name: userName },
      unread: unreadCount(notifications),
    };
  }

  function save() {
    store.save({
      projects,
      panels: panels.map((panel) => (isBrowser(panel)
        ? { id: panel.id, kind: 'browser', cwd: panel.cwd, url: panel.url }
        // Claude only writes the conversation once there is one, so an id from
        // a panel nobody typed into names nothing. Saving it would make every
        // restart ask to resume a conversation that was never created — and
        // the panel would come back dead, for good.
        : { id: panel.id, agentId: panel.agentId, cwd: panel.cwd, sessionId: panel.used ? panel.sessionId : null, title: panel.title })),
      notifications,
      layouts,
      profiles,
      // A run cannot survive the server, so nothing is saved as still working.
      threads: threads.map((thread) => ({ ...thread, status: thread.status === 'working' ? 'idle' : thread.status })),
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
    // A fresh session means resuming the old one failed. Whatever conversation
    // this panel used to have is gone, so it goes back to having none until it
    // is typed into — otherwise a dead id is only ever swapped for another
    // dead id, and the panel comes back broken after every restart.
    panel.sessionId = sessionId;
    panel.used = false;
    save();
  });

  function start() {
    const saved = store.load();
    projects = saved.projects;
    notifications = saved.notifications;
    layouts = saved.layouts ?? {};
    profiles = saved.profiles ?? [];
    threads = (saved.threads ?? []).map((thread) => ({
      ...thread,
      items: thread.items ?? emptyTranscript(),
      // Whatever was in flight died with the last server; nothing is working now.
      status: thread.status === 'working' ? 'idle' : thread.status,
    }));
    panels = saved.panels.map((panel) => ({
      ...panel,
      // Only a panel that was used has a conversation waiting for it; the rest
      // start again from nothing, under an id of their own.
      used: !isBrowser(panel) && Boolean(panel.sessionId),
      sessionId: isBrowser(panel) ? undefined : (panel.sessionId ?? newSessionId()),
      status: isBrowser(panel) ? 'browser' : 'starting',
      message: null,
      attention: false,
    }));
    reconcileLayouts();
    panels.filter((panel) => !isBrowser(panel)).forEach((panel) => launch(panel, panel.used ? 'resume' : 'start'));
    publish();
  }

  // ---- Agent mode --------------------------------------------------------

  function runThread(thread, profile) {
    const run = agentRunner.run({
      cwd: profile.cwd,
      prompt: thread.items.at(-1).text,
      sessionId: thread.sessionId ?? null,
      instructions: profile.instructions ?? '',
      tools: profile.tools ?? null,
    }, {
      onEvent(event) {
        // The thread may have been closed while the agent was still talking.
        const live = findThread(thread.id);
        if (!live) return;
        // The first event of a run names the session, which is how the next
        // message continues this same conversation rather than starting one.
        if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
          live.sessionId = event.session_id;
        }
        const items = applyEvent(live.items, event);
        if (items === live.items) return;
        live.items = items;
        commit();
      },
      onDone({ ok, message }) {
        runsByThread.delete(thread.id);
        const live = findThread(thread.id);
        if (!live) return;
        live.status = ok ? 'idle' : 'failed';
        if (!ok) live.items = applyEvent(live.items, { type: 'result', subtype: 'error', result: message });
        commit();
      },
    });
    runsByThread.set(thread.id, run);
  }

  const handlers = {
    hello(_message, reply) {
      reply(state());
      for (const panel of panels) {
        if (isBrowser(panel)) continue;
        reply({ type: 'panel:replay', panelId: panel.id, data: agentManager.readScrollback(panel.id) });
      }
    },

    'profile:create'({ name, cwd, instructions, tools }) {
      const trimmed = String(name ?? '').trim();
      if (!trimmed) return;
      profiles.push({
        id: newId(),
        name: trimmed,
        cwd: cwd ?? '',
        instructions: String(instructions ?? '').trim(),
        tools: Array.isArray(tools) && tools.length ? tools : null,
        colour: PROFILE_COLOURS[profiles.length % PROFILE_COLOURS.length],
      });
      commit();
    },

    'profile:update'({ profileId, name, cwd, instructions, tools }) {
      const profile = findProfile(profileId);
      if (!profile) return;
      const trimmed = String(name ?? '').trim();
      if (trimmed) profile.name = trimmed;
      if (cwd !== undefined) profile.cwd = cwd;
      if (instructions !== undefined) profile.instructions = String(instructions).trim();
      if (tools !== undefined) profile.tools = Array.isArray(tools) && tools.length ? tools : null;
      commit();
    },

    'profile:remove'({ profileId }) {
      if (!findProfile(profileId)) return;
      for (const thread of threads.filter((one) => one.profileId === profileId)) {
        runsByThread.get(thread.id)?.cancel();
        runsByThread.delete(thread.id);
      }
      profiles = profiles.filter((profile) => profile.id !== profileId);
      threads = threads.filter((thread) => thread.profileId !== profileId);
      commit();
    },

    'thread:create'({ profileId }) {
      if (!findProfile(profileId)) return;
      threads.push({
        id: newId(),
        profileId,
        title: 'New thread',
        sessionId: null,
        items: emptyTranscript(),
        status: 'idle',
      });
      commit();
    },

    'thread:remove'({ threadId }) {
      runsByThread.get(threadId)?.cancel();
      runsByThread.delete(threadId);
      threads = threads.filter((thread) => thread.id !== threadId);
      commit();
    },

    'thread:send'({ threadId, text }) {
      const thread = findThread(threadId);
      const prompt = String(text ?? '').trim();
      // One turn at a time: a second message would start a second CLI on the
      // same session and the two would write over each other.
      if (!thread || !prompt || thread.status === 'working' || !agentRunner) return;
      const profile = findProfile(thread.profileId);
      if (!profile) return;
      if (!thread.items.length) thread.title = threadTitle(prompt);
      thread.items = applyEvent(thread.items, { type: 'prompt', text: prompt });
      thread.status = 'working';
      commit();
      runThread(thread, profile);
    },

    'thread:cancel'({ threadId }) {
      const thread = findThread(threadId);
      if (!thread) return;
      runsByThread.get(threadId)?.cancel();
      runsByThread.delete(threadId);
      thread.status = 'idle';
      commit();
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

    'panel:create'({ agentId, cwd, kind, url, nextTo, direction }) {
      if (typeof cwd !== 'string') return;
      const browser = kind === 'browser';
      const address = browser ? webAddress(url) : null;
      if (browser ? !address : !agents.some((agent) => agent.id === agentId)) return;

      // A window may ask for the new panel to split one that is already there.
      const beside = panelsOfFolder(cwd).some((panel) => panel.id === nextTo) ? nextTo : null;
      const along = direction === 'column' ? 'column' : 'row';
      const panel = browser
        ? { id: newId(), kind: 'browser', cwd, url: address, status: 'browser', message: null, attention: false }
        : {
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
      if (!browser) launch(panel, 'start');
    },

    'panel:url'({ panelId, url }) {
      const panel = findPanel(panelId);
      const address = webAddress(url);
      if (!panel || !isBrowser(panel) || !address) return;
      panel.url = address;
      commit();
    },

    'panel:close'({ panelId }) {
      const closing = findPanel(panelId);
      if (!closing) return;
      if (!isBrowser(closing)) agentManager.forget(panelId);
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
      if (!panel || isBrowser(panel)) return;
      Object.assign(panel, { sessionId: newSessionId(), title: null, status: 'starting', message: null, attention: false });
      commit();
      launch(panel, 'start');
    },

    'panel:input'({ panelId, data }) {
      const panel = findPanel(panelId);
      if (!panel || isBrowser(panel) || typeof data !== 'string') return;
      agentManager.write(panelId, data);
      // Typing into it is what makes the conversation real, and so worth
      // remembering the session of.
      if (!panel.used && looksTyped(data)) {
        panel.used = true;
        save();
      }
      if (panel.attention && looksTyped(data)) {
        panel.attention = false;
        publish();
      }
    },

    'panel:resize'({ panelId, cols, rows }) {
      const panel = findPanel(panelId);
      if (!panel || isBrowser(panel) || !Number.isInteger(cols) || !Number.isInteger(rows)) return;
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
    if (!panel || isBrowser(panel) || !HOOK_EVENTS.has(event)) return false;
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
