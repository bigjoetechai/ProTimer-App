/**
 * Full-Stack ProTimer Server.
 * Hosts the React SPA and provides real-time LAN Control, LAN Display,
 * and cross-device synchronization over the local network on port 3000.
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleLanApi, getLocalIpAddresses } from './server/lanHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const isDev = process.env.NODE_ENV !== 'production';

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // Intercept all /api/lan requests
  app.use(async (req, res, next) => {
    if (req.url && req.url.startsWith('/api/lan')) {
      const handled = await handleLanApi(req, res);
      if (handled) return;
    }
    next();
  });

  if (isDev) {
    // Vite Dev Server Middleware Mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: HOST,
        port: PORT,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    const ips = getLocalIpAddresses();
    console.log(`\n======================================================`);
    console.log(`  PROTIMER MASTER SERVER READY ON PORT ${PORT}`);
    console.log(`======================================================`);
    console.log(`  Local Console: http://localhost:${PORT}`);
    ips.forEach((ip) => {
      console.log(`  LAN Remote Control: http://${ip}:${PORT}/?display=lan_control`);
      console.log(`  LAN Stage Display:  http://${ip}:${PORT}/?display=lan_display`);
    });
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ProTimer server:', err);
  process.exit(1);
});
