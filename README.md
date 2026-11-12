===============================================================================
PROTIMER DESKTOP - RELEASE NOTES
===============================================================================
Application Name : ProTimer
Application ID   : com.protimer.desktop
Version          : 1.0.0
Release Date     : November 2026
Platform         : Microsoft Windows 10 (64-bit) & Windows 11 (64-bit)
Architecture     : x64
Installer File   : ProTimer-Setup.exe
Portable File    : ProTimer-Portable.exe
===============================================================================

1. OVERVIEW
-----------
ProTimer 1.0.0 is a standalone Windows desktop application for professional
live event timing, broadcast stage management, speaker countdowns, and
multi-monitor production workflows.

2. INCLUDED FEATURES IN VERSION 1.0.0
-------------------------------------
- Timer Types:
  * Countdown, Count Up, End Time (Meeting Timer), Stopwatch, Digital Clock,
    Empty row, and Spacer row.
- Cue List & Run-of-Show Management:
  * Multiple timer lists with instant switching, add/edit/delete/duplicate cues,
    inline Timer Type and End Action dropdowns, drag-and-drop ordering, CSV and
    JSON import/export, and full system backup/restore.
- Transport & Live Operator Controls:
  * Start, Pause/Resume toggle, Stop, Cue, Restart, Next/Previous Step, live
    duration adjustments (-1m, +1m, etc.) including automatic recovery from
    overtime back to normal countdown when added time exceeds elapsed overtime,
    and variable playback speed (50% to 200%).
- Alerts & Visual Indicators:
  * Dual configurable alerts (Warning & Danger) with custom threshold times,
    custom colors, independent Flash (smooth pulse) and On/Off (discrete digit
    blink) checkboxes, and synthesized/custom audio chimes.
- Native Windows Multi-Monitor & Display System:
  * Real-time detection of connected Windows monitors via Electron Screen API
    (`screen.getAllDisplays()`, `display-added`, `display-removed`,
    `display-metrics-changed`).
  * Dedicated borderless Fullscreen output on any selected external monitor
    while keeping the main operator console separate and interactive.
  * Native desktop windows for Presenter Display, Stage Display, Preview
    Display, and NDI Broadcast Display.
  * Automatic window recovery to the primary monitor if an external display is
    disconnected.
- Built-in LAN Remote Control & LAN Display Server:
  * Embedded local HTTP & Server-Sent Events (SSE) server allowing mobile
    phones, tablets, and secondary computers on the same local network to scan
    a QR code and control or view live timers with PIN protection.
- Persistent Windows AppData Storage:
  * Automatically saves timer lists, cues, preferences, and window state to
    `%APPDATA%\ProTimer` (`protimer-user-data.json` + automatic `.backup.json`)
    so user data survives restarts, Windows reboots, software updates, and
    reinstalls.

3. NDI & NATIVE COMPANION NOTES
-------------------------------
- ProTimer includes a dedicated broadcast-keyable NDI Display view (`NDI` /
  `NDI Multi`) with alpha/chroma-ready styling and real-time sync.
- Native NDI® network video stream transmission over IP requires the NewTek /
  Vizrt NDI® Runtime / Tools (such as NDI Screen Capture) installed on the
  Windows host machine to broadcast the ProTimer NDI window onto an NDI IP
  production network.
===============================================================================
