import { test } from 'node:test';
import assert from 'node:assert/strict';
import pty from '@lydell/node-pty';

test('a pseudo-terminal runs a command through cmd.exe and exits cleanly', async () => {
  const term = pty.spawn('cmd.exe', '/d /s /c "echo hello"', {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
  });
  let output = '';
  term.onData((data) => { output += data; });
  const exitCode = await new Promise((resolve) => {
    term.onExit(({ exitCode: code }) => {
      term.kill();
      resolve(code);
    });
  });
  assert.equal(exitCode, 0);
  assert.match(output, /hello/);
});
