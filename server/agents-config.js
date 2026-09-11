// Turns the agent definitions in config/agents.json into Windows command lines.
// Agents run through `cmd.exe /d /s /c "..."` so both .exe (Claude) and .cmd
// (npm-installed Codex) commands resolve the same way.

import fs from 'node:fs';

const REQUIRED_STRINGS = ['id', 'name', 'command', 'installHint'];
const REQUIRED_ARRAYS = ['startArgs', 'resumeArgs'];

export function loadAgents(filePath) {
  const agents = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(agents)) throw new Error('Agent definitions must be a JSON array');
  agents.forEach((agent, index) => {
    const valid = agent
      && REQUIRED_STRINGS.every((key) => typeof agent[key] === 'string' && agent[key] !== '')
      && REQUIRED_ARRAYS.every((key) => Array.isArray(agent[key]) && agent[key].every((arg) => typeof arg === 'string'));
    if (!valid) throw new Error(`Invalid agent definition at index ${index}`);
  });
  return agents;
}

export function findAgent(agents, id) {
  const agent = agents.find((candidate) => candidate.id === id);
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  return agent;
}

export function fillArgs(args, values) {
  return args.map((arg) => arg.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Unknown placeholder: ${match}`);
    return String(values[key]);
  }));
}

export function quoteArg(arg) {
  if (arg !== '' && !/[\s&|<>^]/.test(arg)) return arg;
  // Backslashes right before the closing quote must be doubled.
  return `"${arg.replace(/(\\+)$/, '$1$1')}"`;
}

function assertSafeForCmd(arg) {
  // cmd.exe expands %VAR% even inside quotes, and embedded quotes break its parsing.
  if (/["%\r\n]/.test(arg)) {
    throw new Error(`Argument contains a character cmd.exe cannot pass safely: ${arg}`);
  }
}

export function buildLaunch(agent, mode, values) {
  if (mode !== 'start' && mode !== 'resume') throw new Error(`Unknown launch mode: ${mode}`);
  const template = mode === 'resume' ? agent.resumeArgs : agent.startArgs;
  const parts = [agent.command, ...fillArgs(template, values)];
  parts.forEach(assertSafeForCmd);
  return { file: 'cmd.exe', commandLine: `/d /s /c "${parts.map(quoteArg).join(' ')}"` };
}

export function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

export function claudeHooksSettings({ nodePath, hookClientPath }) {
  const base = `"${toForwardSlashes(nodePath)}" "${toForwardSlashes(hookClientPath)}" claude`;
  const hook = (event) => [{ hooks: [{ type: 'command', command: `${base} ${event}` }] }];
  return { hooks: { Stop: hook('finished'), Notification: hook('needs-input') } };
}

export function codexNotifyValue({ nodePath, hookClientPath }) {
  const items = [nodePath, hookClientPath].map(toForwardSlashes);
  if (items.some((item) => item.includes("'"))) {
    throw new Error('Paths used for Codex notify cannot contain single quotes');
  }
  // TOML literal strings ('...') need no escaping for backslashes or spaces.
  return `[${[...items, 'codex'].map((item) => `'${item}'`).join(',')}]`;
}
