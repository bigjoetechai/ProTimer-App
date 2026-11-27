# ProTimer v3.0.2 — Windows, macOS & Linux Build & Packaging Guide

## 1. Application Overview

| Property | Value |
| :--- | :--- |
| **Application Name** | ProTimer |
| **Owner / Company** | Bigjoe Technology |
| **Application ID** | `com.protimer.desktop` |
| **Version** | `3.0.2` |
| **Windows Deliverables** | `release/ProTimer-v3.0.2-Setup.exe` & `release/ProTimer-v3.0.2-Portable.exe` |
| **macOS Deliverables** | `release/ProTimer-v3.0.2-Mac-arm64.dmg` / `.zip` (Apple Silicon) & `release/ProTimer-v3.0.2-Mac-x64.dmg` / `.zip` (Intel) |
| **Linux Deliverables** | `release/ProTimer-v3.0.2-Linux-x64.AppImage` & `release/ProTimer-v3.0.2-Linux-amd64.deb` |
| **User Data Location** | `%APPDATA%\ProTimer` (`C:\Users\<Username>\AppData\Roaming\ProTimer`) |

---

## 2. Step-by-Step Build Commands on Windows 10 / 11

### Step 1: Install Dependencies
```bash
npm install
```
> If upgrading from an older folder with a stale `package-lock.json`, delete `package-lock.json` first and then run `npm install`.

### Step 2: Build Windows 10/11 64-bit Installer & Portable App
```bash
npm run dist:win
```
*(Note: Write `npm run dist:win` without a space after the colon, or simply run `npm run dist`).*

This automatically:
1. Closes any running `ProTimer.exe` instance so `release/win-unpacked` is not locked.
2. Generates Windows `.ico` and macOS `.png` icons.
3. Compiles the production bundle (`vite build`).
4. Packages `release/ProTimer-Setup.exe` and `release/ProTimer-Portable.exe`.

---

## 3. Building for macOS from a Windows 11 Terminal (`npm run dist:mac`)

Why standard `electron-builder --mac` fails on Windows by default:
1. **`.dmg` disk images** require Apple's macOS-only `hdiutil` tool, which does not exist on Windows. However, **macOS `.zip` app bundles (`ProTimer.app`) CAN be built on Windows**.
2. macOS `.app` frameworks contain symbolic links. Windows 11 blocks creating symbolic links unless **Developer Mode** is enabled or the terminal is run as **Administrator**.

### How to Package for macOS on Windows 11:
1. **Enable Windows 11 Developer Mode** (one-time setup):
   - Open **Windows Settings** → **System** → **For developers** → Turn ON **Developer Mode** *(or open PowerShell / CMD as **Run as Administrator**)*.
2. Run:
   ```bash
   npm run dist:mac
   ```
3. Output files in `./release`:
   - `release/ProTimer-Mac-x64.zip` (for Intel Macs)
   - `release/ProTimer-Mac-arm64.zip` (for Apple Silicon M1 / M2 / M3 / M4 Macs)
   - Mac users simply double-click the `.zip` to extract **`ProTimer.app`** and drag it to `/Applications`.
   *(If you run `npm run dist:mac` on a Mac, you can also build `.dmg` installers natively).*
