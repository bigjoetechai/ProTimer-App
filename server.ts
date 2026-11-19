/**
 * Full-Stack ProTimer Express Server.
 * Hosts the React SPA and provides real-time LAN Control, LAN Display, NDI streaming,
 * and cross-device synchronization over the local network.
 *
 * Used both:
 * 1. In standalone packaged Electron production (started directly by `electron/main.cjs` on a local port).
 * 2. In Node/Vite development (`tsx server.ts`).
 */

import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handleLanApi,
  getLocalIpAddresses,
  setActiveLanPort,
  registerElectronNativeDecoder,
  type NativeDataUrlDecoder,
} from './server/lanHandler.ts';

dotenv.config();

declare const __IS_BUNDLED_SERVER_MODULE__: boolean | undefined;

const currentDirPath =
  typeof __dirname === 'string' ? __dirname : process.cwd();

export interface StartExpressServerOptions {
  port?: number;
  host?: string;
  isProduction?: boolean;
  distPath?: string;
  nativeDecoder?: NativeDataUrlDecoder | null;
}

export interface StartedExpressServer {
  server: http.Server;
  port: number;
  url: string;
}

function resolveProductionDistPath(explicitDistPath?: string): string {
  const candidates = [
    explicitDistPath,
    (process as any).resourcesPath
      ? path.join((process as any).resourcesPath, 'app.asar.unpacked', 'dist')
      : undefined,
    path.resolve(currentDirPath, 'dist'),
    path.resolve(currentDirPath, '../dist'),
    (process as any).resourcesPath
      ? path.join((process as any).resourcesPath, 'app.asar', 'dist')
      : undefined,
    path.resolve(process.cwd(), 'dist'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) {
        return dir;
      }
    } catch {
      // Ignore path check error
    }
  }
  return explicitDistPath || path.resolve(currentDirPath, 'dist');
}

export async function startExpressServer(
  options: StartExpressServerOptions = {}
): Promise<StartedExpressServer> {
  const requestedPort = Number(options.port || process.env.PORT) || 3000;
  const host = options.host || '0.0.0.0';
  const isProd =
    typeof options.isProduction === 'boolean'
      ? options.isProduction
      : process.env.NODE_ENV === 'production' || Boolean((process as any).versions?.electron);

  if (options.nativeDecoder !== undefined) {
    registerElectronNativeDecoder(options.nativeDecoder);
  }

  const app = express();
  const server = http.createServer(app);

  // CORS headers for local Electron windows & LAN clients
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Intercept all /api/lan requests BEFORE express.json() so handleLanApi reads the raw request stream cleanly
  app.use(async (req, res, next) => {
    try {
      if (req.url && req.url.startsWith('/api/lan')) {
        const handled = await handleLanApi(req, res);
        if (handled) return;
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use(express.json({ limit: '25mb' }));

  if (!isProd) {
    // Vite Dev Server Middleware Mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host,
        port: requestedPort,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    // Production static serving from dist/
    const distPath = resolveProductionDistPath(options.distPath);
    app.use(express.static(distPath));

    // SPA fallback middleware (compatible with both Express 4 and Express 5 and Electron app.asar)
    app.use((_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      try {
        const html = fs.readFileSync(indexFile, 'utf8');
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
      } catch {
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(
          '<!doctype html><html><head><meta charset="utf-8"><title>ProTimer</title></head><body style="background:#0c0f16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Loading ProTimer...</body></html>'
        );
      }
    });
  }

  return new Promise((resolve, reject) => {
    const tryListen = (portToTry: number) => {
      const onError = (err: any) => {
        if (portToTry === requestedPort && err && err.code === 'EADDRINUSE') {
          tryListen(0);
        } else {
          reject(err);
        }
      };

      server.once('error', onError);
      server.listen(portToTry, host, () => {
        server.removeListener('error', onError);
        const addr = server.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : portToTry;
        setActiveLanPort(boundPort);
        const localUrl = `http://127.0.0.1:${boundPort}`;
        const ips = getLocalIpAddresses();
        console.log(`\n======================================================`);
        console.log(`  PROTIMER EXPRESS SERVER READY ON PORT ${boundPort}`);
        console.log(`======================================================`);
        console.log(`  Local Console: ${localUrl}`);
        ips.forEach((ip) => {
          console.log(`  LAN Remote Control: http://${ip}:${boundPort}/?display=lan_control`);
          console.log(`  LAN Stage Display:  http://${ip}:${boundPort}/?display=lan_display`);
        });
        console.log(`======================================================\n`);
        resolve({ server, port: boundPort, url: localUrl });
      });
    };

    tryListen(requestedPort);
  });
}

// Auto-start when executed directly via `tsx server.ts` or `node server.ts` (not when imported by Electron main.cjs)
const isRunningInElectronMain = Boolean((process as any).versions?.electron);
if (!isRunningInElectronMain) {
  startExpressServer().catch((err) => {
    console.error('Failed to start ProTimer server:', err);
    process.exit(1);
  });
}

