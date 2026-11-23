/**
 * Electron Main Process for ProTimer (Windows 10 & Windows 11 64-bit Desktop Application).
 *
 * Application Identity:
 * - Application Name: ProTimer
 * - Application ID: com.protimer.desktop
 * - Version: 2.5.3
 *
 * Implements:
 * 1. Single-Instance Lock & Windows Application User Model ID (`com.protimer.desktop`).
 * 2. Embedded Local HTTP & LAN Synchronization Server (port 3000 with automatic port fallback)
 *    so LAN Control, LAN Display, SSE streaming, and BroadcastChannel work natively in the
 *    packaged Windows executable without requiring external Node.js.
 * 3. Professional Window Size & Resolution Management:
 *    - Default application window size: 1200 × 800 pixels.
 *    - Minimum application dimensions: 1000 × 650 pixels.
 *    - Window state persistence in `%APPDATA%\ProTimer\window-state.json`.
 *    - Disconnected monitor recovery: safely repositions to primary monitor if removed.
 * 4. Independent Dual Fullscreen Modes:
 *    - Mode A: APPLICATION FULLSCREEN (expands the entire operator dashboard).
 *    - Mode B: TIMER OUTPUT FULLSCREEN (dedicated borderless output window on selected monitor).
 * 5. Native Windows multi-monitor detection via Electron `screen` API with real-time hardware
 *    change events (`display-added`, `display-removed`, `display-metrics-changed`).
 * 6. Native Secondary Display Window Management (`setWindowOpenHandler`) so Presenter, Preview,
 *    Stage, and NDI displays open as native ProTimer windows rather than external browsers.
 * 7. Persistent User Data & Automatic Backup (`%APPDATA%\ProTimer\protimer-user-data.json` and
 *    `protimer-user-data.backup.json`) preserved across restarts, updates, and uninstalls.
 */

const { app, BrowserWindow, screen, ipcMain, session, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { exec } = require('child_process');
const { ndiNativeBridge } = require('../server/ndiNativeBridge.cjs');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (err) {
  console.warn('[AutoUpdater] electron-updater module not available:', err && err.message);
}

const APP_ID = 'com.protimer.desktop';
const APP_NAME = 'ProTimer';
const APP_COMPANY = 'Bigjoe Technology';
const APP_VERSION = '2.5.3';

// Set Windows Application User Model ID for taskbar grouping & notifications
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// =============================================================================
// SINGLE-INSTANCE LOCK (Prevent accidental multiple application instances)
// =============================================================================

let mainWindow = null;
let outputWindow = null;
const outputWindowsByList = new Map();
let multiOutputWindow = null;
let previewWindow = null;
let multiPreviewWindow = null;
let presenterWindow = null;
let ndiOffscreenWindow = null;
let currentOutputDisplayId = null;
const secondaryWindows = new Set();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// =============================================================================
// EMBEDDED PRODUCTION HTTP + LAN SERVER
// =============================================================================

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const devServerUrl = process.env.APP_URL || 'http://localhost:3000';
let activeLanPort = 3000;
let localServerUrl = devServerUrl;
let embeddedServer = null;

// LAN state for mobile/tablet remote control, LAN displays & NDI network stream
const crypto = require('crypto');
const lanState = {
  masterState: null,
  timers: [],
  accessPin: '1234',
  pinRequired: true,
  listConfigs: {},
  pendingCommands: [],
  ndiStream: {
    active: false,
    mode: 'single',
    multiMode: false,
    multiActive: false,
    activeByList: {},
    sourceNamesByList: {},
    activeSourceNames: [],
    sourceName: 'ProTimer (List 1)',
    multiSourceName: 'ProTimer (Multi Output)',
    resolution: 'HD - 1920 x 1080',
    width: 1920,
    height: 1080,
    frameRate: 30,
    alphaChannel: false,
    useCustomGroups: false,
    customGroups: 'Public',
    groups: 'Public',
    startedAt: null,
    lastFrameAt: null,
    frameCount: 0,
    lastFrameDataUrl: null,
    lastFrameTimestamp: 0,
  },
};
const sseClients = new Set();
const sseClientMeta = new Map();
const ndiStreamClients = new Set();

function getOrCreateEmbeddedListConfig(listId) {
  const key = listId || 'default';
  if (!lanState.listConfigs[key]) {
    lanState.listConfigs[key] = {
      listId: key,
      pin: lanState.accessPin || '1234',
      pinRequired: lanState.pinRequired,
      sessionToken: crypto.randomUUID(),
      desktopSessionToken: crypto.randomUUID(),
    };
  } else if (!lanState.listConfigs[key].desktopSessionToken) {
    lanState.listConfigs[key].desktopSessionToken = crypto.randomUUID();
  }
  return lanState.listConfigs[key];
}

function getEmbeddedControlPagesCountByList() {
  const mobileByList = {};
  const desktopByList = {};
  const totalByList = {};
  for (const meta of sseClientMeta.values()) {
    const lid = meta.listId || 'all';
    if (meta.role === 'lan_control' || meta.role === 'control') {
      mobileByList[lid] = (mobileByList[lid] || 0) + 1;
      totalByList[lid] = (totalByList[lid] || 0) + 1;
    } else if (meta.role === 'lan_desktop' || meta.role === 'desktop') {
      desktopByList[lid] = (desktopByList[lid] || 0) + 1;
      totalByList[lid] = (totalByList[lid] || 0) + 1;
    }
  }
  return { mobileByList, desktopByList, totalByList };
}

function pushFrameToEmbeddedNdiClients(dataUrl) {
  if (ndiStreamClients.size === 0 || !dataUrl) return;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return;
  const headerPart = dataUrl.slice(0, commaIdx);
  const base64Part = dataUrl.slice(commaIdx + 1);
  const mimeMatch = headerPart.match(/^data:([^;]+);base64$/);
  const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
  const buffer = Buffer.from(base64Part, 'base64');

  for (const res of ndiStreamClients) {
    try {
      res.write('--ndi_frame\r\n');
      res.write(`Content-Type: ${contentType}\r\n`);
      res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
      res.write(buffer);
      res.write('\r\n');
    } catch {
      ndiStreamClients.delete(res);
    }
  }
}

function stopElectronNdiOffscreenCapture() {
  if (ndiOffscreenWindow && !ndiOffscreenWindow.isDestroyed()) {
    try {
      ndiOffscreenWindow.close();
    } catch {
      // Ignore close error
    }
  }
  ndiOffscreenWindow = null;
}

function startElectronNdiOffscreenCapture() {
  // No-op: Frames are rendered by NdiStreamService in the main console and decoded natively
  // via Electron's C++ nativeImage.createFromDataURL().toBitmap() + async Koffi worker threads.
  // Spawning a hidden offscreen BrowserWindow is unnecessary and caused Windows 11 GPU/UI locks.
  stopElectronNdiOffscreenCapture();
}

function decodeDataUrlAndSendToNdi(dataUrl, targetSourceName = null) {
  if (!dataUrl || typeof dataUrl !== 'string' || !nativeImage) return;
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (!img || img.isEmpty()) return;
    const size = img.getSize();
    if (!size || size.width <= 0 || size.height <= 0) return;
    const bitmap = img.toBitmap();
    if (bitmap && bitmap.byteLength >= size.width * size.height * 4) {
      ndiNativeBridge.sendRawFrame(
        bitmap,
        size.width,
        size.height,
        'BGRA',
        lanState.ndiStream.frameRate,
        lanState.ndiStream.alphaChannel,
        targetSourceName
      );
    }
  } catch {
    // Ignore transient decode error
  }
}

function getLocalNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const iface of netList) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({ name, address: iface.address });
      }
    }
  }
  return list.length > 0 ? list : [{ name: 'Loopback', address: '127.0.0.1' }];
}

function getLocalIpAddresses() {
  return getLocalNetworkInterfaces().map((i) => i.address);
}

