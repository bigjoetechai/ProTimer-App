/**
 * Electron Main Process for ProTimer (Windows 10 & Windows 11 64-bit Desktop Application).
 *
 * Application Identity:
 * - Application Name: ProTimer
 * - Application ID: com.protimer.desktop
 * - Version: 1.0.0
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

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const APP_ID = 'com.protimer.desktop';
const APP_NAME = 'ProTimer';
const APP_VERSION = '1.0.0';

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

// LAN state for mobile/tablet remote control & LAN displays
const lanState = {
  masterState: null,
  timers: [],
  accessPin: '1234',
  pinRequired: true,
  pendingCommands: [],
};
const sseClients = new Set();

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
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

function handleEmbeddedLanApi(req, res) {
  const url = req.url || '';
  if (!url.startsWith('/api/lan')) return false;

  const [pathname] = url.split('?');
  const method = req.method || 'GET';

  const readBody = () =>
    new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });

  const sendJson = (statusCode, payload) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(payload));
  };

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  if (pathname === '/api/lan/info' && method === 'GET') {
    sendJson(200, {
      ips: getLocalIpAddresses(),
      port: activeLanPort,
      pinRequired: lanState.pinRequired,
      defaultPin: lanState.accessPin,
      hasMaster: Boolean(lanState.masterState),
      connectedClients: sseClients.size,
    });
    return true;
  }

  if (pathname === '/api/lan/pin' && method === 'POST') {
    readBody().then((body) => {
      if (typeof body.pin === 'string') {
        lanState.accessPin = body.pin.trim() || '1234';
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
    readBody().then((body) => {
      if (!lanState.pinRequired || String(body.pin).trim() === lanState.accessPin) {
        sendJson(200, {
          valid: true,
          token: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
      } else {
        sendJson(401, {
          valid: false,
          error:
            'Invalid Access PIN. Please verify the PIN displayed on the ProTimer Master console.',
        });
      }
    });
    return true;
  }

  if (pathname === '/api/lan/state' && method === 'POST') {
    readBody().then((body) => {
      if (body.state) lanState.masterState = body.state;
      if (Array.isArray(body.timers)) lanState.timers = body.timers;
      broadcastSse({
        type: 'STATE_UPDATE',
        state: lanState.masterState,
        timers: lanState.timers,
        timestamp: Date.now(),
      });
      sendJson(200, { success: true });
    });
    return true;
  }

  if (pathname === '/api/lan/state' && method === 'GET') {
    sendJson(200, {
      state: lanState.masterState,
      timers: lanState.timers,
      pinRequired: lanState.pinRequired,
      timestamp: Date.now(),
    });
    return true;
  }

  if (pathname === '/api/lan/stream' && method === 'GET') {
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
    req.on('close', () => {
      sseClients.delete(res);
    });
    return true;
  }

  if (pathname === '/api/lan/command' && method === 'POST') {
    readBody().then((body) => {
      const clientPin = String(body.pin || '').trim();
      if (lanState.pinRequired && clientPin !== lanState.accessPin) {
        sendJson(401, {
          success: false,
          error: 'Unauthorized: Valid Access PIN required to issue commands',
        });
        return;
      }
      if (!body.command) {
        sendJson(400, { success: false, error: 'Missing command name' });
        return;
      }
      const commandEntry = {
        id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        command: String(body.command).toUpperCase(),
        payload: body.payload,
        timestamp: Date.now(),
      };
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

  const distDir = path.join(__dirname, '../dist');

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        if (handleEmbeddedLanApi(req, res)) return;

        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let safePath = path.normalize(decodeURIComponent(parsedUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
        if (safePath === '/' || safePath === '\\') {
          safePath = '/index.html';
        }

        let filePath = path.join(distDir, safePath);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
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
    path.join(__dirname, '../public/icon.ico'),
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

function notifyOutputClosed() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('output-closed');
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

  // Intercept window.open calls (Presenter, Stage, Preview, NDI, etc.)
  // so they open as native ProTimer windows instead of launching an external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const childWin = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 640,
      minHeight: 400,
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
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
      outputWindow = null;
    }
    for (const win of secondaryWindows) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    secondaryWindows.clear();
  });
}

// =============================================================================
// MODE B: TIMER OUTPUT FULLSCREEN (Dedicated Output on Target Monitor)
// =============================================================================

function openFullscreenOutput(monitorId, displayTarget = 'fullscreen') {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  let targetDisplay = null;
  if (!monitorId || monitorId === 'Auto' || monitorId === 'auto') {
    targetDisplay = primary;
  } else {
    targetDisplay = displays.find((d) => String(d.id) === String(monitorId));
    if (!targetDisplay) {
      targetDisplay = primary;
    }
  }

  const { x, y, width, height } = targetDisplay.bounds;
  currentOutputDisplayId = targetDisplay.id;

  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.setFullScreen(false);
    outputWindow.setBounds({ x, y, width, height });
    outputWindow.setFullScreen(true);
    outputWindow.show();
    outputWindow.focus();
    return { success: true, displayId: targetDisplay.id };
  }

  outputWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    backgroundColor: '#000000',
    title: 'ProTimer - Fullscreen Live Output',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  outputWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      closeFullscreenOutput();
    }
  });

  const baseUrl = getBaseUrl();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const outputUrl = `${baseUrl}${separator}display=${encodeURIComponent(displayTarget)}`;

  outputWindow.loadURL(outputUrl);
  outputWindow.setFullScreen(true);

  outputWindow.on('closed', () => {
    outputWindow = null;
    currentOutputDisplayId = null;
    notifyOutputClosed();
  });

  return { success: true, displayId: targetDisplay.id };
}

function closeFullscreenOutput() {
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.close();
    outputWindow = null;
    currentOutputDisplayId = null;
    notifyOutputClosed();
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

  if (outputWindow && !outputWindow.isDestroyed() && currentOutputDisplayId === oldDisplay.id) {
    currentOutputDisplayId = primary.id;
    outputWindow.setFullScreen(false);
    outputWindow.setBounds(primary.bounds);
    outputWindow.setFullScreen(true);
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
  return openFullscreenOutput(monitorId, displayTarget);
});

ipcMain.handle('close-fullscreen-output', async () => {
  return closeFullscreenOutput();
});

ipcMain.handle('is-fullscreen-output-active', async () => {
  return Boolean(outputWindow && !outputWindow.isDestroyed());
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
    version: APP_VERSION,
    appId: APP_ID,
    userDataPath: app.getPath('userData'),
    lanPort: activeLanPort,
  };
});

// =============================================================================
// APPLICATION LIFECYCLE
// =============================================================================

app.whenReady().then(async () => {
  await startEmbeddedProductionServer();
  createMainWindow();

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
