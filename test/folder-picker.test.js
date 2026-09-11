import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickerScript, encodeCommand, parsePickerOutput, pickFolder } from '../server/folder-picker.js';

test('pickerScript uses the Windows folder dialog', () => {
  const script = pickerScript();
  assert.match(script, /FolderBrowserDialog/);
  assert.match(script, /PICKED:/);
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