function broadcastSse(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

const EMBEDDED_MAX_BODY_BYTES = 256 * 1024;
const EMBEDDED_MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const EMBEDDED_MAX_PENDING_COMMANDS = 100;
const EMBEDDED_PIN_WINDOW_MS = 60 * 1000;
const EMBEDDED_PIN_MAX_FAILURES = 10;
const embeddedPinFailures = new Map();

function getEmbeddedClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isEmbeddedLoopbackOrConsole(req) {
  if (req.headers['x-protimer-console'] === '1') return true;
  const addr = (req.socket && req.socket.remoteAddress) || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function safeCompareEmbeddedPin(inputPin, expectedPin) {
  const hashA = crypto.createHash('sha256').update(String(inputPin)).digest();
  const hashB = crypto.createHash('sha256').update(String(expectedPin)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function isEmbeddedPinRateLimited(clientIp) {
  const now = Date.now();
  const entry = embeddedPinFailures.get(clientIp);
  if (!entry) return false;
  if (now > entry.resetAt) {
    embeddedPinFailures.delete(clientIp);
    return false;
  }
  return entry.count >= EMBEDDED_PIN_MAX_FAILURES;
}

function recordEmbeddedPinFailure(clientIp) {
  const now = Date.now();
  const entry = embeddedPinFailures.get(clientIp);
  if (!entry || now > entry.resetAt) {
    embeddedPinFailures.set(clientIp, { count: 1, resetAt: now + EMBEDDED_PIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearEmbeddedPinFailures(clientIp) {
  embeddedPinFailures.delete(clientIp);
}

function handleEmbeddedLanApi(req, res) {
  const url = req.url || '';
  if (!url.startsWith('/api/lan')) return false;

  const [pathname] = url.split('?');
  const method = req.method || 'GET';

  const readBody = (maxBytes = EMBEDDED_MAX_BODY_BYTES) =>
    new Promise((resolve) => {
      let data = '';
      let receivedBytes = 0;
      let aborted = false;
      req.on('data', (chunk) => {
        if (aborted) return;
        receivedBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        if (receivedBytes > maxBytes) {
          aborted = true;
          resolve({ __payloadTooLarge: true });
          try {
            req.destroy();
          } catch {
            // ignore
          }
          return;
        }
        data += chunk;
      });
      req.on('end', () => {
        if (aborted) return;
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => {
        if (!aborted) resolve({});
      });
    });

  const sendJson = (statusCode, payload) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ProTimer-Console',
    });
    res.end(JSON.stringify(payload));
  };

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ProTimer-Console',
    });
    res.end();
    return true;
  }

  if (pathname === '/api/lan/info' && method === 'GET') {
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const requestedListId =
      params.get('listId') ||
      (lanState.masterState && lanState.masterState.activeListId) ||
      'list_1';

    const listConfig = getOrCreateEmbeddedListConfig(requestedListId);
    const interfaces = getLocalNetworkInterfaces();
    const primaryIp = interfaces[0]?.address || '127.0.0.1';
    const baseOrigin = `http://${primaryIp}:${activeLanPort}`;
    const { mobileByList, desktopByList, totalByList } = getEmbeddedControlPagesCountByList();
    const mobileControlPagesOnList =
      (mobileByList[requestedListId] || 0) + (mobileByList['all'] || 0);
    const desktopControlPagesOnList =
      (desktopByList[requestedListId] || 0) + (desktopByList['all'] || 0);
    const controlPagesOnList =
      (totalByList[requestedListId] || 0) + (totalByList['all'] || 0);

    const isConsoleCaller = req.headers['x-protimer-console'] === '1';
    const sanitizedListConfigs = Object.fromEntries(
      Object.entries(lanState.listConfigs).map(([k, v]) => [
        k,
        isConsoleCaller
          ? v
          : {
              listId: v.listId,
              pinRequired: v.pinRequired,
            },
      ])
    );

    sendJson(200, {
      ip: primaryIp,
      ips: getLocalIpAddresses(),
      port: activeLanPort,
      listId: requestedListId,
      ...(isConsoleCaller
        ? {
            pin: listConfig.pin,
            defaultPin: listConfig.pin,
            sessionToken: listConfig.sessionToken,
            desktopSessionToken: listConfig.desktopSessionToken,
          }
        : {}),
      pinRequired: listConfig.pinRequired,
      listConfigs: sanitizedListConfigs,
      interfaces,
      controlUrl: `${baseOrigin}/?display=lan_control&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.sessionToken)}`,
      mobileControlUrl: `${baseOrigin}/?display=lan_control&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.sessionToken)}`,
      desktopControlUrl: `${baseOrigin}/?display=lan_desktop&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.desktopSessionToken)}`,
      displayUrl: `${baseOrigin}/?display=lan_display&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.sessionToken)}`,
      ndiStreamUrl: `${baseOrigin}/?display=ndi`,
      hasMaster: Boolean(lanState.masterState),
      connectedClients: sseClients.size,
      controlPagesOnList,
      mobileControlPagesOnList,
      desktopControlPagesOnList,
      controlPagesByList: totalByList,
      ndiStream: {
        active: lanState.ndiStream.active,
        multiMode: lanState.ndiStream.multiMode,
        sourceName: lanState.ndiStream.sourceName,
        resolution: lanState.ndiStream.resolution,
        frameRate: lanState.ndiStream.frameRate,
        alphaChannel: lanState.ndiStream.alphaChannel,
        groups: lanState.ndiStream.groups,
      },
    });
    return true;
  }

  if (pathname === '/api/lan/pin' && method === 'POST') {
    if (!isEmbeddedLoopbackOrConsole(req)) {
      sendJson(403, {
        success: false,
        error: 'Forbidden: PIN configuration can only be modified from the ProTimer Master Console.',
      });
      return true;
    }
    readBody().then((body) => {
      if (body.__payloadTooLarge) {
        sendJson(413, { success: false, error: 'Payload too large' });
        return;
      }
      const targetListId = typeof body.listId === 'string' && body.listId ? body.listId.slice(0, 64) : '';
      if (targetListId) {
        const cfg = getOrCreateEmbeddedListConfig(targetListId);
        if (typeof body.pin === 'string') {
          cfg.pin = body.pin.trim().slice(0, 32) || '1234';
        }
        if (typeof body.pinRequired === 'boolean') {
          cfg.pinRequired = body.pinRequired;
        }
        if (body.regenerateToken) {
          cfg.sessionToken = crypto.randomUUID();
          cfg.desktopSessionToken = crypto.randomUUID();
        }
        sendJson(200, {
          success: true,
          listId: targetListId,
          pin: cfg.pin,
          pinRequired: cfg.pinRequired,
          sessionToken: cfg.sessionToken,
          desktopSessionToken: cfg.desktopSessionToken,
          listConfigs: lanState.listConfigs,
        });
        return;
      }

      if (typeof body.pin === 'string') {
        lanState.accessPin = body.pin.trim().slice(0, 32) || '1234';
      }
      if (typeof body.pinRequired === 'boolean') {
        lanState.pinRequired = body.pinRequired;
      }
      sendJson(200, {
        success: true,
        pin: lanState.accessPin,
        pinRequired: lanState.pinRequired,
      });
    });
    return true;
  }

  if (pathname === '/api/lan/verify-pin' && method === 'POST') {
    const clientIp = getEmbeddedClientIp(req);
    if (isEmbeddedPinRateLimited(clientIp)) {
      sendJson(429, {
        valid: false,
        error: 'Too many failed PIN attempts. Please wait 60 seconds before trying again.',
      });
      return true;
    }
    readBody().then((body) => {
      if (body.__payloadTooLarge) {
        sendJson(413, { valid: false, error: 'Payload too large' });
        return;
      }
      const targetListId = typeof body.listId === 'string' && body.listId ? body.listId : '';
      const cfg = targetListId ? getOrCreateEmbeddedListConfig(targetListId) : null;
      const effectivePinRequired = cfg ? cfg.pinRequired : lanState.pinRequired;
      const effectivePin = cfg ? cfg.pin : lanState.accessPin;
      const candidatePin = String(body.pin || '').trim();

      if (!effectivePinRequired || safeCompareEmbeddedPin(candidatePin, effectivePin)) {
        clearEmbeddedPinFailures(clientIp);
        sendJson(200, {
          valid: true,
          listId: targetListId || undefined,
          token: `auth_${crypto.randomBytes(16).toString('hex')}`,
        });
      } else {
        recordEmbeddedPinFailure(clientIp);
        sendJson(401, {
          valid: false,
          error:
            'Invalid Access PIN. Please verify the Access PIN for this list on the ProTimer console.',
        });
      }
    });
    return true;
  }

  if (pathname === '/api/lan/state' && method === 'POST') {
    readBody(EMBEDDED_MAX_MEDIA_BYTES).then((body) => {
      const incoming = body.state;
      const prev = lanState.masterState;
      if (incoming) {
        if (!prev || !prev.timestamp || !incoming.timestamp || incoming.timestamp >= prev.timestamp) {
          if (incoming.backgroundImageUrl === '__CACHED__') {
            incoming.backgroundImageUrl = prev?.backgroundImageUrl || undefined;
          }
          if (incoming.logoImageUrl === '__CACHED__') {
            incoming.logoImageUrl = prev?.logoImageUrl || undefined;
          }
          if (Array.isArray(incoming.listActiveCues) && Array.isArray(prev?.listActiveCues)) {
            incoming.listActiveCues = incoming.listActiveCues.map((cue) => {
              if (cue.backgroundImageUrl === '__CACHED__') {
                const prevCue = prev.listActiveCues.find((c) => c.listId === cue.listId);
                return { ...cue, backgroundImageUrl: prevCue?.backgroundImageUrl || undefined };
              }
              return cue;
            });
          }
          if (incoming.preferences && prev?.preferences) {
            if (
              (!incoming.preferences.listBackgroundImages ||
                Object.keys(incoming.preferences.listBackgroundImages).length === 0) &&
              prev.preferences.listBackgroundImages &&
              Object.keys(prev.preferences.listBackgroundImages).length > 0
            ) {
              incoming.preferences.listBackgroundImages = prev.preferences.listBackgroundImages;
            }
            if (!incoming.preferences.backgroundImageDataUrl && prev.preferences.backgroundImageDataUrl) {
              incoming.preferences.backgroundImageDataUrl = prev.preferences.backgroundImageDataUrl;
            }
          }
          lanState.masterState = incoming;
          if (Array.isArray(body.timers)) lanState.timers = body.timers;
          broadcastSse({
            type: 'STATE_UPDATE',
            state: lanState.masterState,
            timers: lanState.timers,
            timestamp: incoming.timestamp || Date.now(),
          });
        }
      }
      sendJson(200, { success: true });
    });
    return true;
  }

  if (pathname === '/api/lan/state' && method === 'GET') {
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const reqListId = params.get('listId') || '';
    const cfg = reqListId ? getOrCreateEmbeddedListConfig(reqListId) : null;
    sendJson(200, {
      state: lanState.masterState,
      timers: lanState.timers,
      pinRequired: cfg ? cfg.pinRequired : lanState.pinRequired,
      timestamp: Date.now(),
    });
    return true;
  }

  if (pathname === '/api/lan/stream' && method === 'GET') {
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const clientListId = params.get('listId') || '';
    const clientRole = params.get('role') || 'master';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(
      `data: ${JSON.stringify({
        type: 'CONNECTED',
        state: lanState.masterState,
        timers: lanState.timers,
      })}\n\n`
    );
    sseClients.add(res);
    sseClientMeta.set(res, { listId: clientListId, role: clientRole });
    req.on('close', () => {
      sseClients.delete(res);
      sseClientMeta.delete(res);
    });
    return true;
  }

  if (pathname === '/api/lan/command' && method === 'POST') {
    const clientIp = getEmbeddedClientIp(req);
    if (isEmbeddedPinRateLimited(clientIp)) {
      sendJson(429, {
        success: false,
        error: 'Too many failed PIN attempts. Please wait 60 seconds before issuing commands.',
      });
      return true;
    }
    readBody().then((body) => {
      if (body.__payloadTooLarge) {
        sendJson(413, { success: false, error: 'Command payload too large' });
        return;
      }
      const clientPin = String(body.pin || '').trim();
      const cmdListId =
        (typeof body.listId === 'string' && body.listId) ||
        (body.payload && typeof body.payload.listId === 'string' && body.payload.listId) ||
        '';
      const cfg = cmdListId ? getOrCreateEmbeddedListConfig(cmdListId) : null;
      const effectivePinRequired = cfg ? cfg.pinRequired : lanState.pinRequired;
      const effectivePin = cfg ? cfg.pin : lanState.accessPin;

      if (effectivePinRequired && !safeCompareEmbeddedPin(clientPin, effectivePin)) {
        recordEmbeddedPinFailure(clientIp);
        sendJson(401, {
          success: false,
          error: 'Unauthorized: Valid Access PIN required to issue commands for this list',
        });
        return;
      }
      if (!body.command || typeof body.command !== 'string' || body.command.length > 64) {
        sendJson(400, { success: false, error: 'Missing or invalid command name' });
        return;
      }
      const commandEntry = {
        id: `cmd_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        command: String(body.command).trim().toUpperCase(),
        payload: body.payload,
        timestamp: Date.now(),
      };
      if (lanState.pendingCommands.length >= EMBEDDED_MAX_PENDING_COMMANDS) {
        lanState.pendingCommands.shift();
      }
      lanState.pendingCommands.push(commandEntry);
      broadcastSse({
        type: 'COMMAND_DISPATCHED',
        command: commandEntry,
      });
      sendJson(200, { success: true, commandId: commandEntry.id });
    });
    return true;
  }

  if (pathname === '/api/lan/commands' && method === 'GET') {
    const commands = [...lanState.pendingCommands];
    lanState.pendingCommands = [];
    sendJson(200, { commands });
    return true;
  }

  // GET /api/lan/ndi/status
  if (pathname === '/api/lan/ndi/status' && method === 'GET') {
    const ips = getLocalIpAddresses();
    const primaryIp = ips[0] || 'localhost';
    const nativeDiagnostics = ndiNativeBridge.getRuntimeDiagnostics();
    const nativeReceivers = Number(nativeDiagnostics?.connectedReceivers) || 0;
    sendJson(200, {
      ...lanState.ndiStream,
      ips,
      port: activeLanPort,
      receiversCount: ndiStreamClients.size + nativeReceivers,
      nativeNdi: nativeDiagnostics,
      captureUrls: {
        browserSourceUrl: `http://${primaryIp}:${activeLanPort}/?display=ndi`,
        mjpegStreamUrl: `http://${primaryIp}:${activeLanPort}/api/lan/ndi/mjpeg`,
        liveFrameUrl: `http://${primaryIp}:${activeLanPort}/api/lan/ndi/frame.png`,
      },
    });
    return true;
  }

  // POST /api/lan/ndi/config or POST /api/lan/ndi
  if ((pathname === '/api/lan/ndi/config' || pathname === '/api/lan/ndi') && method === 'POST') {
    readBody().then((body) => {
      const wasActive = lanState.ndiStream.active;
      const nextActive =
        typeof body.active === 'boolean' ? body.active : lanState.ndiStream.active;

      lanState.ndiStream.active = nextActive;
      if (body.mode === 'multi' || body.multiMode === true) {
        lanState.ndiStream.mode = 'multi';
        lanState.ndiStream.multiMode = true;
      } else if (body.mode === 'single' || body.multiMode === false) {
        lanState.ndiStream.mode = 'single';
        lanState.ndiStream.multiMode = false;
      }
      if (typeof body.multiActive === 'boolean') {
        lanState.ndiStream.multiActive = body.multiActive;
        lanState.ndiStream.multiMode = body.multiActive;
      }
      if (body.activeByList && typeof body.activeByList === 'object') {
        lanState.ndiStream.activeByList = body.activeByList;
      }
      if (body.sourceNamesByList && typeof body.sourceNamesByList === 'object') {
        lanState.ndiStream.sourceNamesByList = body.sourceNamesByList;
      }
      if (Array.isArray(body.activeSourceNames)) {
        lanState.ndiStream.activeSourceNames = body.activeSourceNames;
      }
      if (typeof body.sourceName === 'string' && body.sourceName.trim()) {
        lanState.ndiStream.sourceName = body.sourceName.trim();
      }
      if (typeof body.multiSourceName === 'string' && body.multiSourceName.trim()) {
        lanState.ndiStream.multiSourceName = body.multiSourceName.trim();
      }
      if (typeof body.resolution === 'string') {
        lanState.ndiStream.resolution = body.resolution;
      }
      if (typeof body.width === 'number') {
        lanState.ndiStream.width = body.width;
      }
      if (typeof body.height === 'number') {
        lanState.ndiStream.height = body.height;
      }
      if (typeof body.frameRate === 'number') {
        lanState.ndiStream.frameRate = body.frameRate;
      }
      if (typeof body.alphaChannel === 'boolean') {
        lanState.ndiStream.alphaChannel = body.alphaChannel;
      }
      if (typeof body.useCustomGroups === 'boolean') {
        lanState.ndiStream.useCustomGroups = body.useCustomGroups;
      }
      if (typeof body.customGroups === 'string') {
        lanState.ndiStream.customGroups = body.customGroups;
        lanState.ndiStream.groups = body.customGroups;
      } else if (typeof body.groups === 'string') {
        lanState.ndiStream.groups = body.groups;
        lanState.ndiStream.customGroups = body.groups;
      }

      lanState.ndiStream.startedAt = nextActive
        ? wasActive
          ? lanState.ndiStream.startedAt
          : Date.now()
        : null;

      let nativeDiagnostics;
      if (nextActive) {
        nativeDiagnostics = ndiNativeBridge.startSender({
          sourceName: lanState.ndiStream.sourceName,
          activeSourceNames: lanState.ndiStream.activeSourceNames,
          groups: lanState.ndiStream.customGroups,
          useCustomGroups: lanState.ndiStream.useCustomGroups,
          width: lanState.ndiStream.width,
          height: lanState.ndiStream.height,
          frameRate: lanState.ndiStream.frameRate,
          alphaChannel: lanState.ndiStream.alphaChannel,
          ips: getLocalIpAddresses(),
          port: 5961,
        });
        startElectronNdiOffscreenCapture();
      } else {
        lanState.ndiStream.lastFrameDataUrl = null;
        lanState.ndiStream.frameCount = 0;
        stopElectronNdiOffscreenCapture();
        nativeDiagnostics = ndiNativeBridge.stopSender();
      }

      broadcastSse({
        type: 'NDI_STREAM_UPDATED',
        ndiStream: lanState.ndiStream,
        nativeNdi: nativeDiagnostics,
        timestamp: Date.now(),
      });
      sendJson(200, {
        success: true,
        ndiStream: lanState.ndiStream,
        nativeNdi: nativeDiagnostics,
      });
    });
    return true;
  }

  // POST /api/lan/ndi/frame
  if (pathname === '/api/lan/ndi/frame' && method === 'POST') {
    readBody(EMBEDDED_MAX_MEDIA_BYTES).then((body) => {
      if (body.__payloadTooLarge) {
        sendJson(413, { success: false, error: 'Frame payload too large' });
        return;
      }
      const dataUrl = body.frameDataUrl || body.frame;
      const primarySourceName =
        (typeof body.sourceName === 'string' && body.sourceName.trim()) ||
        lanState.ndiStream.sourceName;

      const sentSourcesInBatch = new Set();

      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
        lanState.ndiStream.lastFrameDataUrl = dataUrl;
        lanState.ndiStream.lastFrameTimestamp = Date.now();
        lanState.ndiStream.lastFrameAt = Date.now();
        lanState.ndiStream.frameCount += 1;
        pushFrameToEmbeddedNdiClients(dataUrl);
        if (primarySourceName) {
          decodeDataUrlAndSendToNdi(dataUrl, primarySourceName);
          sentSourcesInBatch.add(primarySourceName);
        }
      }

      if (body.perListFrames && typeof body.perListFrames === 'object') {
        for (const [lid, entry] of Object.entries(body.perListFrames)) {
          if (entry && typeof entry === 'object' && typeof entry.frameDataUrl === 'string') {
            lanState.ndiStream.framesByList[lid] = entry.frameDataUrl;
            const listSource =
              (typeof entry.sourceName === 'string' && entry.sourceName.trim()) ||
              lanState.ndiStream.sourceNamesByList?.[lid] ||
              null;
            if (listSource && !sentSourcesInBatch.has(listSource)) {
              decodeDataUrlAndSendToNdi(entry.frameDataUrl, listSource);
              sentSourcesInBatch.add(listSource);
            }
          }
        }
      }

      const nativeReceivers = ndiNativeBridge.getConnectedReceiversCount();
      sendJson(200, {
        success: true,
        receiversCount: ndiStreamClients.size + nativeReceivers,
        frameCount: lanState.ndiStream.frameCount,
      });
    });
    return true;
  }

  // GET /api/lan/ndi/frame or /api/lan/ndi/frame.png
  if (
    (pathname === '/api/lan/ndi/frame' || pathname === '/api/lan/ndi/frame.png') &&
    method === 'GET'
  ) {
    if (!lanState.ndiStream.active || !lanState.ndiStream.lastFrameDataUrl) {
      sendJson(404, { error: 'NDI stream is currently inactive or no frame available' });
      return true;
    }
    const commaIdx = lanState.ndiStream.lastFrameDataUrl.indexOf(',');
    const headerPart = lanState.ndiStream.lastFrameDataUrl.slice(0, commaIdx);
    const base64Part = lanState.ndiStream.lastFrameDataUrl.slice(commaIdx + 1);
    const mimeMatch = headerPart.match(/^data:([^;]+);base64$/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
    const buffer = Buffer.from(base64Part, 'base64');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'X-NDI-Source-Name': lanState.ndiStream.sourceName,
    });
    res.end(buffer);
    return true;
  }

  // GET /api/lan/ndi/mjpeg
  if (pathname === '/api/lan/ndi/mjpeg' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=ndi_frame',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-NDI-Source-Name': lanState.ndiStream.sourceName,
    });
    ndiStreamClients.add(res);
    req.on('close', () => {
      ndiStreamClients.delete(res);
    });
    return true;
  }

  if (pathname === '/api/lan/ndi' && method === 'GET') {
    sendJson(200, {
      ...lanState.ndiStream,
      frame: lanState.ndiStream.lastFrameDataUrl,
      nativeNdi: ndiNativeBridge.getRuntimeDiagnostics(),
    });
    return true;
  }

  return false;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

