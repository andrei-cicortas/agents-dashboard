// Creates a throwaway setup in test/.tmp/dev for trying the UI without real
// agents and without the native folder picker.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const devDir = path.join(root, 'test', '.tmp', 'dev');
const workspace = path.join(devDir, 'workspace one');
const fixture = (name) => path.join(root, 'test', 'fixtures', name);

fs.rmSync(devDir, { recursive: true, force: true });
fs.mkdirSync(workspace, { recursive: true });

fs.writeFileSync(path.join(devDir, 'agents.json'), JSON.stringify([
  {
    id: 'test',
    name: 'Test Agent',
    command: 'node',
    startArgs: [fixture('notify-agent.js')],
    resumeArgs: [fixture('notify-agent.js')],
    installHint: 'Node.js is required.',
  },
  {
    id: 'missing',
    name: 'Missing Agent',
    command: 'definitely-not-installed-xyz',
    startArgs: [],
    resumeArgs: [],
    installHint: 'This agent is missing on purpose, to show the install hint.',
  },
], null, 2));

fs.writeFileSync(path.join(devDir, 'state.json'), JSON.stringify({
  projects: [{ path: workspace, name: 'workspace one', pinned: true }],
  panels: [],
  notifications: [],
}, null, 2));

console.log(`Dev setup ready in ${devDir}`);
