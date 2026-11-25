/**
 * Automatically prepares all required Electron build assets on `npm install` (`postinstall`)
 * and before Electron packaging (`beforePack`):
 * 1. Generates `build/icon.ico`, `build/icon.png`, `build/installerIcon.ico`, `build/uninstallerIcon.ico`,
 *    and `build/installerHeaderIcon.ico` inside `build/`.
 * 2. Ensures `ndi/Processing.NDI.Lib.x64.dll` and `ndi/libndi_licenses.txt` are present inside `ndi/`.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const rootDir = path.resolve(__dirname, '..');
const ndiDir = path.join(rootDir, 'ndi');

// Step 1: Generate all icons in build/ and public/
try {
  require('./generate-icons.cjs');
} catch (err) {
  console.warn('[prepare-build-assets] Warning generating icons:', err.message);
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
      console.log(`[prepare-build-assets] Placed ${path.basename(destPath)} (${(size / (1024 * 1024)).toFixed(1)} MB) in ndi/`);
    }

    const blocks = Math.ceil(size / 512);
    offset = dataStart + blocks * 512;
  }
}

async function ensureNdiDll(targetPlatform = process.platform) {
  fs.mkdirSync(ndiDir, { recursive: true });
  if (targetPlatform !== 'win32') {
    return;
  }

  const winDllPath = path.join(ndiDir, 'Processing.NDI.Lib.x64.dll');
  const licensePath = path.join(ndiDir, 'libndi_licenses.txt');

  if (fs.existsSync(winDllPath) && fs.statSync(winDllPath).size > 1024 * 1024) {
    return;
  }

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
        console.log(`[prepare-build-assets] Copied ${candidate} -> ndi/Processing.NDI.Lib.x64.dll`);
        return;
      }
    }
  }

  try {
    const tgzUrl = 'https://registry.npmjs.org/jp.keijiro.klak.ndi/-/jp.keijiro.klak.ndi-2.1.6.tgz';
    const tgzBuf = await downloadBuffer(tgzUrl);
    extractFromTgzBuffer(tgzBuf, {
      'package/Plugin/Windows/Processing.NDI.Lib.x64.dll': winDllPath,
      'package/libndi_licenses.txt': licensePath,
    });
  } catch (err) {
    console.warn(`[prepare-build-assets] Could not auto-download Processing.NDI.Lib.x64.dll: ${err.message}`);
  }
}

function ensureDistAndServerBuilt() {
  const distIndex = path.join(rootDir, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    try {
      const { execSync } = require('child_process');
      console.log('[prepare-build-assets] Building production frontend bundle (vite build)...');
      execSync('npx vite build', { cwd: rootDir, stdio: 'inherit' });
    } catch (err) {
      console.warn('[prepare-build-assets] Could not auto-build dist/:', err && err.message ? err.message : err);
    }
  }

  try {
    const { bundleExpressServer } = require('./bundle-server.cjs');
    bundleExpressServer();
  } catch (err) {
    console.warn(
      '[prepare-build-assets] Could not auto-bundle server.ts:',
      err && err.message ? err.message : err
    );
  }
}

if (require.main === module) {
  const cliTarget = process.argv.includes('--win') ? 'win32' : process.platform;
  ensureNdiDll(cliTarget);
}

module.exports = async function beforePack(context) {
  const targetPlatform = (context && context.electronPlatformName) || process.platform;
  require('./generate-icons.cjs');
  await ensureNdiDll(targetPlatform);
  ensureDistAndServerBuilt();
};