function startEmbeddedProductionServer() {
  if (isDev) {
    localServerUrl = devServerUrl;
    return Promise.resolve(localServerUrl);
  }

  const distDir = path.resolve(__dirname, '../dist');

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        if (handleEmbeddedLanApi(req, res)) return;

        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let decodedPathname = '/';
        try {
          decodedPathname = decodeURIComponent(parsedUrl.pathname);
        } catch {
          res.writeHead(400, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' });
          res.end('Bad Request');
          return;
        }

        // Strict path traversal protection: ensure resolved file stays inside distDir
        let filePath = path.resolve(distDir, '.' + decodedPathname);
        if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
          res.writeHead(403, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' });
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        });
        res.end(content);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' });
        res.end('Internal Server Error');
      }
    });

    const tryListen = (portToTry) => {
      server.once('error', () => {
        if (portToTry === 3000) {
          tryListen(0); // Fallback to OS-assigned free port if 3000 is occupied
        } else {
          localServerUrl = `file://${path.join(distDir, 'index.html')}`;
          resolve(localServerUrl);
        }
      });

      server.listen(portToTry, '0.0.0.0', () => {
        const addr = server.address();
        activeLanPort = typeof addr === 'object' && addr ? addr.port : portToTry;
        localServerUrl = `http://127.0.0.1:${activeLanPort}`;
        embeddedServer = server;
        resolve(localServerUrl);
      });
    };

    tryListen(3000);
  });
}

