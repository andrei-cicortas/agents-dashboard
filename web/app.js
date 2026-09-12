// Holds the UI state, connects to the server, and wires the components.

import { connect } from './api.js';
import { createTopbar } from './topbar.js';
import { createSidebar } from './sidebar.js';
import { createBell } from './bell.js';
import { createCanvas } from './canvas.js';
import { isActive, sameFolder } from '/shared/status.js';
import { reconcile, tidy } from '/shared/tiling.js';
import { mergeLayouts } from '/shared/layout-sync.js';

const PREFS_KEY = 'agents-dashboard-ui';
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
  tab: 'code',
  focusedPanelId: null,
  maximizedPanelId: null,
  collapsedProjects: new Set(prefs.collapsedProjects ?? []),
  sidebarCollapsed: Boolean(prefs.sidebarCollapsed),
  selectedWorkspace: prefs.selectedWorkspace ?? null,
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
      collapsedProjects: [...model.collapsedProjects],
      sidebarCollapsed: model.sidebarCollapsed,
      selectedWorkspace: model.selectedWorkspace,
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

  addProject() {
    api.send('project:add');
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

  splitPanel(panel, direction) {
    actions.createPanel(panel.agentId, panel.cwd, { nextTo: panel.id, direction });
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
const sidebar = createSidebar(byId('sidebar'), actions);
const canvas = createCanvas(byId('canvas'), byId('empty'), actions);

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

  const path = currentWorkspace();
  model.selectedWorkspace = path;
  model.layout = computeLayout(path);

  byId('empty-title').textContent = path ? 'No agents in this folder yet' : 'No workspace yet';
  byId('empty-text').textContent = path
    ? 'Hover the folder on the left and click + to start one.'
    : 'Click + next to Workspaces to add a project folder.';

  const unread = model.state?.unread ?? 0;
  document.title = unread ? `(${unread}) Agents Dashboard` : 'Agents Dashboard';
  topbar.render(model);
  bell.render(model);
  sidebar.render(model);
  canvas.render(model);
  syncLayout(path);
}

render();

const api = connect({
  onMessage(message) {
    if (message.type === 'state') {
      model.state = message;
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
