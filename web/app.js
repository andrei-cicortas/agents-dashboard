// Holds the UI state, connects to the server, and wires the components.

import { connect } from './api.js';
import { createTopbar } from './topbar.js';
import { createSidebar } from './sidebar.js';
import { deliverFolders } from './folder-picker.js';
import { createAccount } from './account.js';
import { createAgentRail } from './agent-rail.js';
import { createAgentView } from './agent-view.js';
import { createChatRail } from './chat-rail.js';
import { createChatView } from './chat-view.js';
import { installShortcuts } from './shortcuts.js';
import { createPalette } from './palette.js';
import { createBell } from './bell.js';
import { createCanvas } from './canvas.js';
import { isActive, sameFolder } from '/shared/status.js';
import { reconcile, tidy } from '/shared/tiling.js';
import { mergeLayouts } from '/shared/layout-sync.js';
import { cssVariables, DEFAULT_THEME_ID, otherTheme, themeById } from '/shared/themes.js';
import { windowChrome } from '/shared/window-chrome.js';
import { notificationSubject, notificationText } from '/shared/labels.js';
import { newlyUnread } from '/shared/toasts.js';
import { inWindow, onWindowMessage, tellWindow } from './desktop.js';
import { ask, askText } from './dialog.js';

const PREFS_KEY = 'agents-dashboard-ui';
const DEFAULT_ADDRESS = 'http://localhost:3000';
// What an agent is given when it is allowed to change things. Its folder is
// the only place it can reach, because that is where the CLI is run.
const WRITE_TOOLS = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Edit', 'Write', 'Bash'];
const byId = (id) => document.getElementById(id);

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {};
  } catch {
    return {};
  }
}

const prefs = loadPrefs();

const model = {
  state: null,
  tab: prefs.tab ?? 'code',
  focusedPanelId: null,
  maximizedPanelId: null,
  collapsedProjects: new Set(prefs.collapsedProjects ?? []),
  sidebarCollapsed: Boolean(prefs.sidebarCollapsed),
  selectedWorkspace: prefs.selectedWorkspace ?? null,
  // Agent tab: the agent being looked at, and which of its threads.
  selectedProfileId: prefs.selectedProfileId ?? null,
  selectedThreadId: null,
  // Chat tab: the conversation on screen, and the model the next one starts
  // on. A chat remembers its own model; this is only for before there is one
  // to remember it.
  selectedChatId: prefs.selectedChatId ?? null,
  nextChatModel: prefs.nextChatModel ?? 'sonnet',
  theme: themeById(prefs.theme ?? DEFAULT_THEME_ID),
  // Layouts per workspace path. Kept here rather than read straight off the
  // server state, so a broadcast sent for some other reason cannot undo a
  // layout change of ours that has not come back yet.
  layouts: {},
  // The tiling tree of the selected workspace, worked out on every render.
  layout: null,
};

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      tab: model.tab,
      collapsedProjects: [...model.collapsedProjects],
      sidebarCollapsed: model.sidebarCollapsed,
      selectedWorkspace: model.selectedWorkspace,
      selectedProfileId: model.selectedProfileId,
      selectedChatId: model.selectedChatId,
      nextChatModel: model.nextChatModel,
      theme: model.theme.id,
    }));
  } catch {
    // Preferences are a convenience; ignore storage errors.
  }
}

const findPanel = (panelId) => model.state?.panels.find((panel) => panel.id === panelId);
const panelsIn = (path) => (model.state?.panels ?? []).filter((panel) => sameFolder(panel.cwd, path));
const workspaceOf = (panelId) => findPanel(panelId)?.cwd ?? null;

function layoutOf(path) {
  const entry = Object.entries(model.layouts).find(([key]) => sameFolder(key, path));
  return entry ? entry[1] ?? null : null;
}

// Layouts we have sent and are waiting to see again, as path -> JSON.
const inFlight = {};

// Set while a chat asked for by its first question has not come back yet.
let pendingChat = false;

function sendLayout(path, tree) {
  const json = JSON.stringify(tree ?? null);
  if (inFlight[path] === json) return;
  inFlight[path] = json;
  model.layouts = { ...model.layouts, [path]: tree };
  api.send('layout:set', { path, layout: tree });
}