function getBaseUrl() {
  if (isDev) {
    return devServerUrl;
  }
  return localServerUrl;
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../build/icon_ec9a41ea.png'),
    path.join(__dirname, '../public/icon.ico'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../public/assets/aistudio/icon_ec9a41ea.png'),
    path.join(__dirname, '../public/assets/aistudio/ProTimer_icon_ec9a41ea.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

// =============================================================================
// WINDOW STATE & USER DATA PERSISTENCE (%APPDATA%\ProTimer)
// =============================================================================

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 1000;
const MIN_HEIGHT = 650;

function getWindowStateFilePath() {
  try {
    return path.join(app.getPath('userData'), 'window-state.json');
  } catch {
    return path.join(__dirname, 'window-state.json');
  }
}

function getUserDataFilePath() {
  try {
    return path.join(app.getPath('userData'), 'protimer-user-data.json');
  } catch {
    return path.join(__dirname, 'protimer-user-data.json');
  }
}

function getUserDataBackupFilePath() {
  try {
    return path.join(app.getPath('userData'), 'protimer-user-data.backup.json');
  } catch {
    return path.join(__dirname, 'protimer-user-data.backup.json');
  }
}

function readPersistentUserData() {
  const mainFile = getUserDataFilePath();
  const backupFile = getUserDataBackupFilePath();

  for (const file of [mainFile, backupFile]) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`Failed reading user data file ${file}:`, err);
    }
  }
  return null;
}

function writePersistentUserData(data) {
  if (!data || typeof data !== 'object') return false;
  try {
    const userDataDir = path.dirname(getUserDataFilePath());
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const mainFile = getUserDataFilePath();
    const backupFile = getUserDataBackupFilePath();

    // Rotate previous valid save to .backup.json
    if (fs.existsSync(mainFile)) {
      try {
        fs.copyFileSync(mainFile, backupFile);
      } catch {
        // Ignore backup copy warning
      }
    }

    const serialized = JSON.stringify(
      {
        version: APP_VERSION,
        appId: APP_ID,
        ...data,
        updatedAt: Date.now(),
      },
      null,
      2
    );

    fs.writeFileSync(mainFile, serialized, 'utf8');
    return true;
  } catch (err) {
    console.warn('Could not write protimer-user-data.json:', err);
    return false;
  }
}

function loadWindowState() {
  const filePath = getWindowStateFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        return {
          width: Math.max(MIN_WIDTH, parsed.width),
          height: Math.max(MIN_HEIGHT, parsed.height),
          x: typeof parsed.x === 'number' ? parsed.x : undefined,
          y: typeof parsed.y === 'number' ? parsed.y : undefined,
          isMaximized: Boolean(parsed.isMaximized),
          isFullScreen: Boolean(parsed.isFullScreen),
          displayId: parsed.displayId,
        };
      }
    }
  } catch (err) {
    console.warn('Could not read window-state.json, using defaults:', err);
  }

  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x: undefined,
    y: undefined,
    isMaximized: false,
    isFullScreen: false,
  };
}

