// Creates a throwaway setup in test/.tmp/dev for trying the UI without real
// agents and without the native folder picker.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const devDir = path.join(root, 'test', '.tmp', 'dev');
const fixture = (name) => path.join(root, 'test', 'fixtures', name);

// Enough folders, pinned and not, to see how the sidebar behaves when it is
// full rather than nearly empty.
const PINNED = ['workspace one', 'orbit-api', 'orbit-web'];
const PLAIN = ['design-system', 'billing', 'docs-site', 'infra', 'scratch'];
const folder = (name) => path.join(devDir, name);
const workspace = folder(PINNED[0]);

fs.rmSync(devDir, { recursive: true, force: true });
for (const name of [...PINNED, ...PLAIN]) fs.mkdirSync(folder(name), { recursive: true });

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
  projects: [
    ...PINNED.map((name) => ({ path: folder(name), name, pinned: true })),
    ...PLAIN.map((name) => ({ path: folder(name), name, pinned: false })),
  ],
  panels: [],
  notifications: [],
}, null, 2));

console.log(`Dev setup ready in ${devDir}`);
