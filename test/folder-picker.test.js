import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pickerScript, encodeCommand, parsePickerOutput, pickFolder } from '../server/folder-picker.js';

test('pickerScript uses the Windows folder dialog', () => {
  const script = pickerScript();
  assert.match(script, /FolderBrowserDialog/);
  assert.match(script, /PICKED:/);
});

test('pickerScript brings the dialog window to the front instead of leaving it hidden behind the app', () => {
  const script = pickerScript();
  assert.match(script, /#32770/);
  assert.match(script, /SetWindowPos/);
  assert.match(script, /HWND_TOPMOST/);
  assert.match(script, /-1/);
  assert.match(script, /SetForegroundWindow/);
  assert.match(script, /System\.Windows\.Forms\.Timer/);
});

test('pickerScript is valid PowerShell (parse check only, never executed)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents dashboard picker '));
  const scriptPath = path.join(dir, 'picker.ps1');
  try {
    fs.writeFileSync(scriptPath, pickerScript(), 'utf8');
    const { exitCode, output } = await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${scriptPath}', [ref]$null, [ref]$errors) | Out-Null; if ($errors.Count) { $errors | ForEach-Object { $_.Message }; exit 1 }`,
        ],
        { windowsHide: true, encoding: 'utf8' },
        (error, stdout, stderr) => {
          resolve({ exitCode: error ? (error.code ?? 1) : 0, output: stdout + stderr });
        },
      );
    });
    assert.equal(exitCode, 0, `PowerShell parse errors:\n${output}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('encodeCommand produces base64 UTF-16LE for -EncodedCommand', () => {
  const encoded = encodeCommand("Write-Output 'ă'");
  assert.equal(Buffer.from(encoded, 'base64').toString('utf16le'), "Write-Output 'ă'");
});

test('parsePickerOutput returns the chosen path or null', () => {
  assert.equal(parsePickerOutput('PICKED:C:\\My Games\\space game\r\n'), 'C:\\My Games\\space game');
  assert.equal(parsePickerOutput(''), null);
  assert.equal(parsePickerOutput('PICKED:   '), null);
});

test('pickFolder returns the path from PowerShell output', async () => {
  const picked = await pickFolder({ run: async () => 'PICKED:C:\\Projects\\site' });
  assert.equal(picked, 'C:\\Projects\\site');
});

test('pickFolder returns null when PowerShell fails', async () => {
  const picked = await pickFolder({ run: async () => { throw new Error('boom'); } });
  assert.equal(picked, null);
});