let saveStateTimeout = null;
function saveWindowState(state) {
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  saveStateTimeout = setTimeout(() => {
    try {
      const filePath = getWindowStateFilePath();
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.warn('Could not save window-state.json:', err);
    }
  }, 300);
}

/**
 * Validate that a target (x, y, width, height) is visible on an active monitor.
 * If the monitor is disconnected or coordinates are off-screen, recalculates coordinates
 * to center the window safely on the primary monitor.
 */
function sanitizeWindowBounds(state) {
  const allDisplays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const primaryWorkArea = primary.workArea;

  const width = Math.max(MIN_WIDTH, state.width || DEFAULT_WIDTH);
  const height = Math.max(MIN_HEIGHT, state.height || DEFAULT_HEIGHT);

  let x = state.x;
  let y = state.y;

  if (x === undefined || y === undefined) {
    x = primaryWorkArea.x + Math.max(0, Math.floor((primaryWorkArea.width - width) / 2));
    y = primaryWorkArea.y + Math.max(0, Math.floor((primaryWorkArea.height - height) / 2));
    return { x, y, width, height, isMaximized: state.isMaximized, isFullScreen: state.isFullScreen };
  }

  const isInsideConnectedDisplay = allDisplays.some((display) => {
    const b = display.bounds;
    return (
      x + 150 > b.x &&
      x < b.x + b.width - 150 &&
      y + 100 > b.y &&
      y < b.y + b.height - 100
    );
  });

  if (!isInsideConnectedDisplay) {
    x = primaryWorkArea.x + Math.max(0, Math.floor((primaryWorkArea.width - width) / 2));
    y = primaryWorkArea.y + Math.max(0, Math.floor((primaryWorkArea.height - height) / 2));
  }

  return {
    x,
    y,
    width,
    height,
    isMaximized: state.isMaximized,
    isFullScreen: state.isFullScreen,
  };
}

// =============================================================================
// NATIVE MONITOR DETECTION
// =============================================================================

function getDisplaysInfo() {
  if (!app.isReady()) return [];
  const primary = screen.getPrimaryDisplay();
  const all = screen.getAllDisplays();

  return all.map((d, index) => ({
    id: d.id,
    displayIndex: index + 1,
    name: d.label || `Display ${index + 1}`,
    isPrimary: d.id === primary.id,
    resolution: `${d.bounds.width} × ${d.bounds.height}`,
    bounds: {
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
    },
    workArea: {
      x: d.workArea.x,
      y: d.workArea.y,
      width: d.workArea.width,
      height: d.workArea.height,
    },
    scaleFactor: d.scaleFactor,
    rotation: d.rotation || 0,
    touchSupport: d.touchSupport || 'unknown',
    internal: d.internal || false,
  }));
}

function notifyDisplaysChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const displays = getDisplaysInfo();
    mainWindow.webContents.send('displays-changed', displays);
  }
}

function notifyOutputClosed(closedListId) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const activeListIds = [];
    for (const [k, entry] of outputWindowsByList.entries()) {
      if (entry && entry.win && !entry.win.isDestroyed()) {
        activeListIds.push(k);
      }
    }
    mainWindow.webContents.send('output-closed', {
      listId: closedListId || null,
      activeListIds,
    });
  }
}

function notifyMultiOutputClosed() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('multi-output-closed');
  }
}

function notifyPreviewStateChanged(isOpen) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('preview-window-state', Boolean(isOpen));
  }
}

function notifyMultiPreviewStateChanged(isOpen) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('multi-preview-window-state', Boolean(isOpen));
  }
}

function notifyPresenterStateChanged(isOpen) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('presenter-window-state', Boolean(isOpen));
  }
}

function notifyWindowStateChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    mainWindow.webContents.send('window-state-changed', {
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen(),
      width: bounds.width,
      height: bounds.height,
    });
  }
}

// =============================================================================
// MAIN APPLICATION WINDOW
// =============================================================================

function createMainWindow() {
  const savedState = loadWindowState();
  const bounds = sanitizeWindowBounds(savedState);
  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    title: 'ProTimer - Multi-Timer Management',
    icon: iconPath,
    backgroundColor: '#0c0f16',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Intercept window.open calls (Stage, NDI, etc.)
  // Route preview/presenter to singleton frameless always-on-top windows so 2 windows never open
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isPreviewWindow = typeof url === 'string' && url.includes('display=preview');
    const isMultiPreviewWindow = typeof url === 'string' && url.includes('display=multi_preview');
    const isPresenterWindow = typeof url === 'string' && url.includes('display=presenter');

    if (isPreviewWindow) {
      openPreviewWindow();
      return { action: 'deny' };
    }
    if (isMultiPreviewWindow) {
      openMultiPreviewWindow();
      return { action: 'deny' };
    }
    if (isPresenterWindow) {
      openPresenterWindow();
      return { action: 'deny' };
    }

    // Security check: only allow opening child windows with preload for trusted local ProTimer URLs
    let isTrustedAppUrl = false;
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol === 'file:' ||
        (parsed.protocol === 'http:' &&
          (parsed.hostname === '127.0.0.1' ||
            parsed.hostname === 'localhost' ||
            getLocalIpAddresses().includes(parsed.hostname)))
      ) {
        isTrustedAppUrl = true;
      }
    } catch {
      isTrustedAppUrl = false;
    }

    if (!isTrustedAppUrl) {
      return { action: 'deny' };
    }

    const childWin = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 640,
      minHeight: 400,
      resizable: true,
      title: 'ProTimer - Display Output',
      icon: iconPath,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    secondaryWindows.add(childWin);
    childWin.loadURL(url);
    childWin.on('closed', () => {
      secondaryWindows.delete(childWin);
    });

    return { action: 'deny' };
  });

  const url = getBaseUrl();
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    if (bounds.isMaximized) {
      mainWindow.maximize();
    } else if (bounds.isFullScreen) {
      mainWindow.setFullScreen(true);
    }
    mainWindow.show();
    notifyWindowStateChanged();
  });

  const captureAndSaveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMax = mainWindow.isMaximized();
    const isFS = mainWindow.isFullScreen();
    let currentBounds;

    if (!isMax && !isFS) {
      currentBounds = mainWindow.getBounds();
    } else {
      currentBounds = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
      };
    }

    saveWindowState({
      x: currentBounds.x,
      y: currentBounds.y,
      width: currentBounds.width,
      height: currentBounds.height,
      isMaximized: isMax,
      isFullScreen: isFS,
    });

    notifyWindowStateChanged();
  };

  mainWindow.on('resize', captureAndSaveState);
  mainWindow.on('move', captureAndSaveState);
  mainWindow.on('maximize', captureAndSaveState);
  mainWindow.on('unmaximize', captureAndSaveState);
  mainWindow.on('enter-full-screen', captureAndSaveState);
  mainWindow.on('leave-full-screen', captureAndSaveState);

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const entry of outputWindowsByList.values()) {
      if (entry && entry.win && !entry.win.isDestroyed()) {
        entry.win.close();
      }
    }
    outputWindowsByList.clear();
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
      outputWindow = null;
    }
    if (multiOutputWindow && !multiOutputWindow.isDestroyed()) {
      multiOutputWindow.close();
      multiOutputWindow = null;
    }
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
      previewWindow = null;
    }
    if (multiPreviewWindow && !multiPreviewWindow.isDestroyed()) {
      multiPreviewWindow.close();
      multiPreviewWindow = null;
    }
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.close();
      presenterWindow = null;
    }
    stopElectronNdiOffscreenCapture();
    ndiNativeBridge.stopSender();
    for (const win of secondaryWindows) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    secondaryWindows.clear();
  });
}

// =============================================================================
// SINGLETON FRAMELESS ALWAYS-ON-TOP RESIZABLE PREVIEW & PRESENTER WINDOWS
// =============================================================================

function applyAlwaysOnTopOverlap(win) {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    // Ignore on platforms where visibleOnFullScreen option is unsupported
  }
}

function openPreviewWindow() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    applyAlwaysOnTopOverlap(previewWindow);
    previewWindow.show();
    previewWindow.focus();
    notifyPreviewStateChanged(true);
    return { active: true };
  }

  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;
  const defaultW = 360;
  const defaultH = 240;
  const defaultX = workArea.x + Math.max(20, workArea.width - defaultW - 32);
  const defaultY = workArea.y + Math.max(48, workArea.height - defaultH - 96);

  previewWindow = new BrowserWindow({
    x: defaultX,
    y: defaultY,
    width: defaultW,
    height: defaultH,
    minWidth: 150,
    minHeight: 90,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    hasShadow: true,
    show: false,
    paintWhenInitiallyHidden: true,
    icon: getAppIconPath(),
    backgroundColor: '#000000',
    title: 'ProTimer - Preview',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  applyAlwaysOnTopOverlap(previewWindow);

  const baseUrl = getBaseUrl();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const previewUrl = `${baseUrl}${separator}display=preview`;

  previewWindow.once('ready-to-show', () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      applyAlwaysOnTopOverlap(previewWindow);
      previewWindow.show();
      notifyPreviewStateChanged(true);
    }
  });

  previewWindow.on('blur', () => applyAlwaysOnTopOverlap(previewWindow));
  previewWindow.on('show', () => applyAlwaysOnTopOverlap(previewWindow));

  previewWindow.loadURL(previewUrl);

  previewWindow.on('closed', () => {
    previewWindow = null;
    notifyPreviewStateChanged(false);
  });

  notifyPreviewStateChanged(true);
  return { active: true };
}

