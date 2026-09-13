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

        [StructLayout(LayoutKind.Sequential, Pack = 4)]
        private struct PropertyKey
        {
            public Guid FormatId;
            public uint PropertyId;
        }

        // Only the part of PROPVARIANT a string needs, padded to its full size.
        [StructLayout(LayoutKind.Explicit)]
        private struct PropVariant
        {
            [FieldOffset(0)] public ushort Type;
            [FieldOffset(8)] public IntPtr Pointer;
            [FieldOffset(16)] public IntPtr Padding;
        }

        [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
        private interface IPropertyStore
        {
            void GetCount(out uint count);
            void GetAt(uint index, out PropertyKey key);
            void GetValue(ref PropertyKey key, out PropVariant value);
            void SetValue(ref PropertyKey key, ref PropVariant value);
            void Commit();
        }

        [DllImport("shell32.dll")]
        private static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);

        [DllImport("ole32.dll")]
        private static extern int PropVariantClear(ref PropVariant value);

        private const ushort VtLpwstr = 31;
        private static readonly Guid AppUserModelKeys = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        private const uint RelaunchCommandKey = 2;
        private const uint RelaunchIconKey = 3;
        private const uint RelaunchNameKey = 4;
        private const uint AppIdKey = 5;

        private static IPropertyStore WindowProperties(IntPtr hwnd)
        {
            Guid iid = typeof(IPropertyStore).GUID;
            IPropertyStore store;
            int result = SHGetPropertyStoreForWindow(hwnd, ref iid, out store);
            if (result != 0) Marshal.ThrowExceptionForHR(result);
            return store;
        }

        private static void SetString(IPropertyStore store, uint propertyId, string text)
        {
            PropertyKey key = new PropertyKey();
            key.FormatId = AppUserModelKeys;
            key.PropertyId = propertyId;
            PropVariant value = new PropVariant();
            value.Type = VtLpwstr;
            value.Pointer = Marshal.StringToCoTaskMemUni(text);
            try
            {
                store.SetValue(ref key, ref value);
            }
            finally
            {
                Marshal.FreeCoTaskMem(value.Pointer);
            }
        }

        // What the taskbar shows for this window: the name in its right-click
        // menu, and the icon and command a pin uses. Left to itself, Windows
        // names the program that started the process — conhost.exe, "Console
        // Window Host". The relaunch details go first and the ID last, which
        // is when the taskbar reads them all.
        public static void SetTaskbarIdentity(IntPtr hwnd, string appId, string relaunchCommand, string displayName, string iconResource)
        {
            IPropertyStore store = WindowProperties(hwnd);
            try
            {
                SetString(store, RelaunchCommandKey, relaunchCommand);
                SetString(store, RelaunchNameKey, displayName);
                SetString(store, RelaunchIconKey, iconResource);
                SetString(store, AppIdKey, appId);
                store.Commit();
            }
            finally
            {
                Marshal.ReleaseComObject(store);
            }
        }

        // Reads one of those back (2 command, 3 icon, 4 name, 5 ID), to check.
        public static string GetTaskbarProperty(IntPtr hwnd, uint propertyId)
        {
            IPropertyStore store = WindowProperties(hwnd);
            try
            {
                PropertyKey key = new PropertyKey();
                key.FormatId = AppUserModelKeys;
                key.PropertyId = propertyId;
                PropVariant value;
                store.GetValue(ref key, out value);
                try
                {
                    return value.Type == VtLpwstr ? Marshal.PtrToStringUni(value.Pointer) : null;
                }
                finally
                {
                    PropVariantClear(ref value);
                }
            }
            finally
            {
                Marshal.ReleaseComObject(store);
            }
        }

        [ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090")]
        private class TaskbarListClass
        {
        }

        // ITaskbarList3, with every method before SetOverlayIcon declared so
        // the one that is used sits at the right place in the table.
        [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF")]
        private interface ITaskbarList3
        {
            [PreserveSig] int HrInit();
            [PreserveSig] int AddTab(IntPtr hwnd);
            [PreserveSig] int DeleteTab(IntPtr hwnd);
            [PreserveSig] int ActivateTab(IntPtr hwnd);
            [PreserveSig] int SetActiveAlt(IntPtr hwnd);
            [PreserveSig] int MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fullscreen);
            [PreserveSig] int SetProgressValue(IntPtr hwnd, ulong completed, ulong total);
            [PreserveSig] int SetProgressState(IntPtr hwnd, int flags);
            [PreserveSig] int RegisterTab(IntPtr tab, IntPtr parent);
            [PreserveSig] int UnregisterTab(IntPtr tab);
            [PreserveSig] int SetTabOrder(IntPtr tab, IntPtr insertBefore);
            [PreserveSig] int SetTabActive(IntPtr tab, IntPtr parent, uint reserved);
            [PreserveSig] int ThumbBarAddButtons(IntPtr hwnd, uint count, IntPtr buttons);
            [PreserveSig] int ThumbBarUpdateButtons(IntPtr hwnd, uint count, IntPtr buttons);
            [PreserveSig] int ThumbBarSetImageList(IntPtr hwnd, IntPtr imageList);
            [PreserveSig] int SetOverlayIcon(IntPtr hwnd, IntPtr icon, [MarshalAs(UnmanagedType.LPWStr)] string description);
        }

        [DllImport("user32.dll")]
        private static extern bool DestroyIcon(IntPtr icon);

        private static ITaskbarList3 taskbar;
        private static IntPtr overlayIcon = IntPtr.Zero;

        // A small picture over the taskbar button, such as an unread count.
        // IntPtr.Zero takes it away. The taskbar keeps its own copy, so the
        // icon handed over before this one is freed. Returns the HRESULT.
        public static int SetOverlay(IntPtr hwnd, IntPtr icon, string description)
        {
            if (taskbar == null)
            {
                taskbar = (ITaskbarList3)new TaskbarListClass();
                int init = taskbar.HrInit();
                if (init != 0)
                {
                    taskbar = null;
                    return init;
                }
            }
            int result = taskbar.SetOverlayIcon(hwnd, icon, description ?? string.Empty);
            if (overlayIcon != IntPtr.Zero) DestroyIcon(overlayIcon);
            overlayIcon = icon;
            return result;
        }

        private static int ToColorRef(int rgb)
        {
            return ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF);
        }
    }
}
