// Opens the native Windows folder picker through PowerShell (signed, so Smart
// App Control allows it) and returns the chosen folder, or null if cancelled.

import { execFile } from 'node:child_process';

const MARKER = 'PICKED:';

export function pickerScript() {
  return [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    // An invisible top-most owner window keeps the dialog in front of the app.
    '$owner = New-Object System.Windows.Forms.Form',
    '$owner.TopMost = $true',
    '$owner.ShowInTaskbar = $false',
    '$owner.Opacity = 0',
    '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual',
    '$owner.Location = New-Object System.Drawing.Point(-32000, -32000)',
    '$owner.Show()',
    '$owner.Activate()',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Choose a project folder for Agents Dashboard'",
    '$dialog.ShowNewFolderButton = $true',
    `if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write('${MARKER}' + $dialog.SelectedPath) }`,
    '$owner.Close()',
  ].join('\n');
}

export function encodeCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export function parsePickerOutput(stdout) {
  const index = stdout.indexOf(MARKER);
  if (index === -1) return null;
  const picked = stdout.slice(index + MARKER.length).trim();
  return picked === '' ? null : picked;
}

export function pickFolder({ run = runPowerShell } = {}) {
  return run(encodeCommand(pickerScript())).then(parsePickerOutput, () => null);
}

function runPowerShell(encoded) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}