function closePreviewWindow() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close();
    previewWindow = null;
  }
  notifyPreviewStateChanged(false);
  return { active: false };
}

function togglePreviewWindow() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    return closePreviewWindow();
  }
  return openPreviewWindow();
}

function openMultiPreviewWindow() {
  if (multiPreviewWindow && !multiPreviewWindow.isDestroyed()) {
    applyAlwaysOnTopOverlap(multiPreviewWindow);
    multiPreviewWindow.show();
    multiPreviewWindow.focus();
    notifyMultiPreviewStateChanged(true);
    return { active: true };
  }

  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;
  const defaultW = 540;
  const defaultH = 360;
  const defaultX = workArea.x + Math.max(20, Math.floor((workArea.width - defaultW) / 2));
  const defaultY = workArea.y + Math.max(48, workArea.height - defaultH - 96);

  multiPreviewWindow = new BrowserWindow({
    x: defaultX,
    y: defaultY,
    width: defaultW,
    height: defaultH,
    minWidth: 320,
    minHeight: 200,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    hasShadow: true,
    show: false,
    paintWhenInitiallyHidden: true,
    icon: getAppIconPath(),
    backgroundColor: '#06080d',
    title: 'ProTimer - Multi Preview',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  applyAlwaysOnTopOverlap(multiPreviewWindow);

  const baseUrl = getBaseUrl();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const multiPreviewUrl = `${baseUrl}${separator}display=multi_preview`;

  multiPreviewWindow.once('ready-to-show', () => {
    if (multiPreviewWindow && !multiPreviewWindow.isDestroyed()) {
      applyAlwaysOnTopOverlap(multiPreviewWindow);
      multiPreviewWindow.show();
      notifyMultiPreviewStateChanged(true);
    }
  });

  multiPreviewWindow.on('blur', () => applyAlwaysOnTopOverlap(multiPreviewWindow));
  multiPreviewWindow.on('show', () => applyAlwaysOnTopOverlap(multiPreviewWindow));

  multiPreviewWindow.loadURL(multiPreviewUrl);

  multiPreviewWindow.on('closed', () => {
    multiPreviewWindow = null;
    notifyMultiPreviewStateChanged(false);
  });

  notifyMultiPreviewStateChanged(true);
  return { active: true };
}

function closeMultiPreviewWindow() {
  if (multiPreviewWindow && !multiPreviewWindow.isDestroyed()) {
    multiPreviewWindow.close();
    multiPreviewWindow = null;
  }
  notifyMultiPreviewStateChanged(false);
  return { active: false };
}

function toggleMultiPreviewWindow() {
  if (multiPreviewWindow && !multiPreviewWindow.isDestroyed()) {
    return closeMultiPreviewWindow();
  }
  return openMultiPreviewWindow();
}

function openPresenterWindow() {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    applyAlwaysOnTopOverlap(presenterWindow);
    presenterWindow.show();
    presenterWindow.focus();
    notifyPresenterStateChanged(true);
    return { active: true };
  }

  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;
  const defaultW = 360;
  const defaultH = 240;
  const defaultX = workArea.x + 28;
  const defaultY = workArea.y + Math.max(48, workArea.height - defaultH - 96);

  presenterWindow = new BrowserWindow({
    x: defaultX,
    y: defaultY,
    width: defaultW,
    height: defaultH,
    minWidth: 150,
    minHeight: 90,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    hasShadow: true,
    show: false,
    paintWhenInitiallyHidden: true,
    icon: getAppIconPath(),
    backgroundColor: '#000000',
    title: 'ProTimer - Presenter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  applyAlwaysOnTopOverlap(presenterWindow);

  const baseUrl = getBaseUrl();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const presenterUrl = `${baseUrl}${separator}display=presenter`;

  presenterWindow.once('ready-to-show', () => {
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      applyAlwaysOnTopOverlap(presenterWindow);
      presenterWindow.show();
      notifyPresenterStateChanged(true);
    }
  });

  presenterWindow.on('blur', () => applyAlwaysOnTopOverlap(presenterWindow));
  presenterWindow.on('show', () => applyAlwaysOnTopOverlap(presenterWindow));

  presenterWindow.loadURL(presenterUrl);

  presenterWindow.on('closed', () => {
    presenterWindow = null;
    notifyPresenterStateChanged(false);
  });

  notifyPresenterStateChanged(true);
  return { active: true };
}

function closePresenterWindow() {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.close();
    presenterWindow = null;
  }
  notifyPresenterStateChanged(false);
  return { active: false };
}

function togglePresenterWindow() {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    return closePresenterWindow();
  }
  return openPresenterWindow();
}

// =============================================================================
// MODE B: TIMER OUTPUT FULLSCREEN (Dedicated Output on Target External Monitor)
// =============================================================================

function resolveTargetDisplay(monitorId) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  if (!monitorId || monitorId === 'Auto' || monitorId === 'auto') {
    // Prefer a connected external (non-primary) display if available, otherwise primary
    const externalDisplay = displays.find((d) => d.id !== primary.id);
    return externalDisplay || primary;
  }

  const matched = displays.find((d) => String(d.id) === String(monitorId));
  return matched || primary;
}

function openFullscreenOutput(monitorId, displayTarget = 'fullscreen', listId = 'default') {
  const key = String(listId || 'default');
  const targetDisplay = resolveTargetDisplay(monitorId);
  const { x, y, width, height } = targetDisplay.bounds;
  currentOutputDisplayId = targetDisplay.id;

  const existing = outputWindowsByList.get(key);
  if (existing && existing.win && !existing.win.isDestroyed()) {
    existing.displayId = targetDisplay.id;
    existing.win.setFullScreen(false);
    existing.win.setBounds({ x, y, width, height });
    existing.win.setFullScreen(true);
    existing.win.show();
    existing.win.focus();
    return { success: true, displayId: targetDisplay.id, listId: key };
  }

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    paintWhenInitiallyHidden: true,
    icon: getAppIconPath(),
    backgroundColor: '#000000',
    title: `ProTimer - Fullscreen Live Output (${key})`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  outputWindow = win;
  outputWindowsByList.set(key, {
    win,
    displayId: targetDisplay.id,
    listId: key,
  });

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      closeFullscreenOutput(key);
    }
  });

  const baseUrl = getBaseUrl();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const listParam = key !== 'default' ? `&listId=${encodeURIComponent(key)}` : '';
  const outputUrl = `${baseUrl}${separator}display=${encodeURIComponent(displayTarget)}${listParam}`;

  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) {
      win.setFullScreen(true);
      win.show();
      win.focus();
    }
  });

  win.loadURL(outputUrl);

  win.on('closed', () => {
    outputWindowsByList.delete(key);
    if (outputWindow === win) {
      outputWindow = null;
      currentOutputDisplayId = null;
    }
    notifyOutputClosed(key);
  });

  return { success: true, displayId: targetDisplay.id, listId: key };
}

function closeFullscreenOutput(listId) {
  if (listId && typeof listId === 'string') {
    const key = String(listId);
    const existing = outputWindowsByList.get(key);
    if (existing && existing.win && !existing.win.isDestroyed()) {
      outputWindowsByList.delete(key);
      existing.win.close();
      notifyOutputClosed(key);
      return true;
    }
    return false;
  }

  let closedAny = false;
  for (const [key, entry] of Array.from(outputWindowsByList.entries())) {
    outputWindowsByList.delete(key);
    if (entry && entry.win && !entry.win.isDestroyed()) {
      entry.win.close();
      closedAny = true;
    }
  }
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.close();
    outputWindow = null;
    closedAny = true;
  }
  currentOutputDisplayId = null;
  if (closedAny) {
    notifyOutputClosed(null);
  }
  return closedAny;
}

// =============================================================================
// INDEPENDENT MULTI FULLSCREEN OUTPUT (All List Tabs Active Cue Multiview)
// =============================================================================