// The workspace on screen: the chosen one while it still exists, else the
// first in the list.
function currentWorkspace() {
  const projects = model.state?.projects ?? [];
  const chosen = projects.find((project) => model.selectedWorkspace && sameFolder(project.path, model.selectedWorkspace));
  return (chosen ?? projects[0])?.path ?? null;
}

// The layout to draw. The server places new panels and takes closed ones out,
// so reconciling here is only a safety net for a layout that somehow fell
// behind the panels it is meant to hold.
function computeLayout(path) {
  if (!path) return null;
  return reconcile(layoutOf(path), panelsIn(path).map((panel) => panel.id));
}

// The server marks a notification read only while some window reports that it
// is looking at the thing, so report nothing whenever this window is hidden or
// in the background. undefined means nothing was sent on this connection.
let sentFocus;

// The one conversation this window is showing: the focused terminal, the open
// thread, or the open chat, depending on which tab is in front.
function looking() {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return null;
  if (model.tab === 'code') return model.focusedPanelId ? { kind: 'panel', targetId: model.focusedPanelId } : null;
  if (model.tab === 'agent') return model.selectedThreadId ? { kind: 'thread', targetId: model.selectedThreadId } : null;
  return model.selectedChatId ? { kind: 'chat', targetId: model.selectedChatId } : null;
}

function syncFocus() {
  const at = looking();
  const key = at ? `${at.kind}:${at.targetId}` : null;
  if (key === sentFocus) return;
  sentFocus = key;
  api.send('ui:focus', at ?? { kind: null, targetId: null });
}

