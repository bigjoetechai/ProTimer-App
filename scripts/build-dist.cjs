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
const https = require('https');
const zlib = require('zlib');

const rootDir = path.resolve(__dirname, '..');
const ndiDir = path.join(rootDir, 'ndi');
const rawTarget = (process.argv[2] || 'win').toLowerCase();

function logStep(msg) {
  console.log(`\n==================================================================`);
  console.log(`  [ProTimer v2.0.0 Builder] ${msg}`);
  console.log(`==================================================================\n`);
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadBuffer(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Extracts specific files from a .tgz buffer into `ndiDir` using pure Node.js (zero external dependencies).
 */
function extractFromTgzBuffer(tgzBuf, fileMap) {
  const tarBuf = zlib.gunzipSync(tgzBuf);
  let offset = 0;
  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    if (header[0] === 0) break;
    const nameRaw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeOctal || '0', 8) || 0;
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    if (fileMap[nameRaw] && size > 0 && dataEnd <= tarBuf.length) {
      const destPath = fileMap[nameRaw];
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, tarBuf.subarray(dataStart, dataEnd));
      console.log(`  -> Bundled ${path.basename(destPath)} (${(size / (1024 * 1024)).toFixed(1)} MB) into ndi/`);
    }

    const blocks = Math.ceil(size / 512);
    offset = dataStart + blocks * 512;
  }
}

async function ensureNdiRuntimeDlls() {
  fs.mkdirSync(ndiDir, { recursive: true });
  const winDllPath = path.join(ndiDir, 'Processing.NDI.Lib.x64.dll');
  const licensePath = path.join(ndiDir, 'libndi_licenses.txt');

  const hasWinDll = fs.existsSync(winDllPath) && fs.statSync(winDllPath).size > 1024 * 1024;
  if (hasWinDll) {
    console.log(
      `Verified ndi/Processing.NDI.Lib.x64.dll (${(fs.statSync(winDllPath).size / (1024 * 1024)).toFixed(1)} MB) ready for bundling.`
    );
    return;
  }

  // First check if Processing.NDI.Lib.x64.dll is installed locally on Windows
  if (process.platform === 'win32') {
    const localCandidates = [
      process.env.NDI_RUNTIME_DIR_V6 && path.join(process.env.NDI_RUNTIME_DIR_V6, 'Processing.NDI.Lib.x64.dll'),
      process.env.NDI_RUNTIME_DIR_V5 && path.join(process.env.NDI_RUNTIME_DIR_V5, 'Processing.NDI.Lib.x64.dll'),
      'C:\\Program Files\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll',
      'C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime\\Processing.NDI.Lib.x64.dll',
      'C:\\Program Files\\NDI\\NDI 5 Runtime\\v5\\Processing.NDI.Lib.x64.dll',
      'C:\\Program Files\\vMix\\ndi\\x64\\Processing.NDI.Lib.x64.dll',
    ].filter(Boolean);

    for (const candidate of localCandidates) {
      if (fs.existsSync(candidate)) {
        fs.copyFileSync(candidate, winDllPath);
        console.log(`Copied local NDI Runtime DLL from ${candidate} -> ndi/Processing.NDI.Lib.x64.dll`);
        return;
      }
    }
  }

  // Fallback: Fetch official redistributable Processing.NDI.Lib.x64.dll from npm package archive
  try {
    console.log('Fetching Processing.NDI.Lib.x64.dll into ndi/ folder...');
    const tgzUrl = 'https://registry.npmjs.org/jp.keijiro.klak.ndi/-/jp.keijiro.klak.ndi-2.1.6.tgz';
    const tgzBuf = await downloadBuffer(tgzUrl);
    extractFromTgzBuffer(tgzBuf, {
      'package/Plugin/Windows/Processing.NDI.Lib.x64.dll': winDllPath,
      'package/libndi_licenses.txt': licensePath,
    });
  } catch (err) {
    console.warn(`Warning: Could not auto-download Processing.NDI.Lib.x64.dll: ${err.message}`);
  }
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

async function main() {
  stopRunningProTimerOnWindows();
  cleanLockedUnpackedDirs();

  // Step 0: Verify / Bundle Processing.NDI.Lib.x64.dll in ndi/
  logStep('Step 1/5: Verifying Bundled NDI Runtime (ndi/Processing.NDI.Lib.x64.dll)');
  await ensureNdiRuntimeDlls();

  // Step 1: Generate Icons
  logStep('Step 2/5: Generating Windows (.ico) & macOS (.png) Icons');
  if (!runCommand('node', ['scripts/generate-icons.cjs'])) {
    console.error('Failed to generate application icons.');
    process.exit(1);
  }

  // Step 2: Build Vite Frontend Bundle (dist/)
  logStep('Step 3/5: Building ProTimer v2.0.0 Frontend Bundle (vite build)');
  if (!runCommand('npx', ['vite', 'build'])) {
    console.error('Frontend build (vite build) failed.');
    process.exit(1);
  }

  // Step 3: Bundle Express server.ts (with express, dotenv, and server/lanHandler.ts) for Electron main.cjs
  logStep('Step 4/5: Bundling Express server.ts + dependencies (express, dotenv) into server/bundledServer.cjs');
  if (!runCommand('node', ['scripts/bundle-server.cjs'])) {
    console.error('Express server bundling (scripts/bundle-server.cjs) failed.');
    process.exit(1);
  }

  // Step 4: Package with Electron Builder
  let builderArgs = ['electron-builder'];
  if (rawTarget === 'win' || rawTarget === 'windows') {
    logStep('Step 5/5: Packaging Windows 10/11 64-bit Installer & Portable Executable');
    builderArgs.push('--win', '--x64');
  } else if (rawTarget === 'mac' || rawTarget === 'macos') {
    logStep('Step 5/5: Packaging macOS Application Bundle (x64 & Apple Silicon arm64)');
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
    logStep('Step 5/5: Packaging Windows & macOS Deliverables');
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
