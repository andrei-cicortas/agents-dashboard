// Opens the native Windows folder picker through PowerShell (signed, so Smart
// App Control allows it) and returns the chosen folder, or null if cancelled.

import { execFile } from 'node:child_process';

const MARKER = 'PICKED:';

// C# helper compiled via Add-Type: finds the "#32770" (Browse For Folder)
// dialog window that belongs to this PowerShell process, so a WinForms Timer
// can push it to the front while ShowDialog runs its modal message loop.
const DIALOG_FRONT_HELPER = `Add-Type @'
using System;
using System.Runtime.InteropServices;

public class DialogFront {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string lpszClass, string lpszWindow);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    public static IntPtr FindDialogWindow(uint pid) {
        IntPtr hWnd = IntPtr.Zero;
        while (true) {
            hWnd = FindWindowEx(IntPtr.Zero, hWnd, "#32770", null);
            if (hWnd == IntPtr.Zero) { return IntPtr.Zero; }
            uint windowPid;
            GetWindowThreadProcessId(hWnd, out windowPid);
            if (windowPid == pid) { return hWnd; }
        }
    }
}
'@`;

export function pickerScript() {
  return [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    DIALOG_FRONT_HELPER,
    // Windows' foreground lock keeps a background process from raising its own
    // window, so an owner form being TopMost is not enough. Poll for the
    // dialog while it is open and force it to the front once it exists.
    '$HWND_TOPMOST = [IntPtr]::new(-1)',
    '$SWP_NOMOVE = 0x0002',
    '$SWP_NOSIZE = 0x0001',
    '$SWP_SHOWWINDOW = 0x0040',
    '$currentPid = [uint32]$PID',
    '$dialogTimer = New-Object System.Windows.Forms.Timer',
    '$dialogTimer.Interval = 100',
    '$dialogTimer.Add_Tick({',
    '  $dialogHwnd = [DialogFront]::FindDialogWindow($currentPid)',
    '  if ($dialogHwnd -ne [IntPtr]::Zero) {',
    '    [DialogFront]::SetWindowPos($dialogHwnd, $HWND_TOPMOST, 0, 0, 0, 0, ($SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW)) | Out-Null',
    '    [DialogFront]::SetForegroundWindow($dialogHwnd) | Out-Null',
    '    $dialogTimer.Stop()',
    '  }',
    '})',
    '$dialogTimer.Start()',
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
    '$dialogTimer.Stop()',
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
