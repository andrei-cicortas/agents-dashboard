// Holds the UI state, connects to the server, and wires the components.

import { connect } from './api.js';
import { createTopbar } from './topbar.js';
import { createSidebar } from './sidebar.js';
import { createBell } from './bell.js';
import { createGrid } from './grid.js';
import { isActive } from '/shared/status.js';

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
};

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      collapsedProjects: [...model.collapsedProjects],
      sidebarCollapsed: model.sidebarCollapsed,
    }));
  } catch {
    // Preferences are a convenience; ignore storage errors.
  }
}

const findPanel = (panelId) => model.state?.panels.find((panel) => panel.id === panelId);

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

  createPanel(agentId, cwd) {
    model.tab = 'code';
    model.maximizedPanelId = null;
    api.send('panel:create', { agentId, cwd });
    render();
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
    const changed = model.focusedPanelId !== panelId
      || model.tab !== 'code'
      || (model.maximizedPanelId && model.maximizedPanelId !== panelId);
    if (!changed) return;
    model.tab = 'code';
    if (model.maximizedPanelId !== panelId) model.maximizedPanelId = null;
    if (model.focusedPanelId !== panelId) {
      model.focusedPanelId = panelId;
      syncFocus();
    }
    render();
    grid.reveal(panelId);
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
const grid = createGrid(byId('grid'), byId('empty'), actions);

function render() {
  byId('app').classList.toggle('sidebar-collapsed', model.sidebarCollapsed);
  byId('code-view').hidden = model.tab !== 'code';
  byId('agent-view').hidden = model.tab !== 'agent';
  byId('chat-view').hidden = model.tab !== 'chat';
  const unread = model.state?.unread ?? 0;
  document.title = unread ? `(${unread}) Agents Dashboard` : 'Agents Dashboard';
  topbar.render(model);
  bell.render(model);
  sidebar.render(model);
  grid.render(model);
}

render();

const api = connect({
  onMessage(message) {
    if (message.type === 'state') {
      model.state = message;
      if (model.focusedPanelId && !findPanel(model.focusedPanelId)) {
        model.focusedPanelId = null;
        syncFocus();
      }
      if (model.maximizedPanelId && !findPanel(model.maximizedPanelId)) model.maximizedPanelId = null;
      render();
    } else if (message.type === 'panel:data') {
      grid.write(message.panelId, message.data);
    } else if (message.type === 'panel:replay') {
      grid.replay(message.panelId, message.data);
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
