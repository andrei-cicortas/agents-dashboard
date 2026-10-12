// Run by agents (Claude Code hooks, Codex notify) when they finish or need
// input. Tells the dashboard server. It must never block or fail the agent,
// so every error is swallowed and it always exits with code 0.

import http from 'node:http';
import { pathToFileURL } from 'node:url';

const TIMEOUT_MS = 2000;

export function eventFromArgs(args) {
  const [agent, ...rest] = args;
  if (agent === 'claude') {
    return rest[0] === 'finished' || rest[0] === 'needs-input' ? rest[0] : null;
  }
  if (agent === 'codex') {
    // Codex appends a JSON description of the event as the last argument.
    try {
      const payload = JSON.parse(rest[rest.length - 1]);
      return payload.type === 'agent-turn-complete' ? 'finished' : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function sendHook({ port, token, panelId, event, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ panelId, event });
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/hook',
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Dashboard-Token': token,
      },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(true));
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
    request.end(body);
  });
}

// args are what follows the script: "claude finished", or "codex" and its JSON.
// The desktop app calls this itself when it is started with --hook.
export async function main(args = process.argv.slice(2)) {
  setTimeout(() => process.exit(0), TIMEOUT_MS + 1000).unref();
  const { AGENTS_DASHBOARD_PORT: port, AGENTS_DASHBOARD_TOKEN: token, AGENTS_DASHBOARD_PANEL_ID: panelId } = process.env;
  const event = eventFromArgs(args);
  if (event && port && token && panelId) {
    await sendHook({ port: Number(port), token, panelId, event });
  }
  process.exit(0);
}

const invokedDirectly = process.argv[1]
  && import.meta.url.toLowerCase() === pathToFileURL(process.argv[1]).href.toLowerCase();
if (invokedDirectly) main();