const actions = {
  setTab(tab) {
    model.tab = tab;
    savePrefs();
    render();
    syncFocus();
    if (tab === 'chat') chatView.focus();
  },

  // ---- Agent tab --------------------------------------------------------

  selectProfile(profileId) {
    model.selectedProfileId = profileId;
    model.selectedThreadId = null;
    savePrefs();
    render();
    syncFocus();
  },

  createProfile({ name, cwd, instructions, model: wanted }) {
    api.send('profile:create', { name, cwd, instructions, model: wanted });
  },

  async removeProfile(profileId) {
    const profile = model.state?.profiles?.find((one) => one.id === profileId);
    if (!profile) return;
    const sure = await ask({
      title: `Remove ${profile.name}?`,
      message: 'All of its threads go with it. This cannot be undone.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (sure) api.send('profile:remove', { profileId });
  },

  async renameProfile(profileId) {
    const profile = model.state?.profiles?.find((one) => one.id === profileId);
    if (!profile) return;
    const name = await askText({ title: 'Rename this agent', value: profile.name, confirmLabel: 'Rename' });
    if (name && name.trim()) api.send('profile:update', { profileId, name });
  },

  // An agent answers with nobody watching, so widening what it may touch is
  // asked about rather than toggled quietly.
  async setProfileTools(profileId, allowWrite) {
    if (allowWrite) {
      const sure = await ask({
        title: 'Let this agent change files?',
        message: 'It will be able to run commands and edit anything in its folder, with nobody there to approve each step.',
        confirmLabel: 'Let it change files',
        danger: true,
      });
      if (!sure) return;
    }
    api.send('profile:update', { profileId, tools: allowWrite ? WRITE_TOOLS : [] });
  },

  setProfileModel(profileId, wanted) {
    api.send('profile:update', { profileId, model: wanted });
  },

  createThread(profileId) {
    api.send('thread:create', { profileId });
  },

  selectThread(threadId) {
    model.selectedThreadId = threadId;
    render();
    syncFocus();
  },

  closeThread(threadId) {
    api.send('thread:remove', { threadId });
  },

  sendToThread(threadId, text) {
    model.selectedThreadId = threadId;
    api.send('thread:send', { threadId, text });
  },

  cancelThread(threadId) {
    api.send('thread:cancel', { threadId });
  },

  // ---- Chat tab ---------------------------------------------------------

  // Sending with nothing open starts a chat on that very question, so nothing
  // has to be created or named before asking something.
  sendChat(text) {
    if (model.selectedChatId) {
      api.send('chat:send', { chatId: model.selectedChatId, text });
      return;
    }
    // The chat does not exist yet, so the server names its id. Remember that
    // one is on the way, and open it as soon as it comes back.
    pendingChat = true;
    api.send('chat:create', { text, model: model.nextChatModel });
  },

  // Nothing is created until something is asked, so an empty chat can never
  // pile up in the list.
  newChat() {
    model.selectedChatId = null;
    savePrefs();
    render();
    chatView.focus();
  },

  selectChat(chatId) {
    model.selectedChatId = chatId;
    savePrefs();
    render();
    syncFocus();
  },

  async removeChat(chatId) {
    const chat = model.state?.chats?.find((one) => one.id === chatId);
    if (!chat) return;
    const sure = await ask({
      title: `Delete "${chat.title}"?`,
      message: 'The whole conversation goes. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!sure) return;
    if (model.selectedChatId === chatId) model.selectedChatId = null;
    api.send('chat:remove', { chatId });
  },

  async renameChat(chatId) {
    const chat = model.state?.chats?.find((one) => one.id === chatId);
    if (!chat) return;
    const title = await askText({ title: 'Rename this chat', value: chat.title, confirmLabel: 'Rename' });
    if (title && title.trim()) api.send('chat:rename', { chatId, title });
  },

  cancelChat(chatId) {
    api.send('chat:cancel', { chatId });
  },

  setChatModel(chatId, wanted) {
    model.nextChatModel = wanted;
    savePrefs();
    api.send('chat:model', { chatId, model: wanted });
  },

  // Chosen before there is a chat to put it on; the next one starts with it.
  setNextChatModel(wanted) {
    model.nextChatModel = wanted;
    savePrefs();
    render();
  },

  toggleSidebar() {
    model.sidebarCollapsed = !model.sidebarCollapsed;
    savePrefs();
    render();
  },

  // 1 bigger, -1 smaller, 0 back to actual size. Only the app window zooms
  // this way; a browser has its own keys for it.
  zoom(step) {
    tellWindow({ type: 'window:zoom', step });
  },

  async stopAll() {
    const running = model.state?.panels.filter(isActive).length ?? 0;
    const sure = await ask(running
      ? {
        title: `Stop ${running === 1 ? 'the agent' : `all ${running} agents`} and close?`,
        message: 'Their panels come back the next time the app opens, and each carries on its conversation.',
        confirmLabel: 'Stop and close',
        danger: true,
      }
      : {
        title: 'Close the dashboard?',
        message: 'Nothing is running. Opening the app again starts it.',
        confirmLabel: 'Close',
      });
    if (sure) api.send('server:stop');
  },

  addProject(folderPath) {
    api.send('project:add', folderPath ? { path: folderPath } : {});
  },

  listFolders(folderPath) {
    api.send('folders:list', { path: folderPath ?? '' });
  },

  openFolder(path) {
    api.send('folder:open', { path });
  },

  removeProject(path) {
    api.send('project:remove', { path });
  },

  pinProject(path, pinned) {
    api.send('project:pin', { path, pinned });
  },

  toggleProject(path) {
    if (model.collapsedProjects.has(path)) model.collapsedProjects.delete(path);
    else model.collapsedProjects.add(path);
    savePrefs();
    render();
  },

  setTheme(themeId) {
    model.theme = themeById(themeId);
    applyTheme();
    savePrefs();
    render();
  },

  selectWorkspace(path) {
    model.selectedWorkspace = path;
    model.tab = 'code';
    model.maximizedPanelId = null;
    savePrefs();
    render();
  },

  // The server decides where the panel lands; this only says what would be
  // nicest. Left to itself it splits the pane in focus along its longer side.
  createPanel(agentId, cwd, placement = null) {
    model.tab = 'code';
    model.maximizedPanelId = null;
    model.selectedWorkspace = cwd;
    const focused = panelsIn(cwd).some((panel) => panel.id === model.focusedPanelId) ? model.focusedPanelId : null;
    const where = placement ?? (focused ? { nextTo: focused, direction: canvas.splitDirection(focused) } : {});
    savePrefs();
    api.send('panel:create', { agentId, cwd, ...where });
    render();
  },

  // A web pane starts on the port most dev servers use; the address bar in
  // its header is there to point it somewhere else.
  createBrowserPane(cwd, placement = null) {
    model.tab = 'code';
    model.maximizedPanelId = null;
    model.selectedWorkspace = cwd;
    const focused = panelsIn(cwd).some((panel) => panel.id === model.focusedPanelId) ? model.focusedPanelId : null;
    const where = placement ?? (focused ? { nextTo: focused, direction: canvas.splitDirection(focused) } : {});
    savePrefs();
    api.send('panel:create', { kind: 'browser', cwd, url: DEFAULT_ADDRESS, ...where });
    render();
  },

  setPanelUrl(panelId, url) {
    api.send('panel:url', { panelId, url });
  },

  splitPanel(panel, direction) {
    const where = { nextTo: panel.id, direction };
    if (panel.kind === 'browser') actions.createBrowserPane(panel.cwd, where);
    else actions.createPanel(panel.agentId, panel.cwd, where);
  },

  setLayout(tree) {
    const path = currentWorkspace();
    if (!path) return;
    sendLayout(path, tree);
    render();
  },

  tidyLayout(columns) {
    const path = currentWorkspace();
    if (!path) return;
    actions.setLayout(tidy(panelsIn(path).map((panel) => panel.id), columns));
  },

  async closePanel(panelId) {
    const panel = findPanel(panelId);
    if (panel && isActive(panel)) {
      const sure = await ask({
        title: `Stop ${panel.agentName ?? 'this agent'}?`,
        message: 'The panel closes and the agent in it stops.',
        confirmLabel: 'Stop agent',
        danger: true,
      });
      if (!sure) return;
    }
    if (model.maximizedPanelId === panelId) model.maximizedPanelId = null;
    api.send('panel:close', { panelId });
  },

  restartPanel(panelId) {
    api.send('panel:restart', { panelId });
  },

  input(panelId, data) {
    api.send('panel:input', { panelId, data });
  },

  resize(panelId, cols, rows) {
    api.send('panel:resize', { panelId, cols, rows });
  },

  findInPanel(panelId) {
    canvas.find(panelId);
  },

  focusPanel(panelId) {
    const workspace = workspaceOf(panelId);
    const changed = model.focusedPanelId !== panelId
      || model.tab !== 'code'
      || (workspace && !sameFolder(workspace, currentWorkspace()))
      || (model.maximizedPanelId && model.maximizedPanelId !== panelId);
    if (!changed) return;
    model.tab = 'code';
    if (workspace) model.selectedWorkspace = workspace;
    if (model.maximizedPanelId !== panelId) model.maximizedPanelId = null;
    if (model.focusedPanelId !== panelId) {
      model.focusedPanelId = panelId;
      syncFocus();
    }
    savePrefs();
    render();
    canvas.reveal(panelId);
  },

  toggleMaximize(panelId) {
    model.maximizedPanelId = model.maximizedPanelId === panelId ? null : panelId;
    model.focusedPanelId = panelId;
    syncFocus();
    render();
  },

  openNotification({ id, kind, targetId }) {
    api.send('notifications:read', { id });
    if (kind === 'panel') {
      if (findPanel(targetId)) actions.focusPanel(targetId);
      return;
    }
    if (kind === 'chat') {
      if ((model.state?.chats ?? []).some((one) => one.id === targetId)) {
        model.tab = 'chat';
        actions.selectChat(targetId);
      }
      return;
    }
    const thread = (model.state?.threads ?? []).find((one) => one.id === targetId);
    if (!thread) return;
    model.tab = 'agent';
    model.selectedProfileId = thread.profileId;
    actions.selectThread(targetId);
  },

  readAllNotifications() {
    api.send('notifications:read', { all: true });
  },

  // ---- Ctrl+K -----------------------------------------------------------

  togglePalette() {
    if (palette.isOpen()) palette.close();
    else palette.open();
  },

  // What the palette does with whatever was picked. Everything it offers is
  // something one of the actions above already does.
  openPaletteItem({ kind, targetId }) {
    if (kind === 'command') return COMMANDS.find((one) => one.id === targetId)?.run();
    if (kind === 'workspace') return actions.selectWorkspace(targetId);
    if (kind === 'panel') return actions.focusPanel(targetId);
    if (kind === 'chat') {
      model.tab = 'chat';
      return actions.selectChat(targetId);
    }
    if (kind === 'agent') {
      model.tab = 'agent';
      return actions.selectProfile(targetId);
    }
    return undefined;
  },
};

// The few things worth starting from the same box you search in.
const COMMANDS = [
  { id: 'new-chat', label: 'New chat', hint: 'Ctrl+N on the Chat tab', run: () => { actions.setTab('chat'); actions.newChat(); } },
  // The browser lives in the sidebar, so it has to be there to be used.
  { id: 'add-folder', label: 'Add a project folder', hint: 'Command', run: () => { actions.setTab('code'); if (model.sidebarCollapsed) actions.toggleSidebar(); sidebar.openPicker(); } },
  { id: 'tidy', label: 'Tidy the panels', hint: 'Command', run: () => { actions.setTab('code'); actions.tidyLayout(); } },
  { id: 'theme', label: 'Switch theme', hint: 'Dark and Light', run: () => actions.setTheme(otherTheme(model.theme).id) },
  { id: 'sidebar', label: 'Show or hide the sidebar', hint: 'Ctrl+B', run: () => actions.toggleSidebar() },
  { id: 'zoom-in', label: 'Zoom in', hint: 'Ctrl+=', windowOnly: true, run: () => actions.zoom(1) },
  { id: 'zoom-out', label: 'Zoom out', hint: 'Ctrl+-', windowOnly: true, run: () => actions.zoom(-1) },
  { id: 'zoom-reset', label: 'Actual size', hint: 'Ctrl+0', windowOnly: true, run: () => actions.zoom(0) },
  { id: 'stop-all', label: 'Stop all agents and close', hint: 'Command', run: () => actions.stopAll() },
].filter((command) => inWindow || !command.windowOnly);

const topbar = createTopbar(byId('topbar'), actions);
const bell = createBell(topbar.bellMount, actions);
const sidebar = createSidebar(byId('workspace-rail'), actions);
const account = createAccount(byId('account'), actions);
const agentRail = createAgentRail(byId('agent-rail'), actions);
const agentView = createAgentView(byId('agent-view'), actions);
const chatRail = createChatRail(byId('chat-rail'), actions);
const chatView = createChatView(byId('chat-view'), actions);
const canvas = createCanvas(byId('canvas'), byId('empty'), actions, model.theme);
const palette = createPalette(actions);

// The stylesheet ships the default theme, so the page is already dressed
// before this runs; setting the same custom properties here swaps it.
function applyTheme() {
  for (const [name, value] of Object.entries(cssVariables(model.theme))) {
    document.documentElement.style.setProperty(name, value);
  }
  canvas.setTheme(model.theme);
  // The title bar belongs to the window, so it is told rather than styled.
  tellWindow(windowChrome(model.theme));
}

applyTheme();

// Saves the layout back whenever reconciling changed it, so the server's copy
// never falls behind what is on screen. reconcile gives the same answer when
// run again, so the echo that comes back settles instead of looping.
function syncLayout(path) {
  if (!path || !model.state) return;
  if (JSON.stringify(layoutOf(path) ?? null) === JSON.stringify(model.layout ?? null)) return;
  sendLayout(path, model.layout);
}

function render() {
  byId('app').classList.toggle('sidebar-collapsed', model.sidebarCollapsed);
  byId('code-view').hidden = model.tab !== 'code';
  byId('agent-view').hidden = model.tab !== 'agent';
  byId('chat-view').hidden = model.tab !== 'chat';
  // The sidebar shows whichever list belongs to the tab in front.
  byId('workspace-rail').hidden = model.tab !== 'code';
  byId('agent-rail').hidden = model.tab !== 'agent';
  byId('chat-rail').hidden = model.tab !== 'chat';

  const path = currentWorkspace();
  model.selectedWorkspace = path;
  model.layout = computeLayout(path);

  byId('empty-title').textContent = path ? 'No agents in this folder yet' : 'No workspace yet';
  byId('empty-text').textContent = path
    ? 'Hover the folder on the left and click + to start one.'
    : 'Click + next to Workspaces to add a project folder.';

  const unread = model.state?.unread ?? 0;
  document.title = unread ? `(${unread}) Agents Dashboard` : 'Agents Dashboard';
  // Nothing points at an agent, or at one of its threads, until there is one
  // to point at. Worked out here rather than in the view, because the window
  // has to tell the server which thread it is showing.
  const profiles = model.state?.profiles ?? [];
  if (!profiles.some((one) => one.id === model.selectedProfileId)) {
    model.selectedProfileId = profiles[0]?.id ?? null;
  }
  const openThreads = (model.state?.threads ?? []).filter((one) => one.profileId === model.selectedProfileId);
  if (!openThreads.some((one) => one.id === model.selectedThreadId)) {
    model.selectedThreadId = openThreads.at(-1)?.id ?? null;
  }

  // A chat deleted here or in another window is no longer the one open. Only
  // once there is state to check against: before the first one arrives, the
  // chat remembered from last time has not been contradicted by anything.
  if (model.state && model.selectedChatId && !(model.state.chats ?? []).some((one) => one.id === model.selectedChatId)) {
    model.selectedChatId = null;
  }

  topbar.render(model);
  bell.render(model);
  sidebar.render(model);
  account.render(model);
  agentRail.render(model);
  agentView.render(model);
  chatRail.render(model);
  chatView.render(model);
  canvas.render(model);
  palette.render(model, COMMANDS);
  syncLayout(path);
}

render();
installShortcuts(actions, model);

// The notifications this window has already seen, so only new ones are
// announced. null until the first state arrives.
let seenNotifications = null;

// Something new rang the bell. While this window is not the one being looked
// at, its taskbar button flashes and Windows shows a notification for it; the
// window checks for itself too that it is not the one in front.
function announce(state) {
  const news = newlyUnread(seenNotifications, state.notifications ?? []);
  seenNotifications = news.seen;
  if (!news.fresh.length) return;
  tellWindow({ type: 'window:attention' });
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  for (const notification of news.fresh.slice(0, 3)) {
    tellWindow({
      type: 'window:notify',
      id: notification.id,
      text: notificationText(notification, notificationSubject(state, notification)),
    });
  }
}

// A clicked Windows notification. When the click is what opened the app, it
// waits here for the state that holds it.
let pendingNotification = null;

function openPendingNotification() {
  if (!pendingNotification || !model.state) return;
  const notification = model.state.notifications.find((one) => one.id === pendingNotification);
  pendingNotification = null;
  if (notification) actions.openNotification(notification);
}

onWindowMessage((message) => {
  if (message?.type !== 'open-notification' || typeof message.id !== 'string') return;
  pendingNotification = message.id;
  openPendingNotification();
});

const api = connect({
  onMessage(message) {
    if (message.type === 'state') {
      model.state = message;
      announce(message);
      // The chat we asked the server to start: open it, now that it has an id.
      if (pendingChat && (message.chats ?? []).length) {
        model.selectedChatId = message.chats.at(-1).id;
        pendingChat = false;
        savePrefs();
      }
      const merged = mergeLayouts(message.layouts ?? {}, inFlight);
      model.layouts = merged.layouts;
      for (const path of merged.acknowledged) delete inFlight[path];
      if (model.focusedPanelId && !findPanel(model.focusedPanelId)) {
        model.focusedPanelId = null;
        syncFocus();
      }
      if (model.maximizedPanelId && !findPanel(model.maximizedPanelId)) model.maximizedPanelId = null;
      render();
      // render() is where a thread or chat first becomes the one on screen, so
      // the server only learns what this window is watching afterwards.
      syncFocus();
      openPendingNotification();
    } else if (message.type === 'panel:data') {
      canvas.write(message.panelId, message.data);
    } else if (message.type === 'panel:replay') {
      canvas.replay(message.panelId, message.data);
    } else if (message.type === 'folders:listed') {
      deliverFolders(message);
    } else if (message.type === 'project:add-failed') {
      sidebar.addFailed(message.message);
    } else if (message.type === 'server:stopped') {
      byId('stopped').hidden = false;
      byId('banner').hidden = true;
      // "Stop all agents and close": in the app window, close means the window.
      tellWindow({ type: 'window:close' });
    }
  },
  onConnectionChange(connected) {
    byId('banner').hidden = connected || !byId('stopped').hidden;
    if (connected) {
      // A new connection starts with no focus on the server; report it again.
      sentFocus = undefined;
      syncFocus();
    }
  },
});

window.addEventListener('focus', syncFocus);
window.addEventListener('blur', syncFocus);
document.addEventListener('visibilitychange', syncFocus);
