/**
 * Bundles `server.ts` (including Express, dotenv, and `server/lanHandler.ts`)
 * into a standalone CommonJS module `server/bundledServer.cjs` so that
 * `electron/main.cjs` can start the Express server directly inside the packaged app.
 */

const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const outFile = path.join(rootDir, 'server', 'bundledServer.cjs');

function bundleExpressServer() {
  try {
    const esbuild = require('esbuild');
    esbuild.buildSync({
      entryPoints: [path.join(rootDir, 'server.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: outFile,
      define: {
        __IS_BUNDLED_SERVER_MODULE__: 'true',
      },
      external: ['koffi', 'electron', 'vite', './ndiNativeBridge.cjs'],
      logLevel: 'warning',
    });
    console.log('[bundle-server] Bundled server.ts -> server/bundledServer.cjs successfully.');
    return true;
  } catch (err) {
    try {
      execSync(
        'npx esbuild server.ts --bundle --platform=node --format=cjs --outfile=server/bundledServer.cjs --define:__IS_BUNDLED_SERVER_MODULE__=true --external:koffi --external:electron --external:vite --external:./ndiNativeBridge.cjs',
        { cwd: rootDir, stdio: 'inherit' }
      );
      return true;
    } catch (cliErr) {
      console.warn('[bundle-server] Warning bundling server.ts:', cliErr && cliErr.message ? cliErr.message : cliErr);
      return false;
    }
  }
}

if (require.main === module) {
  bundleExpressServer();
}

module.exports = { bundleExpressServer };
