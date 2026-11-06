# ProTimer — Windows Desktop Build & Packaging Instructions

## 1. Application Overview

| Property | Value |
| :--- | :--- |
| **Application Name** | ProTimer |
| **Product Name** | ProTimer |
| **Application ID** | `com.protimer.desktop` |
| **Version** | `1.0.0` |
| **Target OS** | Windows 10 (64-bit) & Windows 11 (64-bit) |
| **Architecture** | `x64` |
| **Executable Name** | `ProTimer.exe` |
| **Installer Output** | `release/ProTimer-Setup.exe` |
| **Portable Output** | `release/ProTimer-Portable.exe` |
| **User Data Location** | `%APPDATA%\ProTimer` (`C:\Users\<Username>\AppData\Roaming\ProTimer`) |

---

## 2. Prerequisites for Building from Source

To compile and package ProTimer from source on a development workstation:

- **Operating System**: Windows 10/11 (64-bit) recommended for native NSIS packaging (or Linux/macOS with Wine 64-bit if cross-compiling).
- **Node.js**: v18.18+ or v20 LTS / v22 LTS.
- **npm**: v9+ (included with Node.js).

> **Note for End Users**: End users running `ProTimer-Setup.exe` or `ProTimer-Portable.exe` on Windows 10 or Windows 11 do **not** need Node.js, npm, React, TypeScript, or Python installed. All runtime dependencies are bundled inside the packaged application.

---

## 3. Step-by-Step Build Commands

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Generate Application Icons (if updating branding)
```bash
node scripts/generate-icons.cjs
```
This generates 256×256 `build/icon.ico`, `build/icon.png`, and `public/icon.ico`. You may also replace `build/icon.ico` with any custom multi-resolution Windows `.ico` file.

### Step 3: Compile Frontend Production Bundle
```bash
npm run build
```
Compiles the React + TypeScript application into `/dist` with relative asset paths (`base: './'`) for Electron desktop execution.

### Step 4: Package Windows 64-bit Installer & Portable Executable
```bash
npm run dist:win
```
Or to run the default distribution pipeline:
```bash
npm run dist
```

---

## 4. Generated Deliverables (`/release`)

After running `npm run dist:win`, Electron Builder outputs the following deliverables inside the `/release` directory:

1. **`release/ProTimer-Setup.exe`**
   - Full NSIS Windows Installation Wizard (`oneClick: false`).
   - Includes Welcome screen, End-User Licence Agreement (`build/license.txt`), custom installation directory picker, progress bar, Desktop & Start Menu shortcut creation, and "Launch ProTimer" upon completion.
   - Supports per-user installation without requiring administrator elevation by default, or system-wide installation (`C:\Program Files\ProTimer`) when elevated.
2. **`release/ProTimer-Portable.exe`**
   - Standalone zero-install portable executable that runs directly on Windows 10 and Windows 11 (64-bit).
3. **`release/win-unpacked/`**
   - Unpacked Windows 64-bit application directory containing `ProTimer.exe` and bundled runtime binaries.

---

## 5. Architecture & Native Windows Features

- **Electron Main Process (`electron/main.cjs`)**:
  - Enforces a single application instance via `app.requestSingleInstanceLock()`.
  - Sets Windows Application User Model ID (`com.protimer.desktop`).
  - Runs an embedded local HTTP + LAN synchronization server (`127.0.0.1:3000` / `0.0.0.0:3000` with automatic fallback if port 3000 is occupied) so LAN Remote Control, LAN Display, SSE live updates, and `BroadcastChannel` synchronization work natively out-of-the-box.
  - Uses `screen.getAllDisplays()` and listens to `display-added`, `display-removed`, and `display-metrics-changed` for real-time Windows multi-monitor management.
  - Intercepts secondary display windows (`Presenter`, `Preview`, `Stage`, `NDI`) via `setWindowOpenHandler` so they open as native Electron windows instead of external browser tabs.
- **Data Persistence (`%APPDATA%\ProTimer`)**:
  - User data is stored in `%APPDATA%\ProTimer\protimer-user-data.json` with automatic backup rotation (`protimer-user-data.backup.json`) and window geometry in `%APPDATA%\ProTimer\window-state.json`.
  - Uninstalling ProTimer preserves `%APPDATA%\ProTimer` by default (`deleteAppDataOnUninstall: false`) so timer lists, cues, projects, and settings survive upgrades and reinstallations.
