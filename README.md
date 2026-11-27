# ProTimer

[![Latest Release](https://img.shields.io/badge/release-v3.0.1-0ea5e9?style=for-the-badge)](https://github.com/bigjoetechai/ProTimer-App/releases/tag/v3.0.1) [![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-1e293b?style=for-the-badge)](https://github.com/bigjoetechai/ProTimer-App/releases/latest) [![Release Type](https://img.shields.io/badge/type-Patch%20%26%20Maintenance%20Release-10b981?style=for-the-badge)](./RELEASE_NOTES_v3.0.1.md)

**ProTimer - Professional Multi-Timer & Stage Production Management** — built by **Bigjoe Technology** for churches, broadcast studios, live conferences, sports venues, and stage production teams.

> **Latest Release:** [`v3.0.1`](https://github.com/bigjoetechai/ProTimer-App/releases/tag/v3.0.1) (2026-11-27) — [Read the v3.0.1 Release Notes](./RELEASE_NOTES_v3.0.1.md) · [Browse All Releases](https://github.com/bigjoetechai/ProTimer-App/releases)

## Key Features

- **Multi-Timer Cue Lists & Templates**: Manage multiple independent timer lists with right-click tab editing, renaming, deletion, and one-click presets (Sunday Service, Sports, Conference, or your own saved templates).
- **Broadcast NDI® Output per List Tab**: Stream each timer list independently over NDI® to OBS, vMix, TriCaster, ProPresenter, and live switchers with per-tab stream configuration.
- **Multi-Screen Stage & Presenter Displays**: Launch dedicated fullscreen Output, Presenter, and Preview displays across external monitors with customizable typography, themes, progress bars, and live stage messaging.
- **Global Keyboard Shortcuts Manager**: Control Start/Pause, Reset, timer navigation, and list tab switching directly from the keyboard.
- **LAN & QR Code Remote Control**: Share a local network link or QR code so stage managers and speakers can view or control timers from phones, tablets, or secondary computers.
- **Built-in GitHub Auto-Updates**: Check for updates in-app and install new releases seamlessly across Windows, macOS (Apple Silicon & Intel), and Linux.

## Download ProTimer v3.0.1

| Platform | Package | Download | Notes |
| :--- | :--- | :--- | :--- |
| Windows (x64) | Installer (Auto-Update) | [ProTimer-v3.0.1-Setup.exe](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Setup.exe) | Recommended — supports automatic in-app updates |
| Windows (x64) | Portable Executable | [ProTimer-v3.0.1-Portable.exe](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Portable.exe) | No installation required |
| macOS (Apple Silicon) | DMG Installer (`arm64`) | [ProTimer-v3.0.1-Mac-arm64.dmg](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Mac-arm64.dmg) | For M1 / M2 / M3 / M4 Macs |
| macOS (Apple Silicon) | ZIP Archive (`arm64`) | [ProTimer-v3.0.1-Mac-arm64.zip](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Mac-arm64.zip) | Portable macOS bundle |
| macOS (Intel) | DMG Installer (`x64`) | [ProTimer-v3.0.1-Mac-x64.dmg](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Mac-x64.dmg) | For Intel-based Macs |
| macOS (Intel) | ZIP Archive (`x64`) | [ProTimer-v3.0.1-Mac-x64.zip](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Mac-x64.zip) | Portable macOS bundle |
| Linux (x64) | AppImage (Auto-Update) | [ProTimer-v3.0.1-Linux-x64.AppImage](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Linux-x64.AppImage) | Universal Linux package with auto-update support |
| Linux (x64) | Debian / Ubuntu (`.deb`) | [ProTimer-v3.0.1-Linux-amd64.deb](https://github.com/bigjoetechai/ProTimer-App/releases/download/v3.0.1/ProTimer-v3.0.1-Linux-amd64.deb) | Install with `sudo apt install ./ProTimer-*.deb` |

For checksums, upgrade steps, and the full change summary, see **[RELEASE_NOTES_v3.0.1.md](./RELEASE_NOTES_v3.0.1.md)**.

## Installation & Updating

1. **Windows**: Download `Setup.exe` for full installation with automatic updates, or `Portable.exe` to run without installing.
2. **macOS**: Download the `arm64` build for Apple Silicon (M1–M4) or `x64` for Intel Macs, open the `.dmg`, and drag **ProTimer** to **Applications**.
3. **Linux**: Make the `.AppImage` executable (`chmod +x ProTimer-*.AppImage`) and run it, or install the Debian/Ubuntu `.deb` package (`sudo apt install ./ProTimer-*.deb`).
4. **Staying Up to Date**: Inside ProTimer, open **Help → Check for Updates** or **Settings → Updates** to detect and download the latest GitHub release.

## Release History

| Version | Release Notes | GitHub Release |
| :--- | :--- | :--- |
| **v3.0.1** (Latest) | [RELEASE_NOTES_v3.0.1.md](./RELEASE_NOTES_v3.0.1.md) | [View Release](https://github.com/bigjoetechai/ProTimer-App/releases/tag/v3.0.1) |

## Development & Building from Source

Requires **Node.js 20+** and **npm**.

```bash
# Install dependencies
npm install --legacy-peer-deps

# Run web development server (port 3000)
npm run dev

# Launch Electron desktop app in development
npm run electron:dev

# Build platform installers
npm run dist:win     # Windows x64 (Setup + Portable)
npm run dist:mac     # macOS Apple Silicon (arm64) + Intel (x64)
npm run dist:linux   # Linux x64 (AppImage + .deb)

# Regenerate RELEASE_NOTES_<TAG>.md and README.md locally
npm run docs:release
```

See [BUILD-INSTRUCTIONS.md](./BUILD-INSTRUCTIONS.md) for detailed packaging and signing notes.

## Automated GitHub Releases

Whenever a new GitHub Release is published or a version tag (`v*`, e.g. `v3.0.2`) is pushed, the GitHub Actions workflow in `.github/workflows/build.yml` automatically:

1. Stamps the release version into all Windows, macOS (`arm64` & `x64`), and Linux binaries plus `latest*.yml` auto-updater manifests.
2. Generates `RELEASE_NOTES_<TAG>.md` (with commit changelog, direct download links, and SHA-256 checksums) and updates `README.md`.
3. Publishes all installers and release notes to GitHub Releases and commits the updated documentation back to the repository.

---
© 2026 Bigjoe Technology. All rights reserved.
