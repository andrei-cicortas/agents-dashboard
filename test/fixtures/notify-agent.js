// Fake agent for trying the UI: type "notify" to ask for input, "done" to
// report finished, anything else is echoed back.

import { sendHook } from '../../server/hook-client.js';

const {
  AGENTS_DASHBOARD_PORT: port,
  AGENTS_DASHBOARD_TOKEN: token,
  AGENTS_DASHBOARD_PANEL_ID: panelId,
} = process.env;

const notify = (event) => sendHook({ port: Number(port), token, panelId, event });

process.stdout.write('\x1b]0;Test agent\x07');
process.stdout.write('Test agent ready. Type "notify", "done", or anything else.\r\n');

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let index = buffer.search(/[\r\n]/);
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line === 'notify') {
      await notify('needs-input');
      process.stdout.write('Asked the dashboard for your input.\r\n');
    } else if (line === 'done') {
      await notify('finished');
      process.stdout.write('Told the dashboard I finished.\r\n');
    } else if (line !== '') {
      process.stdout.write(`You said: ${line}\r\n`);
    }
    index = buffer.search(/[\r\n]/);
  }
});
