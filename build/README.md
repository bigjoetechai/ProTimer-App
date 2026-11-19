# ProTimer Electron Build Resources (`build/`)

This directory contains the application icons and packaging resources required by `electron-builder` (`electron-builder.yml`) when compiling `ProTimer-Setup.exe`, `ProTimer-Portable.exe`, and `ProTimer-Mac`:

- `build/icon.ico` — Multi-resolution Windows icon (256x256, 64x64, 48x48, 32x32, 16x16) used for the Windows `.exe` executable and NSIS installer.
- `build/icon.png` — High-resolution 512x512 PNG application icon used for macOS and Linux builds.
- `build/entitlements.mac.plist` — macOS entitlements for local LAN & NDI discovery.

To regenerate icons from the master asset at any time, run:
```bash
npm run generate:icons
```
