// The desktop app: runs the dashboard server inside itself and shows it in one
// window. Closing the window leaves the app by the clock with the agents still
// working; Quit there, or "Stop all agents and close" in the app, stops them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app, BrowserWindow, Menu, clipboard, Notification, Tray, dialog, ipcMain, nativeImage, nativeTheme, screen, session, shell,
} from 'electron';
import { DEFAULT_PORT, startServer } from '../server/index.js';
import {
  MIN_HEIGHT, MIN_WIDTH, chromeFrom, isNotificationId, nextZoom, placeWindow, readWindowState, writeWindowState,
} from './window-state.js';

const APP_ID = 'com.andreinog17.agentsdashboard';
const APP_NAME = 'Agents Dashboard';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ICON = path.join(ROOT, 'assets', 'icon.ico');
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;

// DASHBOARD_DATA_DIR gives a trial run its own state, window and lock, so it
// can never touch the real app's (see "Trying the UI" in the README).
const dataDir = process.env.DASHBOARD_DATA_DIR || path.join(app.getPath('appData'), 'agents-dashboard');
const windowFile = path.join(dataDir, 'window.json');
fs.mkdirSync(dataDir, { recursive: true });
// The page engine's own files are a cache, so they live in Local, not Roaming.
app.setPath('userData', process.env.DASHBOARD_DATA_DIR
  ? path.join(dataDir, 'electron')
  : path.join(app.getPath('home'), 'AppData', 'Local', 'agents-dashboard', 'electron'));
app.setAppUserModelId(APP_ID);

// An installed app has no console, so what the server says goes to files.
if (app.isPackaged) {
  const out = fs.createWriteStream(path.join(dataDir, 'server.log'), { flags: 'a' });
  const err = fs.createWriteStream(path.join(dataDir, 'server-error.log'), { flags: 'a' });
  const line = (args) => `${new Date().toISOString()} ${args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' ')}\n`;
  console.log = (...args) => out.write(line(args));
  console.warn = (...args) => err.write(line(args));
  console.error = (...args) => err.write(line(args));
}

// One mistake must not take every running agent down with it.
process.on('uncaughtException', (error) => console.error('Uncaught:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

// Already running: that copy comes to the front (second-instance below).
const firstInstance = app.requestSingleInstanceLock();
if (!firstInstance) app.exit(0);

let win = null;
let tray = null;
let server = null;
let appOrigin = null;
let saved = readWindowState(windowFile);
let chrome = saved.chrome;
let updateReady = null;
let stopping = null;
let stopped = false;
let quitting = false;
let pageLoaded = false;
let pendingNotification = null;
// Started with Windows: wait by the clock until asked for (see trayMenu).
let startHidden = process.argv.includes('--hidden');
// The latest notifications are kept: one that is let go of no longer hears a
// click, even from the notification centre.
const shownNotifications = [];
const KEEP_NOTIFICATIONS = 20;

function warn(text) {
  dialog.showMessageBoxSync({ type: 'error', title: APP_NAME, message: text });
}

// ---- The server ------------------------------------------------------------

async function isDashboard(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return (await response.json())?.app === 'agents-dashboard';
  } catch {
    return false;
  }
}

// What agents run when they finish. The installed app runs the hook client
// itself (app/main.js); `electron .` needs to be told where the app is.
function hookCommand() {
  return app.isPackaged ? [process.execPath, '--hook'] : [process.execPath, app.getAppPath(), '--hook'];
}

async function startDashboard() {
  const port = Number(process.env.DASHBOARD_SERVER_PORT || DEFAULT_PORT);
  const options = {
    stateFile: path.join(dataDir, 'state.json'),
    agentsFile: process.env.DASHBOARD_AGENTS_FILE || undefined,
    hookCommand: hookCommand(),
    // "Stop all agents and close" in the app stops the server first.
    onStop: () => app.quit(),
  };
  try {
    return await startServer({ ...options, port });
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
  }
  // Two servers on one state.json would undo each other's work.
  if (await isDashboard(port)) {
    warn('Agents Dashboard is already running outside this app — started by the old shortcut, or by npm run server.\n\n'
      + 'Stop it there (Settings → Stop all agents and close), then open the app again.');
    app.exit(1);
    return null;
  }
  // Some other program has the usual port; any free one will do.
  return startServer({ ...options, port: 0 });
}

function stopDashboard() {
  stopping ??= (server ? server.stop() : Promise.resolve()).catch((error) => console.error('Stop failed:', error));
  return stopping;
}

// ---- The window ------------------------------------------------------------

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getNormalBounds();
  saved = { ...saved, bounds, maximized: win.isMaximized(), zoom: win.webContents.getZoomFactor(), chrome };
  try {
    writeWindowState(windowFile, saved);
  } catch (error) {
    console.error('Could not save window.json:', error);
  }
}

