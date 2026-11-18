/**
 * Cross-Platform Electron Packaging Runner for ProTimer v2.0.0.
 *
 * Supports:
 * - `npm run dist` / `npm run dist:win`  -> Packages Windows 64-bit Installer (NSIS .exe) & Portable (.exe)
 * - `npm run dist:mac`                   -> Packages macOS Application Bundle (.zip on Windows, .dmg + .zip on macOS)
 * - `npm run dist:all`                   -> Packages Windows + macOS deliverables
 *
 * Automatically:
 * 1. Terminates any running `ProTimer.exe` process before packaging on Windows so `release/win-unpacked` is never locked.
 * 2. Generates high-resolution multi-size icons (`build/icon.ico` and 512x512 `build/icon.png`).
 * 3. Compiles the production Vite bundle (`dist/`).
 * 4. Runs `electron-builder` with `CSC_IDENTITY_AUTO_DISCOVERY=false` and `npmRebuild=false` to prevent
 *    Windows code-signing or node-gyp compilation errors.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const rawTarget = (process.argv[2] || 'win').toLowerCase();

function logStep(msg) {
  console.log(`\n==================================================================`);
  console.log(`  [ProTimer v2.0.0 Builder] ${msg}`);
  console.log(`==================================================================\n`);
}

function stopRunningProTimerOnWindows() {
  if (process.platform !== 'win32') return;
  try {
    execSync('taskkill /F /IM ProTimer.exe /T', { stdio: 'ignore' });
    console.log('Closed running ProTimer.exe instance to unlock release folder.');
  } catch {
    // ProTimer.exe was not running
  }
}

function cleanLockedUnpackedDirs() {
  const releaseDir = path.join(rootDir, 'release');
  if (!fs.existsSync(releaseDir)) return;
  for (const sub of ['win-unpacked', 'mac', 'mac-arm64', 'mac-universal']) {
    const targetPath = path.join(releaseDir, sub);
    if (fs.existsSync(targetPath)) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } catch {
        // Ignore if in use
      }
    }
  }
}

function runCommand(cmd, args, extraEnv = {}) {
  const isWin = process.platform === 'win32';
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWin,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true',
      ...extraEnv,
    },
  });
  return result.status === 0;
}

function main() {
  stopRunningProTimerOnWindows();
  cleanLockedUnpackedDirs();

  // Step 1: Generate Icons
  logStep('Step 1/3: Generating Windows (.ico) & macOS (.png) Icons');
  if (!runCommand('node', ['scripts/generate-icons.cjs'])) {
    console.error('Failed to generate application icons.');
    process.exit(1);
  }

  // Step 2: Build Vite Frontend Bundle
  logStep('Step 2/3: Building ProTimer v2.0.0 Frontend Bundle (vite build)');
  if (!runCommand('npx', ['vite', 'build'])) {
    console.error('Frontend build (vite build) failed.');
    process.exit(1);
  }

  // Step 3: Package with Electron Builder
  let builderArgs = ['electron-builder'];
  if (rawTarget === 'win' || rawTarget === 'windows') {
    logStep('Step 3/3: Packaging Windows 10/11 64-bit Installer & Portable Executable');
    builderArgs.push('--win', '--x64');
  } else if (rawTarget === 'mac' || rawTarget === 'macos') {
    logStep('Step 3/3: Packaging macOS Application Bundle (x64 & Apple Silicon arm64)');
    if (process.platform === 'darwin') {
      builderArgs.push('--mac', '--x64', '--arm64');
    } else {
      // On Windows/Linux, macOS .dmg cannot be built because Apple's `hdiutil` only exists on macOS.
      // However, macOS `.zip` (`ProTimer.app` bundle) CAN be built directly on Windows!
      console.log(
        'Note: Building macOS .zip application bundle from Windows (macOS .dmg requires Apple hdiutil on macOS).'
      );
      builderArgs.push('--mac', 'zip', '--x64', '--arm64');
    }
  } else if (rawTarget === 'all') {
    logStep('Step 3/3: Packaging Windows & macOS Deliverables');
    if (process.platform === 'darwin') {
      builderArgs.push('--win', '--mac', '--x64', '--arm64');
    } else {
      builderArgs.push('--win', '--mac', 'zip', '--x64');
    }
  } else {
    builderArgs.push('--win', '--x64');
  }

  const ok = runCommand('npx', builderArgs);
  if (!ok) {
    if ((rawTarget === 'mac' || rawTarget === 'all') && process.platform === 'win32') {
      console.error('\n------------------------------------------------------------------');
      console.error('  macOS Packaging on Windows — Symbolic Link Permission Required');
      console.error('------------------------------------------------------------------');
      console.error('macOS .app bundles contain framework symbolic links.');
      console.error('To allow Electron Builder to create macOS symbolic links on Windows 11:');
      console.error('  1. Open Windows 11 Settings -> System -> For developers');
      console.error('     and turn ON "Developer Mode", OR');
      console.error('  2. Open PowerShell / Command Prompt as "Run as Administrator"');
      console.error('     and run: npm run dist:mac');
      console.error('------------------------------------------------------------------\n');
    }
    process.exit(1);
  }

  logStep('Build Complete! Deliverables are ready inside the ./release folder.');
}

main();
