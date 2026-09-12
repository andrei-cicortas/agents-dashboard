// Holds the UI state, connects to the server, and wires the components.

import { connect } from './api.js';
import { createTopbar } from './topbar.js';
import { createSidebar } from './sidebar.js';
import { createAccount } from './account.js';
import { createAgentRail } from './agent-rail.js';
import { createAgentView } from './agent-view.js';
import { createChatRail } from './chat-rail.js';
import { createChatView } from './chat-view.js';
import { createBell } from './bell.js';
import { createCanvas } from './canvas.js';
import { isActive, sameFolder } from '/shared/status.js';
import { reconcile, tidy } from '/shared/tiling.js';
import { mergeLayouts } from '/shared/layout-sync.js';
import { cssVariables, DEFAULT_THEME_ID, themeById } from '/shared/themes.js';

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

// The server marks a notification read only while some window reports that
// panel as focused, so report null whenever this window is hidden or in the
// background. undefined means nothing was sent on the current connection.
let sentFocus;

function syncFocus() {
  const looking = document.visibilityState === 'visible' && document.hasFocus();
  const panelId = looking ? model.focusedPanelId : null;
  if (panelId === sentFocus) return;
  sentFocus = panelId;
  api.send('panel:focus', { panelId });
}

const actions = {
  setTab(tab) {
    model.tab = tab;
    savePrefs();
    render();
    if (tab === 'chat') chatView.focus();
  },

  // ---- Agent tab --------------------------------------------------------

  selectProfile(profileId) {
    model.selectedProfileId = profileId;
    model.selectedThreadId = null;
    savePrefs();
    render();
  },

  createProfile({ name, cwd, instructions }) {
    api.send('profile:create', { name, cwd, instructions });
  },

  removeProfile(profileId) {
    const profile = model.state?.profiles?.find((one) => one.id === profileId);
    if (!profile) return;
    if (!confirm(`Remove ${profile.name} and all of its threads?`)) return;
    api.send('profile:remove', { profileId });
  },

  renameProfile(profileId) {
    const profile = model.state?.profiles?.find((one) => one.id === profileId);
    if (!profile) return;
    const name = prompt('Name for this agent', profile.name);
    if (name && name.trim()) api.send('profile:update', { profileId, name });
  },

  // An agent answers with nobody watching, so widening what it may touch is
  // asked about rather than toggled quietly.
  setProfileTools(profileId, allowWrite) {
    if (allowWrite && !confirm('Let this agent run commands and change files in its folder?')) return;
    api.send('profile:update', { profileId, tools: allowWrite ? WRITE_TOOLS : [] });
  },

  createThread(profileId) {
    api.send('thread:create', { profileId });
  },

  selectThread(threadId) {
    model.selectedThreadId = threadId;
    render();
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
  },

  removeChat(chatId) {
    const chat = model.state?.chats?.find((one) => one.id === chatId);
    if (!chat || !confirm(`Delete "${chat.title}"?`)) return;
    if (model.selectedChatId === chatId) model.selectedChatId = null;
    api.send('chat:remove', { chatId });
  },

  renameChat(chatId) {
    const chat = model.state?.chats?.find((one) => one.id === chatId);
    if (!chat) return;
    const title = prompt('Name for this chat', chat.title);
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

  stopAll() {
    const running = model.state?.panels.filter(isActive).length ?? 0;
    const question = running
      ? `Stop all ${running} agents and close the dashboard?`
      : 'Close the dashboard?';
    if (confirm(question)) api.send('server:stop');
  },

  addProject(folderPath) {
    api.send('project:add', folderPath ? { path: folderPath } : {});
  },

  listFolders(folderPath) {
    api.send('folders:list', { path: folderPath ?? '' });
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

  closePanel(panelId) {
    const panel = findPanel(panelId);
    if (panel && isActive(panel) && !confirm('Stop this agent?')) return;
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

  openNotification(notification) {
    api.send('notifications:read', { id: notification.id });
    if (findPanel(notification.panelId)) actions.focusPanel(notification.panelId);
  },

  readAllNotifications() {
    api.send('notifications:read', { all: true });
  },
};

const topbar = createTopbar(byId('topbar'), actions);
const bell = createBell(topbar.bellMount, actions);
const sidebar = createSidebar(byId('workspace-rail'), actions);
const account = createAccount(byId('account'), actions);
const agentRail = createAgentRail(byId('agent-rail'), actions);
const agentView = createAgentView(byId('agent-view'), actions);
const chatRail = createChatRail(byId('chat-rail'), actions);
const chatView = createChatView(byId('chat-view'), actions);
const canvas = createCanvas(byId('canvas'), byId('empty'), actions, model.theme);

// The stylesheet ships the default theme, so the page is already dressed
// before this runs; setting the same custom properties here swaps it.
function applyTheme() {
  for (const [name, value] of Object.entries(cssVariables(model.theme))) {
    document.documentElement.style.setProperty(name, value);
  }
  canvas.setTheme(model.theme);
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
  // Nothing points at an agent until there is one to point at.
  const profiles = model.state?.profiles ?? [];
  if (!profiles.some((one) => one.id === model.selectedProfileId)) {
    model.selectedProfileId = profiles[0]?.id ?? null;
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
  syncLayout(path);
}

render();

const api = connect({
  onMessage(message) {
    if (message.type === 'state') {
      model.state = message;
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
    } else if (message.type === 'panel:data') {
      canvas.write(message.panelId, message.data);
    } else if (message.type === 'panel:replay') {
      canvas.replay(message.panelId, message.data);
    } else if (message.type === 'folders:listed') {
      sidebar.folderList(message);
    } else if (message.type === 'project:add-failed') {
      sidebar.addFailed(message.message);
    } else if (message.type === 'server:stopped') {
      byId('stopped').hidden = false;
      byId('banner').hidden = true;
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