function applyChrome() {
  nativeTheme.themeSource = chrome.dark ? 'dark' : 'light';
  win?.setBackgroundColor(chrome.background);
}

function showWindow() {
  if (!appOrigin) return;
  startHidden = false;
  // Gone some way other than its close button (which only hides it).
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendToPage(message) {
  if (win && !win.isDestroyed()) win.webContents.send('window-message', message);
}

// A clicked notification opens what it was about; one clicked while the page
// is still loading goes as soon as the page is up.
function openNotification(id) {
  showWindow();
  if (pageLoaded) sendToPage({ type: 'open-notification', id });
  else pendingNotification = id;
}

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, icon: ICON });
  shownNotifications.push(notification);
  if (shownNotifications.length > KEEP_NOTIFICATIONS) shownNotifications.shift();
  if (onClick) notification.on('click', onClick);
  notification.show();
}

function isLookedAt() {
  return Boolean(win?.isVisible() && !win.isMinimized() && win.isFocused());
}

function openOutside(address) {
  try {
    const url = new URL(address);
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) shell.openExternal(url.href);
  } catch {
    // Not an address.
  }
}

function isAppAddress(address) {
  try {
    return new URL(address).origin === appOrigin;
  } catch {
    return false;
  }
}

const handlers = {
  'window:theme'(message) {
    const next = chromeFrom(message);
    if (!next) return;
    chrome = next;
    applyChrome();
  },
  'window:close'() {
    app.quit();
  },
  'window:zoom'(message) {
    win.webContents.setZoomFactor(nextZoom(win.webContents.getZoomFactor(), Number(message.step) || 0));
  },
  // The unread count as a red badge on the taskbar button, drawn by the page
  // (app/preload.cjs) since only it has a canvas.
  'window:badge'(message) {
    const count = Math.max(0, Number(message.count) || 0);
    const image = count > 0 && typeof message.image === 'string' && message.image.startsWith('data:image/png;base64,')
      ? nativeImage.createFromDataURL(message.image)
      : null;
    win.setOverlayIcon(image, count ? `${count} unread` : '');
    tray?.setToolTip(count ? `${APP_NAME} — ${count} unread` : APP_NAME);
  },
  'window:notify'(message) {
    if (isLookedAt() || typeof message.text !== 'string' || !message.text) return;
    const id = isNotificationId(message.id) ? message.id : null;
    notify(APP_NAME, message.text.slice(0, 500), () => (id ? openNotification(id) : showWindow()));
  },
  'window:attention'() {
    if (!isLookedAt()) win.flashFrame(true);
  },
};

function receivePageMessage(event, message) {
  // Only the dashboard itself, never a web page shown inside one of its panes.
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
  if (!isAppAddress(event.senderFrame.url)) return;
  handlers[message?.type]?.(message);
}

// The page engine's right-click menu would offer nothing on most of the page;
// text boxes and selected text get the usual editing commands.
function showContextMenu(params) {
  const items = [];
  for (const suggestion of params.dictionarySuggestions.slice(0, 4)) {
    items.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) });
  }
  if (items.length) items.push({ type: 'separator' });
  if (params.isEditable) {
    items.push({ role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' });
  } else if (params.selectionText) {
    items.push({ role: 'copy' });
  }
  if (params.linkURL && /^(https?|mailto):/.test(params.linkURL)) {
    items.push({ label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) });
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
}

function createWindow() {
  const primary = screen.getPrimaryDisplay().workArea;
  const bounds = placeWindow(saved.bounds, screen.getAllDisplays().map((display) => display.workArea), primary);
  win = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_NAME,
    icon: ICON,
    show: false,
    backgroundColor: chrome.background,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'app', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  applyChrome();
  if (saved.maximized) win.maximize();

  const contents = win.webContents;
  contents.setZoomFactor(saved.zoom);
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isAppAddress(url)) return;
    event.preventDefault();
    openOutside(url);
  });
  contents.on('context-menu', (event, params) => showContextMenu(params));
  contents.on('did-start-loading', () => { pageLoaded = false; });
  contents.on('did-finish-load', () => {
    pageLoaded = true;
    contents.setZoomFactor(saved.zoom);
    if (pendingNotification) {
      sendToPage({ type: 'open-notification', id: pendingNotification });
      pendingNotification = null;
    }
  });
  // No menu bar means none of a browser's shortcuts: Ctrl+F, Ctrl+N and the
  // rest belong to the page. F12 opens DevTools when not installed.
  contents.on('before-input-event', (event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') contents.toggleDevTools();
  });
  contents.on('render-process-gone', (event, details) => {
    console.error('The page stopped:', details.reason);
    if (details.reason !== 'clean-exit') contents.reload();
  });

  win.on('focus', () => win.flashFrame(false));
  win.on('closed', () => {
    win = null;
    pageLoaded = false;
  });
  win.on('close', (event) => {
    saveWindowState();
    if (quitting) return;
    // Closing hides: the agents keep working, and the app waits by the clock.
    event.preventDefault();
    win.hide();
    if (!saved.trayHintShown) {
      saved = { ...saved, trayHintShown: true };
      saveWindowState();
      notify(`${APP_NAME} is still running`, 'Your agents keep working. Open it again from the icon by the clock, or Quit there to stop them.', showWindow);
    }
  });
  win.once('ready-to-show', () => {
    if (!startHidden) win.show();
  });

  contents.loadURL(appOrigin);
}

