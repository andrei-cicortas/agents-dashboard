// Entry point: serves the UI files, runs the WebSocket, and wires the
// dashboard to the agent processes. Keeps running when the window closes.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createAgentManager } from './agent-manager.js';
import { loadAgents, claudeHooksSettings, codexNotifyValue } from './agents-config.js';
import { createAgentRunner } from './agent-runner.js';
import { createDashboard } from './dashboard.js';
import { pickFolder as nativePickFolder } from './folder-picker.js';
import { isAllowedHost, isAllowedOrigin, createToken, isValidToken } from './security.js';
import { createStore } from './store.js';

export const DEFAULT_PORT = 4317;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_HOOK_BODY = 10 * 1024;

const STATIC_ROUTES = [
  { prefix: '/vendor/xterm/', dir: path.join(ROOT, 'node_modules', '@xterm', 'xterm') },
  { prefix: '/vendor/addon-fit/', dir: path.join(ROOT, 'node_modules', '@xterm', 'addon-fit') },
  { prefix: '/shared/', dir: path.join(ROOT, 'shared') },
  { prefix: '/', dir: path.join(ROOT, 'web') },
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

export function resolveStaticPath(urlPath) {
  if (urlPath === '/favicon.ico') return path.join(ROOT, 'assets', 'icon.ico');
  const route = STATIC_ROUTES.find((candidate) => urlPath.startsWith(candidate.prefix));
  if (!route) return null;
  let relative;
  try {
    relative = decodeURIComponent(urlPath.slice(route.prefix.length));
  } catch {
    return null;
  }
  const filePath = path.resolve(route.dir, relative === '' ? 'index.html' : relative);
  // Never serve anything outside the route's folder.
  if (!filePath.startsWith(route.dir + path.sep)) return null;
  return filePath;
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(value));
}

export async function startServer({
  port = DEFAULT_PORT,
  stateFile = path.join(process.env.APPDATA ?? ROOT, 'agents-dashboard', 'state.json'),
  agentsFile = path.join(ROOT, 'config', 'agents.json'),
  pickFolder = nativePickFolder,
  onStop = () => {},
} = {}) {
  const token = createToken();
  const agents = loadAgents(agentsFile);
  const dataDir = path.dirname(stateFile);
  fs.mkdirSync(dataDir, { recursive: true });

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actualPort = server.address().port;

  const hookClientPath = path.join(ROOT, 'server', 'hook-client.js');
  const claudeHooksFile = path.join(dataDir, 'claude-hooks.json');
  fs.writeFileSync(claudeHooksFile, JSON.stringify(claudeHooksSettings({ nodePath: process.execPath, hookClientPath }), null, 2));

  const agentManager = createAgentManager({
    agents,
    hookValues: {
      claudeHooksFile,
      codexNotify: codexNotifyValue({ nodePath: process.execPath, hookClientPath }),
    },
    env: { ...process.env, AGENTS_DASHBOARD_PORT: String(actualPort), AGENTS_DASHBOARD_TOKEN: token },
  });

  const sockets = new Set();
  let nextClientId = 0;
  const broadcast = (message) => {
    const text = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(text);
    }
  };

  const dashboard = createDashboard({
    store: createStore(stateFile),
    agentManager,
    agentRunner: createAgentRunner(),
    agents,
    pickFolder,
    broadcast,
    requestStop: () => { stop().catch((err) => console.error('Stop failed:', err)); },
  });

  function serveStatic(pathname, res) {
    const filePath = resolveStaticPath(pathname);
    if (!filePath) return sendText(res, 404, 'Not found');
    fs.readFile(filePath, (err, content) => {
      if (err) return sendText(res, 404, 'Not found');
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(content);
    });
  }

  function handleHookRequest(req, res) {
    if (!isValidToken(req.headers['x-dashboard-token'], token)) return sendText(res, 401, 'Unauthorized');
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_HOOK_BODY) req.destroy();
    });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendText(res, 400, 'Bad request');
      }
      const accepted = dashboard.handleHook({ panelId: payload?.panelId, event: payload?.event });
      res.writeHead(accepted ? 204 : 404).end();
    });
  }

  // A path like "//[" makes new URL() throw; uncaught, that would end the
  // process and every agent running in it.
  const parsePathname = (url) => {
    try {
      return new URL(url, `http://127.0.0.1:${actualPort}`).pathname;
    } catch {
      return null;
    }
  };

  server.on('request', (req, res) => {
    if (!isAllowedHost(req.headers.host, actualPort)) return sendText(res, 403, 'Forbidden');
    const pathname = parsePathname(req.url);
    if (pathname === null) return sendText(res, 400, 'Bad request');
    if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true, app: 'agents-dashboard' });
    if (req.method === 'POST' && pathname === '/api/hook') return handleHookRequest(req, res);
    if (req.method !== 'GET') return sendText(res, 405, 'Method not allowed');
    return serveStatic(pathname, res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const pathname = parsePathname(req.url);
    if (pathname === null) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const allowed = pathname === '/ws'
      && isAllowedHost(req.headers.host, actualPort)
      && isAllowedOrigin(req.headers.origin, actualPort);
    if (!allowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const clientId = ++nextClientId;
      sockets.add(ws);
      ws.on('close', () => {
        sockets.delete(ws);
        dashboard.disconnect(clientId);
      });
      ws.on('message', (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const reply = (response) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(response));
        };
        dashboard.handleMessage(message, reply, clientId).catch((err) => console.error('Message failed:', err));
      });
    });
  });

  let stopping = null;
  function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      try {
        dashboard.shutdown();
      } catch (err) {
        // Still tell the windows and close everything below.
        console.error('Shutdown failed:', err);
      }
      broadcast({ type: 'server:stopped' });
      // Close gracefully so "server:stopped" reaches every window, then force.
      for (const socket of sockets) socket.close(1001, 'Server stopped');
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (const socket of sockets) socket.terminate();
      wss.close();
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
      onStop();
    })();
    return stopping;
  }

  dashboard.start();
  console.log(`Agents Dashboard running at http://127.0.0.1:${actualPort}`);
  return { port: actualPort, token, stop };
}

const invokedDirectly = process.argv[1]
  && import.meta.url.toLowerCase() === pathToFileURL(process.argv[1]).href.toLowerCase();

if (invokedDirectly) {
  startServer({
    port: Number(process.env.DASHBOARD_SERVER_PORT || DEFAULT_PORT),
    stateFile: process.env.DASHBOARD_STATE_FILE || undefined,
    agentsFile: process.env.DASHBOARD_AGENTS_FILE || undefined,
    onStop: () => process.exit(0),
  }).then((app) => {
    process.on('SIGINT', () => { app.stop().catch((err) => console.error('Stop failed:', err)); });
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
