import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAgents,
  findAgent,
  fillArgs,
  quoteArg,
  buildLaunch,
  toForwardSlashes,
  claudeHooksSettings,
  codexNotifyValue,
  withCustomAgents,
} from '../server/agents-config.js';

const configPath = fileURLToPath(new URL('../config/agents.json', import.meta.url));
const nodePath = 'D:\\node.exe';
const hookClientPath = 'C:\\Claude\\Agents Dasboard\\server\\hook-client.js';
const hookCommand = [nodePath, hookClientPath];

test('loadAgents reads Claude Code and Codex from config/agents.json', () => {
  const agents = loadAgents(configPath);
  assert.deepEqual(agents.map((a) => a.id), ['claude', 'codex']);
});

test('loadAgents rejects an invalid definition', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents config '));
  const file = path.join(dir, 'agents.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'x', name: 'X', command: 'x', startArgs: 'nope', resumeArgs: [], installHint: 'h' }]));
  assert.throws(() => loadAgents(file), /Invalid agent definition at index 0/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('findAgent throws for an unknown id', () => {
  assert.throws(() => findAgent(loadAgents(configPath), 'gemini'), /Unknown agent: gemini/);
});

test('fillArgs replaces placeholders and rejects unknown ones', () => {
  assert.deepEqual(fillArgs(['--session-id', '{sessionId}', 'x{sessionId}y'], { sessionId: 'abc' }), ['--session-id', 'abc', 'xabcy']);
  assert.throws(() => fillArgs(['{nope}'], {}), /Unknown placeholder: \{nope\}/);
});

test('quoteArg quotes only when needed', () => {
  assert.equal(quoteArg('plain'), 'plain');
  assert.equal(quoteArg('with space'), '"with space"');
  assert.equal(quoteArg('C:\\my folder\\'), '"C:\\my folder\\\\"');
  assert.equal(quoteArg(''), '""');
  assert.equal(quoteArg('a&b'), '"a&b"');
});

test('buildLaunch builds a Claude start command line', () => {
  const claude = findAgent(loadAgents(configPath), 'claude');
  const launch = buildLaunch(claude, 'start', {
    sessionId: '11111111-2222-3333-4444-555555555555',
    claudeHooksFile: 'C:\\Users\\user\\AppData\\Roaming\\agents-dashboard\\claude-hooks.json',
    codexNotify: 'unused',
  });
  assert.equal(launch.file, 'cmd.exe');
  assert.equal(
    launch.commandLine,
    '/d /s /c "claude --session-id 11111111-2222-3333-4444-555555555555 --settings C:\\Users\\user\\AppData\\Roaming\\agents-dashboard\\claude-hooks.json"',
  );
});

test('buildLaunch builds a Codex resume command line with a quoted notify value', () => {
  const codex = findAgent(loadAgents(configPath), 'codex');
  const launch = buildLaunch(codex, 'resume', {
    // Codex is resumed by the id of the conversation this panel opened, not by
    // "the most recent one here", which every panel on the folder would share.
    sessionId: 'codex-abc',
    claudeHooksFile: 'unused',
    codexNotify: codexNotifyValue({ hookCommand }),
  });
  assert.equal(
    launch.commandLine,
    `/d /s /c "codex resume codex-abc -c "notify=['D:/node.exe','C:/Claude/Agents Dasboard/server/hook-client.js','codex']""`,
  );
});

test('buildLaunch rejects characters cmd.exe cannot pass safely', () => {
  const agent = { id: 'a', name: 'A', command: 'a', startArgs: ['{sessionId}'], resumeArgs: [], installHint: 'h' };
  assert.throws(() => buildLaunch(agent, 'start', { sessionId: 'has"quote' }), /cannot pass safely/);
  assert.throws(() => buildLaunch(agent, 'start', { sessionId: '%PATH%' }), /cannot pass safely/);
});

test('buildLaunch rejects an unknown mode', () => {
  const agent = { id: 'a', name: 'A', command: 'a', startArgs: [], resumeArgs: [], installHint: 'h' };
  assert.throws(() => buildLaunch(agent, 'restart', {}), /Unknown launch mode: restart/);
});

test('toForwardSlashes converts Windows separators', () => {
  assert.equal(toForwardSlashes('C:\\a b\\c.js'), 'C:/a b/c.js');
});

test('claudeHooksSettings registers Stop and Notification hooks', () => {
  const settings = claudeHooksSettings({ hookCommand });
  const command = (event) => settings.hooks[event][0].hooks[0];
  assert.deepEqual(command('Stop'), {
    type: 'command',
    command: '"D:/node.exe" "C:/Claude/Agents Dasboard/server/hook-client.js" claude finished',
  });
  assert.equal(command('Notification').command, '"D:/node.exe" "C:/Claude/Agents Dasboard/server/hook-client.js" claude needs-input');
  // Only real questions count as "needs your input", not the idle reminder.
  assert.equal(settings.hooks.Notification[0].matcher, 'permission_prompt|elicitation_dialog');
  assert.equal(Object.hasOwn(settings.hooks.Stop[0], 'matcher'), false);
});

test('claudeHooksSettings runs the desktop app itself when given its --hook command', () => {
  const settings = claudeHooksSettings({ hookCommand: ['C:\\Programs\\Agents Dashboard\\Agents Dashboard.exe', '--hook'] });
  assert.equal(
    settings.hooks.Stop[0].hooks[0].command,
    '"C:/Programs/Agents Dashboard/Agents Dashboard.exe" "--hook" claude finished',
  );
});

test('withCustomAgents adds the user\'s agents and lets them replace a built-in one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-agents-'));
  const file = path.join(dir, 'custom-agents.json');
  const builtIn = loadAgents(configPath);
  assert.equal(withCustomAgents(builtIn, file), builtIn);

  // Saved by Notepad, byte order mark and all.
  fs.writeFileSync(file, '﻿' + JSON.stringify([
    { id: 'gemini', name: 'Gemini CLI', command: 'gemini', startArgs: [], resumeArgs: [], installHint: 'Install Gemini CLI' },
    { id: 'codex', name: 'My Codex', command: 'codex', startArgs: [], resumeArgs: [], installHint: 'h' },
  ]));
  const agents = withCustomAgents(builtIn, file);
  assert.deepEqual(agents.map((agent) => agent.name), ['Claude Code', 'Gemini CLI', 'My Codex']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('withCustomAgents skips a broken file rather than stopping the app', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-agents-'));
  const file = path.join(dir, 'custom-agents.json');
  const builtIn = loadAgents(configPath);
  const logged = [];
  fs.writeFileSync(file, '[{ "id": "half" ');
  assert.equal(withCustomAgents(builtIn, file, { log: (text) => logged.push(text) }), builtIn);
  fs.writeFileSync(file, JSON.stringify([{ id: 'no-command', name: 'x' }]));
  assert.equal(withCustomAgents(builtIn, file, { log: (text) => logged.push(text) }), builtIn);
  assert.equal(logged.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('codexNotifyValue rejects paths with single quotes', () => {
  assert.throws(() => codexNotifyValue({ hookCommand: [nodePath, "C:\\it's\\hook.js"] }), /single quotes/);
});
