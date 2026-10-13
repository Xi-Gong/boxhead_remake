# Background-safe Flash projector control for visual reference captures.           OWNER: lane V (visual)
# Never activates / raises a window and never sends input (the user may be working on this PC).
#
#   projector.ps1 -Action launch  -Exe <FlashPlayerNN.exe> -Swf <file.swf>
#       CreateProcess with STARTUPINFO.wShowWindow = SW_SHOWMINNOACTIVE (minimized, not activated) and
#       __COMPAT_LAYER=HighDpiAware (no DPI bitmap stretching: the stage renders 1:1); as soon as the projector
#       window exists its restore position is moved off-screen and it is kept minimized without activation.
#       Prints "pid <n> hwnd <h> fg-unchanged=<True|False>".
#   projector.ps1 -Action capture -ProcessId <pid> -Out <file.png>
#       Restores the window WITHOUT activation at its off-screen position (SW_SHOWNOACTIVATE), waits for a repaint,
#       grabs the client area with PrintWindow(PW_RENDERFULLCONTENT) and minimizes it again (SW_SHOWMINNOACTIVE).
#       Prints "ok <w>x<h> ..." or "error ...".
param(
  [Parameter(Mandatory = $true)][ValidateSet('launch', 'capture')][string]$Action,
  [string]$Exe,
  [string]$Swf,
  [int]$ProcessId,
  [string]$Out,
  [int]$OffX = -12000,
  [int]$OffY = -12000
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('VisProj.Native' -as [type])) {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
namespace VisProj {
  public static class Native {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct WINDOWPLACEMENT { public int length, flags, showCmd; public POINT ptMin, ptMax; public RECT rcNormal; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct STARTUPINFO {
      public int cb; public string lpReserved, lpDesktop, lpTitle;
      public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
      public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CreateProcessW(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, int flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT p);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr hwnd, ref WINDOWPLACEMENT wp);
    [DllImport("user32.dll")] public static extern bool SetWindowPlacement(IntPtr hwnd, ref WINDOWPLACEMENT wp);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);

    public static void DpiAware() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } }

    public static string Cls(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }

    /** The projector's main window (class ShockwaveFlash) of the process, visible or not. */
    public static IntPtr FindMain(uint pid) {
      IntPtr found = IntPtr.Zero;
      EnumWindows((h, l) => {
        uint p; GetWindowThreadProcessId(h, out p);
        if (p == pid && Cls(h) == "ShockwaveFlash") { found = h; return false; }
        return true;
      }, IntPtr.Zero);
      return found;
    }

    public static int Launch(string exe, string swf, out bool started) {
      var si = new STARTUPINFO();
      si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
      si.dwFlags = 1;          // STARTF_USESHOWWINDOW
      si.wShowWindow = 7;      // SW_SHOWMINNOACTIVE
      PROCESS_INFORMATION pi;
      var cmd = new StringBuilder("\"" + exe + "\" \"" + swf + "\"");
      string dir = System.IO.Path.GetDirectoryName(swf);
      started = CreateProcessW(null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, dir, ref si, out pi);
      if (!started) return -Marshal.GetLastWin32Error();
      CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
      return pi.dwProcessId;
    }

    /** Keep the window minimized (not activated) with its restore rectangle off-screen. */
    public static void Park(IntPtr h, int x, int y) {
      var wp = new WINDOWPLACEMENT(); wp.length = Marshal.SizeOf(typeof(WINDOWPLACEMENT));
      GetWindowPlacement(h, ref wp);
      int w = wp.rcNormal.Right - wp.rcNormal.Left, hh = wp.rcNormal.Bottom - wp.rcNormal.Top;
      wp.rcNormal.Left = x; wp.rcNormal.Top = y; wp.rcNormal.Right = x + w; wp.rcNormal.Bottom = y + hh;
      wp.showCmd = 7; // SW_SHOWMINNOACTIVE
      SetWindowPlacement(h, ref wp);
    }

    public static Bitmap Print(IntPtr h) {
      RECT wr; GetWindowRect(h, out wr);
      int w = wr.Right - wr.Left, hh = wr.Bottom - wr.Top;
      var full = new Bitmap(w, hh, PixelFormat.Format32bppArgb);
      using (var g = Graphics.FromImage(full)) { IntPtr hdc = g.GetHdc(); PrintWindow(h, hdc, 2); g.ReleaseHdc(hdc); }
      RECT cr; GetClientRect(h, out cr);
      POINT p = new POINT(); ClientToScreen(h, ref p);
      var crop = new Rectangle(p.X - wr.Left, p.Y - wr.Top, cr.Right - cr.Left, cr.Bottom - cr.Top);
      var outBmp = full.Clone(crop, PixelFormat.Format32bppArgb);
      full.Dispose();
      return outBmp;
    }
  }
}
'@
}
[VisProj.Native]::DpiAware()

if ($Action -eq 'launch') {
  $env:__COMPAT_LAYER = 'HighDpiAware'
  $fg0 = [VisProj.Native]::GetForegroundWindow()
  $started = $false
  $procId = [VisProj.Native]::Launch($Exe, $Swf, [ref]$started)
  if (-not $started) { Write-Output "error CreateProcess failed ($procId)"; exit 1 }
  $h = [IntPtr]::Zero
  for ($i = 0; $i -lt 200 -and $h -eq [IntPtr]::Zero; $i++) {
    $h = [VisProj.Native]::FindMain([uint32]$procId)
    if ($h -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 25 }
  }
  if ($h -ne [IntPtr]::Zero) { [VisProj.Native]::Park($h, $OffX, $OffY) }
  Start-Sleep -Milliseconds 300
  if ($h -ne [IntPtr]::Zero) { [VisProj.Native]::Park($h, $OffX, $OffY) }
  $fg1 = [VisProj.Native]::GetForegroundWindow()
  Write-Output ("pid {0} hwnd {1} fg-unchanged={2}" -f $procId, $h, ($fg0 -eq $fg1))
  exit 0
}

# capture
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 50 -and $h -eq [IntPtr]::Zero; $i++) {
  $h = [VisProj.Native]::FindMain([uint32]$ProcessId)
  if ($h -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 100 }
}
if ($h -eq [IntPtr]::Zero) { Write-Output "error no projector window for pid $ProcessId"; exit 1 }
[VisProj.Native]::Park($h, $OffX, $OffY)
[void][VisProj.Native]::ShowWindow($h, 4)   # SW_SHOWNOACTIVATE: restore at the off-screen position, no activation
Start-Sleep -Milliseconds 800
$cr = New-Object VisProj.Native+RECT
[void][VisProj.Native]::GetClientRect($h, [ref]$cr)
$bmp = [VisProj.Native]::Print($h)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
[void][VisProj.Native]::ShowWindow($h, 7)   # SW_SHOWMINNOACTIVE
$wr = New-Object VisProj.Native+RECT
[void][VisProj.Native]::GetWindowRect($h, [ref]$wr)
Write-Output ("ok {0}x{1} hwnd={2} window={3},{4}" -f ($cr.Right - $cr.Left), ($cr.Bottom - $cr.Top), $h, $wr.Left, $wr.Top)