function openMultiFullscreenOutput(monitorId) {
  const targetDisplay = resolveTargetDisplay(monitorId);
  const { x, y, width, height } = targetDisplay.bounds;

  if (multiOutputWindow && !multiOutputWindow.isDestroyed()) {
    multiOutputWindow.setFullScreen(false);
    multiOutputWindow.setBounds({ x, y, width, height });
    multiOutputWindow.setFullScreen(true);
    multiOutputWindow.show();
    multiOutputWindow.focus();
    return { success: true, displayId: targetDisplay.id };
  }

  multiOutputWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    paintWhenInitiallyHidden: true,
    icon: getAppIconPath(),
    backgroundColor: '#000000',
    title: 'ProTimer - Multi Fullscreen Output (All Lists)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  multiOutputWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      closeMultiFullscreenOutput();
    }
  });

  const baseUrl = getBaseUrl();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const outputUrl = `${baseUrl}${separator}display=multi_fullscreen`;

  multiOutputWindow.once('ready-to-show', () => {
    if (multiOutputWindow && !multiOutputWindow.isDestroyed()) {
      multiOutputWindow.setFullScreen(true);
      multiOutputWindow.show();
      multiOutputWindow.focus();
    }
  });

  multiOutputWindow.loadURL(outputUrl);

  multiOutputWindow.on('closed', () => {
    multiOutputWindow = null;
    notifyMultiOutputClosed();
  });

  return { success: true, displayId: targetDisplay.id };
}

function closeMultiFullscreenOutput() {
  if (multiOutputWindow && !multiOutputWindow.isDestroyed()) {
    multiOutputWindow.close();
    multiOutputWindow = null;
    notifyMultiOutputClosed();
    return true;
  }
  return false;
}

// =============================================================================
// MODE A: APPLICATION FULLSCREEN (Main Operator Dashboard Window)
// =============================================================================

function toggleAppFullscreen(monitorId) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const currentFS = mainWindow.isFullScreen();

  if (currentFS) {
    mainWindow.setFullScreen(false);
    return false;
  }

  if (monitorId && monitorId !== 'Auto' && monitorId !== 'auto') {
    const displays = screen.getAllDisplays();
    const target = displays.find((d) => String(d.id) === String(monitorId));
    if (target) {
      mainWindow.setBounds(target.bounds);
    }
  }

  mainWindow.setFullScreen(true);
  return true;
}

// =============================================================================
// DISCONNECTED MONITOR RECOVERY
// =============================================================================

function handleDisplayRemoved(oldDisplay) {
  const primary = screen.getPrimaryDisplay();

  for (const entry of outputWindowsByList.values()) {
    if (entry && entry.win && !entry.win.isDestroyed() && entry.displayId === oldDisplay.id) {
      entry.displayId = primary.id;
      entry.win.setFullScreen(false);
      entry.win.setBounds(primary.bounds);
      entry.win.setFullScreen(true);
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentBounds = mainWindow.getBounds();
    const allDisplays = screen.getAllDisplays();
    const isVisible = allDisplays.some((d) => {
      const b = d.bounds;
      return (
        currentBounds.x + 100 > b.x &&
        currentBounds.x < b.x + b.width - 100 &&
        currentBounds.y + 100 > b.y &&
        currentBounds.y < b.y + b.height - 100
      );
    });

    if (!isVisible) {
      const pWork = primary.workArea;
      const w = Math.min(pWork.width, Math.max(MIN_WIDTH, currentBounds.width));
      const h = Math.min(pWork.height, Math.max(MIN_HEIGHT, currentBounds.height));
      const x = pWork.x + Math.max(0, Math.floor((pWork.width - w) / 2));
      const y = pWork.y + Math.max(0, Math.floor((pWork.height - h) / 2));
      mainWindow.setBounds({ x, y, width: w, height: h });
    }
  }
}

// =============================================================================
// IPC HANDLERS (With input validation)
// =============================================================================

ipcMain.handle('get-displays', async () => {
  return getDisplaysInfo();
});

ipcMain.handle('open-fullscreen-output', async (_event, options = {}) => {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const monitorId =
    typeof safeOptions.monitorId === 'string' || typeof safeOptions.monitorId === 'number'
      ? safeOptions.monitorId
      : 'Auto';
  const displayTarget =
    typeof safeOptions.displayTarget === 'string' ? safeOptions.displayTarget : 'fullscreen';
  const listId =
    typeof safeOptions.listId === 'string' && safeOptions.listId.trim()
      ? safeOptions.listId.trim()
      : 'default';
  return openFullscreenOutput(monitorId, displayTarget, listId);
});

ipcMain.handle('close-fullscreen-output', async (_event, listId) => {
  const safeListId = typeof listId === 'string' && listId.trim() ? listId.trim() : undefined;
  return closeFullscreenOutput(safeListId);
});

ipcMain.handle('is-fullscreen-output-active', async (_event, listId) => {
  if (typeof listId === 'string' && listId.trim()) {
    const entry = outputWindowsByList.get(listId.trim());
    return Boolean(entry && entry.win && !entry.win.isDestroyed());
  }
  for (const entry of outputWindowsByList.values()) {
    if (entry && entry.win && !entry.win.isDestroyed()) return true;
  }
  return Boolean(outputWindow && !outputWindow.isDestroyed());
});

ipcMain.handle('get-active-fullscreen-lists', async () => {
  const active = [];
  for (const [k, entry] of outputWindowsByList.entries()) {
    if (entry && entry.win && !entry.win.isDestroyed()) {
      active.push(k);
    }
  }
  return active;
});

ipcMain.handle('open-multi-fullscreen-output', async (_event, options = {}) => {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const monitorId =
    typeof safeOptions.monitorId === 'string' || typeof safeOptions.monitorId === 'number'
      ? safeOptions.monitorId
      : 'Auto';
  return openMultiFullscreenOutput(monitorId);
});

ipcMain.handle('close-multi-fullscreen-output', async () => {
  return closeMultiFullscreenOutput();
});

ipcMain.handle('is-multi-fullscreen-output-active', async () => {
  return Boolean(multiOutputWindow && !multiOutputWindow.isDestroyed());
});

ipcMain.handle('toggle-preview-window', async () => {
  return togglePreviewWindow();
});

ipcMain.handle('open-preview-window', async () => {
  return openPreviewWindow();
});

ipcMain.handle('close-preview-window', async () => {
  return closePreviewWindow();
});

ipcMain.handle('is-preview-window-active', async () => {
  return Boolean(previewWindow && !previewWindow.isDestroyed());
});

ipcMain.handle('toggle-multi-preview-window', async () => {
  return toggleMultiPreviewWindow();
});

ipcMain.handle('open-multi-preview-window', async () => {
  return openMultiPreviewWindow();
});

ipcMain.handle('close-multi-preview-window', async () => {
  return closeMultiPreviewWindow();
});

ipcMain.handle('is-multi-preview-window-active', async () => {
  return Boolean(multiPreviewWindow && !multiPreviewWindow.isDestroyed());
});

ipcMain.handle('toggle-presenter-window', async () => {
  return togglePresenterWindow();
});

ipcMain.handle('open-presenter-window', async () => {
  return openPresenterWindow();
});

ipcMain.handle('close-presenter-window', async () => {
  return closePresenterWindow();
});

ipcMain.handle('is-presenter-window-active', async () => {
  return Boolean(presenterWindow && !presenterWindow.isDestroyed());
});

ipcMain.handle('current-window-get-bounds', async (event) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (!senderWin || senderWin.isDestroyed()) return null;
  return senderWin.getBounds();
});

ipcMain.handle('current-window-set-bounds', async (event, bounds) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (!senderWin || senderWin.isDestroyed() || !bounds || typeof bounds !== 'object') return false;
  const current = senderWin.getBounds();
  const nextBounds = {
    x: typeof bounds.x === 'number' && Number.isFinite(bounds.x) ? Math.round(bounds.x) : current.x,
    y: typeof bounds.y === 'number' && Number.isFinite(bounds.y) ? Math.round(bounds.y) : current.y,
    width:
      typeof bounds.width === 'number' && Number.isFinite(bounds.width)
        ? Math.max(150, Math.round(bounds.width))
        : current.width,
    height:
      typeof bounds.height === 'number' && Number.isFinite(bounds.height)
        ? Math.max(90, Math.round(bounds.height))
        : current.height,
  };
  senderWin.setBounds(nextBounds);
  return true;
});

ipcMain.handle('window-minimize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
    return true;
  }
  return false;
});

ipcMain.handle('window-maximize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.maximize();
    return true;
  }
  return false;
});

ipcMain.handle('window-restore', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.unmaximize();
    return true;
  }
  return false;
});

ipcMain.handle('window-toggle-maximize', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle('window-is-maximized', async () => {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
});

ipcMain.handle('window-close', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    return true;
  }
  return false;
});

ipcMain.handle('toggle-app-fullscreen', async (_event, monitorId) => {
  return toggleAppFullscreen(monitorId);
});

