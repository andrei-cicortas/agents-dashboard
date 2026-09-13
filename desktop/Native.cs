// Windows calls the app window needs and PowerShell cannot make on its own.
// Compiled at start-up by desktop/window.ps1 through Add-Type.

using System;
using System.Runtime.InteropServices;

namespace AgentsDashboard
{
    public static class Native
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("user32.dll")]
        private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        [DllImport("user32.dll")]
        private static extern bool AllowSetForegroundWindow(int processId);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hwnd, int command);

        [StructLayout(LayoutKind.Sequential)]
        private struct FlashInfo
        {
            public uint Size;
            public IntPtr Window;
            public uint Flags;
            public uint Count;
            public uint Timeout;
        }

        [DllImport("user32.dll")]
        private static extern bool FlashWindowEx(ref FlashInfo info);

        private const int DwmUseImmersiveDarkMode = 20;
        private const int DwmCaptionColor = 35;
        private const int DwmTextColor = 36;
        private static readonly IntPtr PerMonitorAwareV2 = new IntPtr(-4);

        // The taskbar groups windows, and matches them to pinned shortcuts, by
        // this ID. The shortcuts carry the same one.
        public static void SetAppId(string appId)
        {
            SetCurrentProcessExplicitAppUserModelID(appId);
        }

        // Without this a scaled laptop screen stretches the window as a bitmap
        // and everything in it is blurred. powershell.exe may already have
        // settled on an awareness through its manifest, and then only the
        // thread's own setting can still be changed.
        public static void UsePerMonitorDpi()
        {
            try
            {
                if (!SetProcessDpiAwarenessContext(PerMonitorAwareV2))
                {
                    SetThreadDpiAwarenessContext(PerMonitorAwareV2);
                }
            }
            catch (EntryPointNotFoundException)
            {
                // Older Windows: stay as we are.
            }
        }

        // Windows applies the show state the process was started with (say,
        // hidden, from powershell -WindowStyle Hidden) to the first window the
        // process shows. Spending that first call on a window that is not
        // visible yet keeps the real one from starting out hidden.
        public static void ConsumeStartupShowState(IntPtr hwnd)
        {
            ShowWindow(hwnd, 0); // SW_HIDE
        }

        // Called by a second launch before it hands over to the open window,
        // so that window is allowed to come to the front.
        public static void AllowAnyForeground()
        {
            AllowSetForegroundWindow(-1);
        }

        public static bool BringToFront(IntPtr hwnd)
        {
            SetForegroundWindow(hwnd);
            return GetForegroundWindow() == hwnd;
        }

        public static bool IsForeground(IntPtr hwnd)
        {
            return GetForegroundWindow() == hwnd;
        }

        // Colours the title bar to match the page under it. Colours are
        // 0xRRGGBB; Windows wants them the other way round. Versions before
        // Windows 11 ignore the colours and keep only light or dark.
        public static void SetTitleBar(IntPtr hwnd, bool dark, int captionRgb, int textRgb)
        {
            int darkMode = dark ? 1 : 0;
            DwmSetWindowAttribute(hwnd, DwmUseImmersiveDarkMode, ref darkMode, sizeof(int));
            int caption = ToColorRef(captionRgb);
            DwmSetWindowAttribute(hwnd, DwmCaptionColor, ref caption, sizeof(int));
            int text = ToColorRef(textRgb);
            DwmSetWindowAttribute(hwnd, DwmTextColor, ref text, sizeof(int));
        }

        // Flashes the taskbar button until the window is brought to the front.
        public static void FlashUntilFocused(IntPtr hwnd)
        {
            FlashInfo info = new FlashInfo();
            info.Size = (uint)Marshal.SizeOf(typeof(FlashInfo));
            info.Window = hwnd;
            info.Flags = 0x2 | 0xC; // FLASHW_TRAY | FLASHW_TIMERNOFG
            info.Count = 0;
            info.Timeout = 0;
            FlashWindowEx(ref info);
        }

        private static int ToColorRef(int rgb)
        {
            return ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF);
        }
    }
}