// ---- The icon by the clock -------------------------------------------------

function confirmQuit() {
  const options = {
    type: 'question',
    title: APP_NAME,
    message: 'Quit Agents Dashboard?',
    detail: 'Every agent that is running stops. Their conversations can be picked up again next time.',
    buttons: ['Quit', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const response = win?.isVisible() ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options);
  return response === 0;
}

function trayMenu() {
  const items = [
    { label: `Open ${APP_NAME}`, click: showWindow },
    { type: 'separator' },
  ];
  if (app.isPackaged) {
    items.push({
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
        tray.setContextMenu(trayMenu());
      },
    });
  }
  if (updateReady) {
    items.push({ label: `Restart to update to ${updateReady.version}`, click: () => updateReady.install() });
  }
  items.push({ type: 'separator' }, { label: 'Quit', click: () => { if (confirmQuit()) app.quit(); } });
  return Menu.buildFromTemplate(items);
}

function createTray() {
  tray = new Tray(ICON);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(trayMenu());
  tray.on('click', showWindow);
}

// ---- Updates ---------------------------------------------------------------

// New versions come from the project's GitHub releases. One that has been
// downloaded installs whenever the app is next quit, or at once from the menu.
async function startUpdates() {
  if (!app.isPackaged || process.env.DASHBOARD_NO_UPDATES) return;
  const { default: updater } = await import('electron-updater');
  const { autoUpdater } = updater;
  autoUpdater.logger = { info: console.log, warn: console.warn, error: console.error, debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = {
      version: info.version,
      install: () => {
        if (confirmQuit()) autoUpdater.quitAndInstall();
      },
    };
    tray?.setContextMenu(trayMenu());
    notify(`Version ${info.version} is ready`, 'It installs the next time you quit, or now from the icon by the clock.');
  });
  autoUpdater.on('error', (error) => console.error('Update failed:', error?.message ?? error));
  const check = () => autoUpdater.checkForUpdates().catch((error) => console.error('Update check failed:', error?.message ?? error));
  check();
  setInterval(check, UPDATE_EVERY_MS);
}

// ---- The app ---------------------------------------------------------------

app.on('second-instance', showWindow);

// Quitting stops the agents first, whatever asked for it: the menu, the app's
// own Stop button, Windows shutting down, or an update being installed.
app.on('before-quit', (event) => {
  quitting = true;
  if (stopped) return;
  event.preventDefault();
  saveWindowState();
  stopDashboard().finally(() => {
    stopped = true;
    app.quit();
  });
});

// Nothing to do when the window closes: closing it only hides it.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  if (!firstInstance) return;
  Menu.setApplicationMenu(null);
  server = await startDashboard();
  if (!server) return;
  appOrigin = `http://127.0.0.1:${server.port}`;

  // The page may use the clipboard; a web page inside a pane may only write to it.
  const allowed = (permission, origin) => (origin === appOrigin
    ? ['clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen'].includes(permission)
    : ['clipboard-sanitized-write', 'fullscreen'].includes(permission));
  const originOf = (address) => {
    try {
      return new URL(address).origin;
    } catch {
      return null;
    }
  };
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed(permission, originOf(details.requestingUrl)));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => allowed(permission, originOf(origin)));

  ipcMain.on('page-message', receivePageMessage);
  createTray();
  createWindow();
  startUpdates();
}).catch((error) => {
  console.error('Could not start:', error);
  warn(`Agents Dashboard could not start.\n\n${error.message}\n\nDetails are in ${path.join(dataDir, 'server-error.log')}`);
  app.exit(1);
});
