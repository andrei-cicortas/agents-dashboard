// Owns the dashboard state and reacts to UI messages, agent events, and hooks.
// It has no network code: server/index.js passes messages in and sends out
// whatever this module broadcasts.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addNotification, markRead, markAllRead, unreadCount, removeForPanel } from './notifications.js';
import { insert, reconcile } from '../shared/tiling.js';
import { webAddress } from '../shared/address.js';
import { applyEvent, emptyTranscript } from '../shared/transcript.js';
import { looksTyped } from '../shared/input.js';
import { listFolders as listFoldersOnDisk } from './folders.js';

const HOOK_EVENTS = new Set(['finished', 'needs-input']);

// The Chat tab. No folder, no files, no commands: a conversation with Claude
// for the questions that come up while the agents work, which would otherwise
// mean leaving the window. It may look things up, because half of what anyone
// asks depends on something newer than the model.
export const CHAT_TOOLS = ['WebSearch', 'WebFetch'];
export const CHAT_MODELS = ['sonnet', 'opus', 'haiku'];
const DEFAULT_CHAT_MODEL = 'sonnet';
const CHAT_INSTRUCTIONS = [
  'You are the chat window of a desktop app, not an agent working in a codebase.',
  'There are no files here to read and no commands to run, so answer from what you know',
  'and look something up on the web only when the answer depends on it.',
  'Keep answers short unless asked for more.',
].join(' ');

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
  folderExists = (dir) => fs.existsSync(dir),
  listFolders = listFoldersOnDisk,
  broadcast,
  requestStop = () => {},
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  newSessionId = () => crypto.randomUUID(),
  // Whoever is signed in to this PC; the sidebar shows it where a hosted app
  // would show an account.
  userName = os.userInfo().username,
  // A chat belongs to no project, but the CLI still has to be started
  // somewhere. Nothing of it is read: a chat has no tool that touches a disk.
  chatCwd = os.homedir(),
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
  // Chat mode: conversations with nothing behind them but Claude itself.
  let chats = [];
  // Turns in flight, by the id of the thread or chat they belong to.
  const runs = new Map();

  // Guards against a second folder-picker process spawning while one is
  // already open (each extra click otherwise stacks another hidden dialog).
  let addingProject = false;
  // Panel each connected window reports as focused (clientId -> panelId).
  // A window that is hidden, unfocused, or closed has no entry.
  const focusByClient = new Map();

  const agentName = (agentId) => agents.find((agent) => agent.id === agentId)?.name ?? agentId;
  // Codex picks its own session and ignores anything we pass, so a panel of
  // one starts with none and is told which it opened afterwards. Inventing an
  // id here would name a conversation that never exists.
  const namesOwnSession = (agentId) => Boolean(agents.find((agent) => agent.id === agentId)?.sessionSource);
  const sessionFor = (agentId) => (namesOwnSession(agentId) ? null : newSessionId());

  function addProject(folder) {
    if (projects.some((project) => samePath(project.path, folder))) return;
    projects = [...projects, { path: folder, name: path.win32.basename(folder) || folder, pinned: false }];
    commit();
  }

  const findProfile = (profileId) => profiles.find((profile) => profile.id === profileId);
  const findThread = (threadId) => threads.find((thread) => thread.id === threadId);
  const findChat = (chatId) => chats.find((chat) => chat.id === chatId);
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
      chats,
      chatModels: CHAT_MODELS,
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
      chats: chats.map((chat) => ({ ...chat, status: chat.status === 'working' ? 'idle' : chat.status })),
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

  agentManager.on('session', ({ panelId, sessionId, reason }) => {
    const panel = findPanel(panelId);
    if (!panel) return;
    panel.sessionId = sessionId;
    // An agent that names its own session has already written the conversation
    // down, so that id is worth keeping at once. A session handed over after a
    // failed resume has nothing behind it yet: the panel goes back to having no
    // conversation until it is typed into, or a dead id would only ever be
    // swapped for another dead id and the panel would break on every restart.
    panel.used = reason === 'discovered';
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
    chats = (saved.chats ?? []).map((chat) => ({
      ...chat,
      items: chat.items ?? emptyTranscript(),
      model: CHAT_MODELS.includes(chat.model) ? chat.model : DEFAULT_CHAT_MODEL,
      at: chat.at ?? now().toISOString(),
      status: chat.status === 'working' ? 'idle' : chat.status,
    }));
    panels = saved.panels.map((panel) => ({
      ...panel,
      // Only a panel that was used has a conversation waiting for it; the rest
      // start again from nothing, under an id of their own.
      used: !isBrowser(panel) && Boolean(panel.sessionId),
      sessionId: isBrowser(panel) ? undefined : (panel.sessionId ?? sessionFor(panel.agentId)),
      status: isBrowser(panel) ? 'browser' : 'starting',
      message: null,
      attention: false,
    }));
    reconcileLayouts();
    panels.filter((panel) => !isBrowser(panel)).forEach((panel) => launch(panel, panel.used ? 'resume' : 'start'));
    publish();
  }

  // ---- One turn of a conversation ----------------------------------------

  // Shared by an agent's threads and by the Chat tab: both are a list of
  // transcript items continued by a CLI session id, and differ only in where
  // the CLI runs and what it is allowed to do. `find` looks the conversation
  // up again on every event, because it may have been closed mid-answer.
  function runTurn(conversation, { cwd, instructions, tools, model }, find) {
    const run = agentRunner.run({
      cwd,
      prompt: conversation.items.at(-1).text,
      sessionId: conversation.sessionId ?? null,
      instructions,
      tools,
      model,
    }, {
      onEvent(event) {
        const live = find(conversation.id);
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
        runs.delete(conversation.id);
        const live = find(conversation.id);
        if (!live) return;
        live.status = ok ? 'idle' : 'failed';
        if (!ok) live.items = applyEvent(live.items, { type: 'result', subtype: 'error', result: message });
        commit();
      },
    });
    runs.set(conversation.id, run);
  }

  function stopRun(id) {
    runs.get(id)?.cancel();
    runs.delete(id);
  }

  // Puts a question to a chat and starts the answer. Says whether it did, so a
  // chat created with nothing to ask is still published.
  function askChat(chat, text) {
    const prompt = String(text ?? '').trim();
    // One turn at a time, for the same reason a thread has one: a second CLI on
    // the same session would write over the first.
    if (!prompt || chat.status === 'working' || !agentRunner) return false;
    if (!chat.items.length) chat.title = threadTitle(prompt);
    chat.items = applyEvent(chat.items, { type: 'prompt', text: prompt });
    chat.status = 'working';
    chat.at = now().toISOString();
    commit();
    runTurn(chat, {
      cwd: chatCwd,
      instructions: CHAT_INSTRUCTIONS,
      tools: CHAT_TOOLS,
      model: chat.model,
    }, findChat);
    return true;
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
      for (const thread of threads.filter((one) => one.profileId === profileId)) stopRun(thread.id);
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
      stopRun(threadId);
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
      runTurn(thread, {
        cwd: profile.cwd,
        instructions: profile.instructions ?? '',
        tools: profile.tools ?? null,
      }, findThread);
    },

    'thread:cancel'({ threadId }) {
      const thread = findThread(threadId);
      if (!thread) return;
      stopRun(threadId);
      thread.status = 'idle';
      commit();
    },

    // ---- Chat mode -------------------------------------------------------

    // Given something to ask, the new chat starts on it. Nobody wants to name
    // a conversation before having it, so the first question does that instead.
    'chat:create'({ model: wanted, text } = {}) {
      const chat = {
        id: newId(),
        title: 'New chat',
        sessionId: null,
        items: emptyTranscript(),
        status: 'idle',
        model: CHAT_MODELS.includes(wanted) ? wanted : DEFAULT_CHAT_MODEL,
        at: now().toISOString(),
      };
      chats = [...chats, chat];
      if (!askChat(chat, text)) commit();
    },

    'chat:send'({ chatId, text }) {
      const chat = findChat(chatId);
      if (chat) askChat(chat, text);
    },

    'chat:cancel'({ chatId }) {
      const chat = findChat(chatId);
      if (!chat) return;
      stopRun(chatId);
      chat.status = 'idle';
      commit();
    },

    'chat:remove'({ chatId }) {
      if (!findChat(chatId)) return;
      stopRun(chatId);
      chats = chats.filter((chat) => chat.id !== chatId);
      commit();
    },

    'chat:rename'({ chatId, title }) {
      const chat = findChat(chatId);
      const trimmed = String(title ?? '').trim();
      if (!chat || !trimmed) return;
      chat.title = threadTitle(trimmed);
      commit();
    },

    // Which model answers. Changing it mid-conversation is allowed: the CLI
    // resumes the same session under the new one, so the chat carries on.
    'chat:model'({ chatId, model: wanted }) {
      const chat = findChat(chatId);
      if (!chat || !CHAT_MODELS.includes(wanted)) return;
      chat.model = wanted;
      commit();
    },

    async 'project:add'({ path: typed } = {}, reply) {
      // A path can be pasted straight in, which is quicker than the picker and
      // does not depend on a modal dialog finding its way to the front.
      const given = typeof typed === 'string' ? typed.trim() : '';
      if (given) {
        const folder = path.win32.normalize(given).replace(/[\\/]+$/, '');
        if (!folderExists(folder)) {
          reply?.({ type: 'project:add-failed', path: typed, message: 'That folder does not exist.' });
          return;
        }
        addProject(folder);
        return;
      }
      if (addingProject) return;
      addingProject = true;
      try {
        const picked = await pickFolder();
        if (picked) addProject(picked);
      } finally {
        addingProject = false;
      }
    },

    // The app browses folders itself rather than opening the Windows dialog,
    // which has no address bar and can end up behind the window.
    'folders:list'({ path: asked }, reply) {
      reply({ type: 'folders:listed', ...listFolders({ path: asked }) });
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
          sessionId: sessionFor(agentId),
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