ipcMain.handle('is-app-fullscreen', async () => {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen());
});

ipcMain.handle('window-reset-size', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const primary = screen.getPrimaryDisplay();
  const pWork = primary.workArea;
  const x = pWork.x + Math.max(0, Math.floor((pWork.width - DEFAULT_WIDTH) / 2));
  const y = pWork.y + Math.max(0, Math.floor((pWork.height - DEFAULT_HEIGHT) / 2));

  mainWindow.unmaximize();
  mainWindow.setFullScreen(false);
  mainWindow.setBounds({ x, y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  return true;
});

ipcMain.handle('window-get-bounds', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow.getBounds();
});

ipcMain.handle('user-data-read', async () => {
  return readPersistentUserData();
});

ipcMain.handle('user-data-write', async (_event, data) => {
  if (!data || typeof data !== 'object') return false;
  return writePersistentUserData(data);
});

ipcMain.handle('get-app-info', async () => {
  return {
    name: APP_NAME,
    company: APP_COMPANY,
    version: APP_VERSION,
    appId: APP_ID,
    userDataPath: app.getPath('userData'),
    lanPort: activeLanPort,
  };
});

let cachedSystemFonts = null;

function getSystemFontsList() {
  if (cachedSystemFonts && cachedSystemFonts.length > 0) {
    return Promise.resolve(cachedSystemFonts);
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const psCmd =
        'powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"';
      exec(psCmd, { timeout: 7000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (!err && stdout) {
          const fonts = Array.from(
            new Set(
              stdout
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && !line.startsWith('@'))
            )
          ).sort((a, b) => a.localeCompare(b));
          if (fonts.length > 0) {
            cachedSystemFonts = fonts;
            resolve(fonts);
            return;
          }
        }

        // Fallback: query Windows Registry Fonts key
        exec(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"',
          { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
          (regErr, regOut) => {
            if (!regErr && regOut) {
              const names = new Set();
              regOut.split(/\r?\n/).forEach((line) => {
                const match = line.trim().match(/^(.+?)\s+\((?:TrueType|OpenType|All res)\)\s+REG_SZ/i);
                if (match && match[1]) {
                  const rawName = match[1]
                    .replace(/\s+(?:Bold|Italic|Regular|Light|Semibold|Medium|Black|Condensed|Narrow)+$/gi, '')
                    .trim();
                  if (rawName && !rawName.startsWith('@')) {
                    names.add(rawName);
                  }
                }
              });
              const list = Array.from(names).sort((a, b) => a.localeCompare(b));
              if (list.length > 0) {
                cachedSystemFonts = list;
              }
              resolve(list);
            } else {
              resolve([]);
            }
          }
        );
      });
      return;
    }

    if (process.platform === 'linux') {
      exec('fc-list : family', { timeout: 5000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        const names = new Set();
        stdout.split(/\r?\n/).forEach((line) => {
          line.split(',').forEach((part) => {
            const clean = part.trim();
            if (clean) names.add(clean);
          });
        });
        const list = Array.from(names).sort((a, b) => a.localeCompare(b));
        cachedSystemFonts = list;
        resolve(list);
      });
      return;
    }

    resolve([]);
  });
}

ipcMain.handle('get-system-fonts', async () => {
  try {
    return await getSystemFontsList();
  } catch {
    return [];
  }
});

// =============================================================================
// AUTO-UPDATER (GitHub Releases via electron-updater)
// =============================================================================

const AUTO_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every 1 hour
let autoUpdateIntervalTimer = null;
let latestUpdateStatus = {
  state: 'idle', // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version: APP_VERSION,
  availableVersion: null,
  progressPercent: 0,
  message: `ProTimer v${APP_VERSION} is up to date.`,
  error: null,
};

function broadcastUpdateStatus(patch) {
  latestUpdateStatus = { ...latestUpdateStatus, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('update-status', latestUpdateStatus);
    } catch {
      // Ignore send errors
    }
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      broadcastUpdateStatus({
        state: 'checking',
        message: 'Checking GitHub Releases for updates...',
        error: null,
      });
    });

    autoUpdater.on('update-available', (info) => {
      const nextVer = (info && info.version) || 'new';
      broadcastUpdateStatus({
        state: 'available',
        availableVersion: nextVer,
        message: `Update v${nextVer} found. Downloading in background...`,
        error: null,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      broadcastUpdateStatus({
        state: 'not-available',
        availableVersion: (info && info.version) || APP_VERSION,
        progressPercent: 100,
        message: `You are running the latest version (v${APP_VERSION}).`,
        error: null,
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const pct = progressObj && typeof progressObj.percent === 'number'
        ? Math.round(progressObj.percent)
        : 0;
      broadcastUpdateStatus({
        state: 'downloading',
        progressPercent: pct,
        message: `Downloading update... (${pct}%)`,
      });
    });

    autoUpdater.on('update-downloaded', async (info) => {
      const downloadedVersion = (info && info.version) || 'latest';
      broadcastUpdateStatus({
        state: 'downloaded',
        availableVersion: downloadedVersion,
        progressPercent: 100,
        message: `Update v${downloadedVersion} has been downloaded and is ready to install.`,
        error: null,
      });

      try {
        const dialogOpts = {
          type: 'info',
          buttons: ['Restart and Install Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'ProTimer Update Ready',
          message: `ProTimer v${downloadedVersion} has been downloaded.`,
          detail:
            'A new version of ProTimer is ready to install. Would you like to restart the application now to apply the update?',
        };

        const result =
          mainWindow && !mainWindow.isDestroyed()
            ? await dialog.showMessageBox(mainWindow, dialogOpts)
            : await dialog.showMessageBox(dialogOpts);

        if (result.response === 0) {
          setImmediate(() => {
            autoUpdater.quitAndInstall(false, true);
          });
        }
      } catch (err) {
        console.warn('[AutoUpdater] Failed to show update prompt:', err && err.message);
      }
    });

    autoUpdater.on('error', (err) => {
      const msg = (err && err.message) || 'Unable to check for updates.';
      console.warn('[AutoUpdater] Error:', msg);
      broadcastUpdateStatus({
        state: 'error',
        message: 'Could not reach update server.',
        error: msg,
      });
    });

    // Check for updates on startup
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('[AutoUpdater] Initial check failed:', err && err.message);
      });

      // Check periodically every 1 hour
      if (autoUpdateIntervalTimer) {
        clearInterval(autoUpdateIntervalTimer);
      }
      autoUpdateIntervalTimer = setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
          console.warn('[AutoUpdater] Periodic check failed:', err && err.message);
        });
      }, AUTO_UPDATE_CHECK_INTERVAL_MS);
    }
  } catch (err) {
    console.warn('[AutoUpdater] Setup failed:', err && err.message);
  }
}

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) {
    return {
      ...latestUpdateStatus,
      state: 'not-available',
      message: `Auto-updater unavailable in this environment (v${APP_VERSION}).`,
    };
  }
  if (!app.isPackaged) {
    return {
      ...latestUpdateStatus,
      state: 'not-available',
      message: `Running in development mode (v${APP_VERSION}). Build installer to test GitHub Release auto-updates.`,
    };
  }
  try {
    await autoUpdater.checkForUpdatesAndNotify();
    return latestUpdateStatus;
  } catch (err) {
    return {
      ...latestUpdateStatus,
      state: 'error',
      error: (err && err.message) || 'Update check failed',
    };
  }
});

ipcMain.handle('quit-and-install-update', async () => {
  if (autoUpdater && latestUpdateStatus.state === 'downloaded') {
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
    return true;
  }
  return false;
});

ipcMain.handle('get-update-status', async () => {
  return latestUpdateStatus;
});

// =============================================================================
// APPLICATION LIFECYCLE
// =============================================================================

app.whenReady().then(async () => {
  try {
    const ALLOWED_PERMISSIONS = new Set([
      'local-fonts',
      'fullscreen',
      'window-management',
      'clipboard-read',
      'clipboard-sanitized-write',
    ]);
    if (session && session.defaultSession) {
      session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
        return ALLOWED_PERMISSIONS.has(permission);
      });
      session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(ALLOWED_PERMISSIONS.has(permission));
      });
    }
  } catch {
    // Ignore permission handler errors
  }

  await startEmbeddedProductionServer();
  createMainWindow();
  setupAutoUpdater();

  screen.on('display-added', () => {
    notifyDisplaysChanged();
  });

  screen.on('display-removed', (_event, oldDisplay) => {
    handleDisplayRemoved(oldDisplay);
    notifyDisplaysChanged();
  });

  screen.on('display-metrics-changed', () => {
    notifyDisplaysChanged();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (embeddedServer) {
    try {
      embeddedServer.close();
    } catch {
      // Ignore close error
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
