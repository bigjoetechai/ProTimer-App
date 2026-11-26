/**
 * LAN Remote Control & Display Synchronization Engine.
 * Manages cross-device communication, access PIN security, and state relaying
 * for mobile phones, tablets, and remote AV computers on the local network.
 */

import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import type { IncomingMessage, ServerResponse } from 'http';

const requireCjs =
  typeof require === 'function'
    ? require
    : createRequire(path.join(process.cwd(), 'server', 'lanHandler.ts'));
const { ndiNativeBridge } = requireCjs('./ndiNativeBridge.cjs');
const {
  resolveGitHubRepo,
  resolvePackageVersion,
  fetchLatestGitHubRelease,
} = requireCjs('./githubUpdateHelper.cjs');

let activeServerPort = 3000;

export function setActiveLanPort(port: number): void {
  if (typeof port === 'number' && port > 0) {
    activeServerPort = port;
  }
}

export function getActiveLanPort(): number {
  return activeServerPort;
}

export type NativeDataUrlDecoder = (
  dataUrl: string,
  targetSourceName: string | null,
  frameRate: number,
  alphaChannel: boolean
) => void;

let electronNativeDecoder: NativeDataUrlDecoder | null = null;

export function registerElectronNativeDecoder(fn: NativeDataUrlDecoder | null): void {
  electronNativeDecoder = fn;
}

export interface NdiNetworkStreamConfig {
  active: boolean;
  mode: 'single' | 'multi';
  multiActive: boolean;
  activeByList: Record<string, boolean>;
  sourceNamesByList: Record<string, string>;
  activeSourceNames: string[];
  sourceName: string;
  multiSourceName: string;
  resolution: string;
  width: number;
  height: number;
  frameRate: number;
  alphaChannel: boolean;
  useCustomGroups: boolean;
  customGroups: string;
  startedAt: number | null;
  lastFrameAt: number | null;
  frameCount: number;
}

export interface ListLanSecurityConfig {
  listId: string;
  pin: string;
  pinRequired: boolean;
  sessionToken: string;
  desktopSessionToken: string;
}

export interface LanState {
  masterState: unknown | null;
  timers: unknown[];
  accessPin: string;
  pinRequired: boolean;
  listConfigs: Record<string, ListLanSecurityConfig>;
  pendingCommands: Array<{
    id: string;
    command: string;
    payload?: unknown;
    timestamp: number;
  }>;
  ndiStream: NdiNetworkStreamConfig;
  latestNdiFrameDataUrl: string | null;
  latestNdiFramesByList: Record<string, { sourceName: string; frameDataUrl: string }>;
}

const state: LanState = {
  masterState: null,
  timers: [],
  accessPin: '1234',
  pinRequired: true,
  listConfigs: {},
  pendingCommands: [],
  ndiStream: {
    active: false,
    mode: 'single',
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
    startedAt: null,
    lastFrameAt: null,
    frameCount: 0,
  },
  latestNdiFrameDataUrl: null,
  latestNdiFramesByList: {},
};

function getOrCreateListLanConfig(listId: string): ListLanSecurityConfig {
  const key = listId || 'default';
  if (!state.listConfigs[key]) {
    state.listConfigs[key] = {
      listId: key,
      pin: state.accessPin || '1234',
      pinRequired: state.pinRequired,
      sessionToken: crypto.randomUUID(),
      desktopSessionToken: crypto.randomUUID(),
    };
  } else if (!state.listConfigs[key].desktopSessionToken) {
    state.listConfigs[key].desktopSessionToken = crypto.randomUUID();
  }
  return state.listConfigs[key];
}

// SSE connected clients & per-list metadata
const sseClients: Set<ServerResponse> = new Set();
const sseClientMeta: Map<ServerResponse, { listId: string; role: string }> = new Map();

function getControlPagesCountByList(): {
  mobileByList: Record<string, number>;
  desktopByList: Record<string, number>;
  totalByList: Record<string, number>;
} {
  const mobileByList: Record<string, number> = {};
  const desktopByList: Record<string, number> = {};
  const totalByList: Record<string, number> = {};
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

// Live NDI MJPEG / Multipart stream clients on the network, keyed with optional per-list filter
const ndiStreamClients: Map<
  ServerResponse,
  { listId: string | null; mode: 'single' | 'multi' | null }
> = new Map();

export function getLocalNetworkInterfaces(): Array<{ name: string; address: string }> {
  const interfaces = os.networkInterfaces();
  const result: Array<{ name: string; address: string }> = [];

  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        result.push({ name, address: iface.address });
      }
    }
  }

  return result.length > 0 ? result : [{ name: 'Ethernet', address: '127.0.0.1' }];
}

export function getLocalIpAddresses(): string[] {
  return getLocalNetworkInterfaces().map((i) => i.address);
}

export function broadcastSse(data: unknown) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

function writeMjpegFrame(res: ServerResponse, dataUrl: string): boolean {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return false;
  const headerPart = dataUrl.slice(0, commaIdx);
  const base64Part = dataUrl.slice(commaIdx + 1);
  const mimeMatch = headerPart.match(/^data:([^;]+);base64$/);
  const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
  const buffer = Buffer.from(base64Part, 'base64');

  res.write(`--ndi_frame\r\n`);
  res.write(`Content-Type: ${contentType}\r\n`);
  res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
  res.write(buffer);
  res.write(`\r\n`);
  return true;
}

function pushFrameToNdiClients(dataUrl: string, targetListId: string | null = null) {
  if (ndiStreamClients.size === 0 || !dataUrl) return;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return;
  const headerPart = dataUrl.slice(0, commaIdx);
  const base64Part = dataUrl.slice(commaIdx + 1);
  const mimeMatch = headerPart.match(/^data:([^;]+);base64$/);
  const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
  const buffer = Buffer.from(base64Part, 'base64');

  for (const [res, meta] of ndiStreamClients.entries()) {
    // Clients pinned to a specific listId only receive frames for that exact listId.
    // Clients with listId === null receive the primary / multi stream frame.
    if (targetListId !== null) {
      if (meta.listId !== targetListId) continue;
    } else {
      if (meta.listId !== null) continue;
    }

    try {
      res.write(`--ndi_frame\r\n`);
      res.write(`Content-Type: ${contentType}\r\n`);
      res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
      res.write(buffer);
      res.write(`\r\n`);
    } catch {
      ndiStreamClients.delete(res);
    }
  }
}

const MAX_DEFAULT_BODY_BYTES = 256 * 1024; // 256 KB default for commands/PIN
const MAX_MEDIA_BODY_BYTES = 25 * 1024 * 1024; // 25 MB for master state & NDI frames
const MAX_PENDING_COMMANDS = 100;
const PIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const PIN_RATE_LIMIT_MAX_FAILURES = 10;

const pinFailureTracker = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isLoopbackOrMasterConsole(req: IncomingMessage): boolean {
  if (req.headers['x-protimer-console'] === '1') {
    return true;
  }
  const addr = req.socket?.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function safeComparePin(inputPin: string, expectedPin: string): boolean {
  const hashA = crypto.createHash('sha256').update(String(inputPin)).digest();
  const hashB = crypto.createHash('sha256').update(String(expectedPin)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function isPinRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const entry = pinFailureTracker.get(clientIp);
  if (!entry) return false;
  if (now > entry.resetAt) {
    pinFailureTracker.delete(clientIp);
    return false;
  }
  return entry.count >= PIN_RATE_LIMIT_MAX_FAILURES;
}

function recordPinFailure(clientIp: string): void {
  const now = Date.now();
  const entry = pinFailureTracker.get(clientIp);
  if (!entry || now > entry.resetAt) {
    pinFailureTracker.set(clientIp, { count: 1, resetAt: now + PIN_RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearPinFailures(clientIp: string): void {
  pinFailureTracker.delete(clientIp);
}

/**
 * Handle LAN API requests from either Vite dev middleware or standalone Express server.
 */
export async function handleLanApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || '';
  if (!url.startsWith('/api/lan')) {
    return false;
  }

  // Parse path and query
  const [pathname] = url.split('?');
  const method = req.method || 'GET';

  // Helper to read JSON body with strict byte cap to prevent memory exhaustion DoS
  const readBody = (maxBytes = MAX_DEFAULT_BODY_BYTES): Promise<any> => {
    const preParsed = (req as any).body;
    if (preParsed && typeof preParsed === 'object' && Object.keys(preParsed).length > 0) {
      return Promise.resolve(preParsed);
    }
    if ((req as any).readableEnded) {
      return Promise.resolve(preParsed || {});
    }
    return new Promise((resolve) => {
      let data = '';
      let receivedBytes = 0;
      let aborted = false;
      req.on('data', (chunk: Buffer | string) => {
        if (aborted) return;
        receivedBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        if (receivedBytes > maxBytes) {
          aborted = true;
          resolve({ __payloadTooLarge: true });
          try {
            req.destroy();
          } catch {
            // ignore destroy error
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
  };

  const sendJson = (statusCode: number, payload: unknown) => {
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

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ProTimer-Console',
    });
    res.end();
    return true;
  }

  // 1. GET /api/lan/info
  if (pathname === '/api/lan/info' && method === 'GET') {
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const requestedListId =
      params.get('listId') ||
      (state.masterState as any)?.activeListId ||
      'list_1';

    const listConfig = getOrCreateListLanConfig(requestedListId);
    const netInterfaces = getLocalNetworkInterfaces();
    const ips = netInterfaces.map((i) => i.address);
    const primaryIp = ips[0] || '127.0.0.1';
    const hostHeader = req.headers.host || `${primaryIp}:3000`;
    const isLocalhost = hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1');
    const resolvedHost = isLocalhost && primaryIp !== '127.0.0.1' ? `${primaryIp}:3000` : hostHeader;
    const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
    const baseOrigin = `${proto}://${resolvedHost}`;

    const { mobileByList, desktopByList, totalByList } = getControlPagesCountByList();
    const mobileControlPagesOnList =
      (mobileByList[requestedListId] || 0) + (mobileByList['all'] || 0);
    const desktopControlPagesOnList =
      (desktopByList[requestedListId] || 0) + (desktopByList['all'] || 0);
    const controlPagesOnList =
      (totalByList[requestedListId] || 0) + (totalByList['all'] || 0);

    const isConsoleCaller = req.headers['x-protimer-console'] === '1';
    const sanitizedListConfigs = Object.fromEntries(
      Object.entries(state.listConfigs).map(([k, v]) => [
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
      ips,
      port: activeServerPort,
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
      interfaces: netInterfaces,
      controlUrl: `${baseOrigin}/?display=lan_control&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.sessionToken)}`,
      mobileControlUrl: `${baseOrigin}/?display=lan_control&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.sessionToken)}`,
      desktopControlUrl: `${baseOrigin}/?display=lan_desktop&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.desktopSessionToken)}`,
      displayUrl: `${baseOrigin}/?display=lan_display&listId=${encodeURIComponent(requestedListId)}&id=${encodeURIComponent(listConfig.sessionToken)}`,
      hasMaster: Boolean(state.masterState),
      connectedClients: sseClients.size,
      controlPagesOnList,
      mobileControlPagesOnList,
      desktopControlPagesOnList,
      controlPagesByList: totalByList,
      ndiStream: state.ndiStream,
      ndiClientsCount: ndiStreamClients.size,
    });
    return true;
  }

  // 2. POST /api/lan/pin (Configure PIN per list or globally — restricted to Master Console)
  if (pathname === '/api/lan/pin' && method === 'POST') {
    if (!isLoopbackOrMasterConsole(req)) {
      sendJson(403, {
        success: false,
        error: 'Forbidden: PIN configuration can only be modified from the ProTimer Master Console.',
      });
      return true;
    }
    const body = await readBody();
    if (body.__payloadTooLarge) {
      sendJson(413, { success: false, error: 'Payload too large' });
      return true;
    }
    const targetListId = typeof body.listId === 'string' && body.listId ? body.listId.slice(0, 64) : '';
    if (targetListId) {
      const cfg = getOrCreateListLanConfig(targetListId);
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
        listConfigs: state.listConfigs,
      });
      return true;
    }

    if (typeof body.pin === 'string') {
      state.accessPin = body.pin.trim().slice(0, 32) || '1234';
    }
    if (typeof body.pinRequired === 'boolean') {
      state.pinRequired = body.pinRequired;
    }
    sendJson(200, { success: true, pin: state.accessPin, pinRequired: state.pinRequired });
    return true;
  }

  // 3. POST /api/lan/verify-pin (Client verification per list or globally with rate limiting & constant-time compare)
  if (pathname === '/api/lan/verify-pin' && method === 'POST') {
    const clientIp = getClientIp(req);
    if (isPinRateLimited(clientIp)) {
      sendJson(429, {
        valid: false,
        error: 'Too many failed PIN attempts. Please wait 60 seconds before trying again.',
      });
      return true;
    }

    const body = await readBody();
    if (body.__payloadTooLarge) {
      sendJson(413, { valid: false, error: 'Payload too large' });
      return true;
    }
    const targetListId = typeof body.listId === 'string' && body.listId ? body.listId : '';
    const cfg = targetListId ? getOrCreateListLanConfig(targetListId) : null;
    const effectivePinRequired = cfg ? cfg.pinRequired : state.pinRequired;
    const effectivePin = cfg ? cfg.pin : state.accessPin;
    const candidatePin = String(body.pin || '').trim();

    if (!effectivePinRequired || safeComparePin(candidatePin, effectivePin)) {
      clearPinFailures(clientIp);
      sendJson(200, {
        valid: true,
        listId: targetListId || undefined,
        token: `auth_${crypto.randomBytes(16).toString('hex')}`,
      });
    } else {
      recordPinFailure(clientIp);
      sendJson(401, {
        valid: false,
        error: 'Invalid Access PIN. Please verify the Access PIN for this list on the ProTimer console.',
      });
    }
    return true;
  }

  // 4. POST /api/lan/state (Master pushes state)
  if (pathname === '/api/lan/state' && method === 'POST') {
    const body = await readBody(MAX_MEDIA_BODY_BYTES);
    if (body.__payloadTooLarge) {
      sendJson(413, { success: false, error: 'Payload too large' });
      return true;
    }
    if (body.state) {
      const prev = (state.masterState || {}) as Record<string, any>;
      const incoming = body.state as Record<string, any>;

      // Reject out-of-order stale HTTP tick requests
      if (
        typeof prev.timestamp === 'number' &&
        typeof incoming.timestamp === 'number' &&
        incoming.timestamp < prev.timestamp &&
        prev.timestamp - incoming.timestamp < 10_000
      ) {
        sendJson(200, { success: true, ignoredStale: true });
        return true;
      }

      if (incoming.backgroundImageUrl === '__CACHED__') {
        incoming.backgroundImageUrl = prev.backgroundImageUrl || '';
      }
      if (incoming.logoImageUrl === '__CACHED__') {
        incoming.logoImageUrl = prev.logoImageUrl || '';
      }
      if (Array.isArray(incoming.listActiveCues) && Array.isArray(prev.listActiveCues)) {
        const prevMap = new Map(prev.listActiveCues.map((c: any) => [c.listId, c]));
        incoming.listActiveCues = incoming.listActiveCues.map((cue: any) => {
          const oldCue = prevMap.get(cue.listId) as any;
          return {
            ...cue,
            backgroundImageUrl:
              cue.backgroundImageUrl === '__CACHED__'
                ? oldCue?.backgroundImageUrl || ''
                : cue.backgroundImageUrl,
            logoImageUrl:
              cue.logoImageUrl === '__CACHED__'
                ? oldCue?.logoImageUrl || ''
                : cue.logoImageUrl,
          };
        });
      }
      if (incoming.preferences && prev.preferences) {
        if (
          (!incoming.preferences.listBackgroundImages ||
            Object.keys(incoming.preferences.listBackgroundImages).length === 0) &&
          prev.preferences.listBackgroundImages &&
          Object.keys(prev.preferences.listBackgroundImages).length > 0
        ) {
          incoming.preferences.listBackgroundImages = prev.preferences.listBackgroundImages;
        }
        if (
          !incoming.preferences.backgroundImageDataUrl &&
          prev.preferences.backgroundImageDataUrl
        ) {
          incoming.preferences.backgroundImageDataUrl = prev.preferences.backgroundImageDataUrl;
        }
      }
      state.masterState = incoming;
    }
    if (Array.isArray(body.timers)) {
      state.timers = body.timers;
    }

    // Broadcast update to all connected SSE clients (mobile devices & displays)
    broadcastSse({
      type: 'STATE_UPDATE',
      state: state.masterState,
      timers: state.timers,
      timestamp: Date.now(),
    });

    sendJson(200, { success: true });
    return true;
  }

  // 5. GET /api/lan/state (Client pulls state)
  if (pathname === '/api/lan/state' && method === 'GET') {
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const reqListId = params.get('listId') || '';
    const cfg = reqListId ? getOrCreateListLanConfig(reqListId) : null;
    sendJson(200, {
      state: state.masterState,
      timers: state.timers,
      pinRequired: cfg ? cfg.pinRequired : state.pinRequired,
      timestamp: Date.now(),
    });
    return true;
  }

  // 6. GET /api/lan/stream (Server-Sent Events for real-time live push)
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

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', state: state.masterState, timers: state.timers })}\n\n`);
    sseClients.add(res);
    sseClientMeta.set(res, { listId: clientListId, role: clientRole });

    req.on('close', () => {
      sseClients.delete(res);
      sseClientMeta.delete(res);
    });
    return true;
  }

  // 7. POST /api/lan/command (Remote client issues command)
  if (pathname === '/api/lan/command' && method === 'POST') {
    const clientIp = getClientIp(req);
    if (isPinRateLimited(clientIp)) {
      sendJson(429, {
        success: false,
        error: 'Too many failed PIN attempts. Please wait 60 seconds before issuing commands.',
      });
      return true;
    }

    const body = await readBody();
    if (body.__payloadTooLarge) {
      sendJson(413, { success: false, error: 'Command payload too large' });
      return true;
    }

    const clientPin = String(body.pin || '').trim();
    const cmdListId =
      (typeof body.listId === 'string' && body.listId) ||
      (typeof body.payload?.listId === 'string' && body.payload.listId) ||
      '';
    const authListId = typeof body.authListId === 'string' && body.authListId ? body.authListId : '';
    const cfg = cmdListId ? getOrCreateListLanConfig(cmdListId) : null;
    const authCfg = authListId ? getOrCreateListLanConfig(authListId) : null;
    const effectivePinRequired = cfg ? cfg.pinRequired : state.pinRequired;
    const effectivePin = cfg ? cfg.pin : state.accessPin;
    const matchesTargetPin = !effectivePinRequired || safeComparePin(clientPin, effectivePin);
    const matchesAuthListPin = authCfg
      ? !authCfg.pinRequired || safeComparePin(clientPin, authCfg.pin)
      : false;

    // Verify PIN if enabled for this list
    if (!matchesTargetPin && !matchesAuthListPin) {
      recordPinFailure(clientIp);
      sendJson(401, {
        success: false,
        error: 'Unauthorized: Valid Access PIN required to issue commands for this list',
      });
      return true;
    }

    if (!body.command || typeof body.command !== 'string' || body.command.length > 64) {
      sendJson(400, { success: false, error: 'Missing or invalid command name' });
      return true;
    }

    const commandEntry = {
      id: `cmd_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      command: String(body.command).trim().toUpperCase(),
      payload: body.payload,
      timestamp: Date.now(),
    };

    if (state.pendingCommands.length >= MAX_PENDING_COMMANDS) {
      state.pendingCommands.shift();
    }
    state.pendingCommands.push(commandEntry);

    // Notify master immediately via SSE as well
    broadcastSse({
      type: 'COMMAND_DISPATCHED',
      command: commandEntry,
    });

    sendJson(200, { success: true, commandId: commandEntry.id });
    return true;
  }

  // 8. GET /api/lan/commands (Master pulls and drains pending commands)
  if (pathname === '/api/lan/commands' && method === 'GET') {
    const commands = [...state.pendingCommands];
    state.pendingCommands = [];
    sendJson(200, { commands });
    return true;
  }

  // 9. GET /api/lan/ndi/status (Network computers query active NDI stream configuration & capture URLs)
  if (pathname === '/api/lan/ndi/status' && method === 'GET') {
    const ips = getLocalIpAddresses();
    const primaryIp = ips[0] || 'localhost';
    const nativeDiagnostics = ndiNativeBridge.getRuntimeDiagnostics();
    const nativeReceivers = Number(nativeDiagnostics?.connectedReceivers) || 0;
    const perListCaptureUrls: Record<
      string,
      {
        sourceName: string;
        active: boolean;
        browserSourceUrl: string;
        mjpegStreamUrl: string;
        liveFrameUrl: string;
      }
    > = {};
    for (const [lid, sName] of Object.entries(state.ndiStream.sourceNamesByList || {})) {
      const encodedId = encodeURIComponent(lid);
      perListCaptureUrls[lid] = {
        sourceName: sName,
        active: Boolean(state.ndiStream.multiActive || state.ndiStream.activeByList?.[lid]),
        browserSourceUrl: `http://${primaryIp}:${activeServerPort}/?display=ndi&listId=${encodedId}`,
        mjpegStreamUrl: `http://${primaryIp}:${activeServerPort}/api/lan/ndi/mjpeg?listId=${encodedId}`,
        liveFrameUrl: `http://${primaryIp}:${activeServerPort}/api/lan/ndi/frame.png?listId=${encodedId}`,
      };
    }
    sendJson(200, {
      ...state.ndiStream,
      ips,
      port: activeServerPort,
      receiversCount: ndiStreamClients.size + nativeReceivers,
      nativeNdi: nativeDiagnostics,
      captureUrls: {
        browserSourceUrl: `http://${primaryIp}:${activeServerPort}/?display=ndi`,
        mjpegStreamUrl: `http://${primaryIp}:${activeServerPort}/api/lan/ndi/mjpeg`,
        liveFrameUrl: `http://${primaryIp}:${activeServerPort}/api/lan/ndi/frame.png`,
      },
      perListCaptureUrls,
    });
    return true;
  }

  // 10. POST /api/lan/ndi/config (Master activates/deactivates or updates NDI stream settings)
  if (pathname === '/api/lan/ndi/config' && method === 'POST') {
    const body = await readBody();
    const wasActive = state.ndiStream.active;
    const nextActive = typeof body.active === 'boolean' ? body.active : state.ndiStream.active;

    state.ndiStream = {
      ...state.ndiStream,
      active: nextActive,
      mode: body.mode === 'multi' ? 'multi' : body.mode === 'single' ? 'single' : state.ndiStream.mode,
      multiActive:
        typeof body.multiActive === 'boolean' ? body.multiActive : state.ndiStream.multiActive,
      activeByList:
        body.activeByList && typeof body.activeByList === 'object'
          ? body.activeByList
          : state.ndiStream.activeByList,
      sourceNamesByList:
        body.sourceNamesByList && typeof body.sourceNamesByList === 'object'
          ? body.sourceNamesByList
          : state.ndiStream.sourceNamesByList,
      activeSourceNames: Array.isArray(body.activeSourceNames)
        ? body.activeSourceNames
        : state.ndiStream.activeSourceNames,
      sourceName:
        typeof body.sourceName === 'string' && body.sourceName.trim()
          ? body.sourceName.trim()
          : state.ndiStream.sourceName,
      multiSourceName:
        typeof body.multiSourceName === 'string' && body.multiSourceName.trim()
          ? body.multiSourceName.trim()
          : state.ndiStream.multiSourceName,
      resolution:
        typeof body.resolution === 'string' ? body.resolution : state.ndiStream.resolution,
      width: typeof body.width === 'number' ? body.width : state.ndiStream.width,
      height: typeof body.height === 'number' ? body.height : state.ndiStream.height,
      frameRate: typeof body.frameRate === 'number' ? body.frameRate : state.ndiStream.frameRate,
      alphaChannel:
        typeof body.alphaChannel === 'boolean' ? body.alphaChannel : state.ndiStream.alphaChannel,
      useCustomGroups:
        typeof body.useCustomGroups === 'boolean'
          ? body.useCustomGroups
          : state.ndiStream.useCustomGroups,
      customGroups:
        typeof body.customGroups === 'string' ? body.customGroups : state.ndiStream.customGroups,
      startedAt: nextActive ? (wasActive ? state.ndiStream.startedAt : Date.now()) : null,
      lastFrameAt: nextActive ? state.ndiStream.lastFrameAt : null,
      frameCount: nextActive ? state.ndiStream.frameCount : 0,
    };

    let nativeDiagnostics;
    if (nextActive) {
      // Prune cached frames for any list tab that was deactivated so stale images are never served
      if (!state.ndiStream.multiActive) {
        for (const cachedListId of Object.keys(state.latestNdiFramesByList)) {
          if (!state.ndiStream.activeByList?.[cachedListId]) {
            delete state.latestNdiFramesByList[cachedListId];
          }
        }
        const remainingFrames = Object.values(state.latestNdiFramesByList);
        state.latestNdiFrameDataUrl =
          remainingFrames.length > 0 ? remainingFrames[0].frameDataUrl : null;
      }
      nativeDiagnostics = ndiNativeBridge.startSender({
        sourceName: state.ndiStream.sourceName,
        activeSourceNames: state.ndiStream.activeSourceNames,
        groups: state.ndiStream.customGroups,
        useCustomGroups: state.ndiStream.useCustomGroups,
        width: state.ndiStream.width,
        height: state.ndiStream.height,
        frameRate: state.ndiStream.frameRate,
        alphaChannel: state.ndiStream.alphaChannel,
        ips: getLocalIpAddresses(),
        port: 5961,
      });
    } else {
      state.latestNdiFrameDataUrl = null;
      state.latestNdiFramesByList = {};
      nativeDiagnostics = ndiNativeBridge.stopSender();
    }

    broadcastSse({
      type: 'NDI_STREAM_UPDATED',
      ndiStream: state.ndiStream,
      nativeNdi: nativeDiagnostics,
      timestamp: Date.now(),
    });

    sendJson(200, {
      success: true,
      ndiStream: state.ndiStream,
      nativeNdi: nativeDiagnostics,
    });
    return true;
  }

  // 11. POST /api/lan/ndi/frame (Master pushes rendered NDI video frame for network capture)
  if (pathname === '/api/lan/ndi/frame' && method === 'POST') {
    const body = await readBody(MAX_MEDIA_BODY_BYTES);
    if (body.__payloadTooLarge) {
      sendJson(413, { success: false, error: 'Frame payload too large' });
      return true;
    }

    // Ignore late in-flight frame uploads after NDI output has been turned OFF
    if (!state.ndiStream.active) {
      const nativeReceivers = ndiNativeBridge.getConnectedReceiversCount();
      sendJson(200, {
        success: true,
        ignored: true,
        receiversCount: ndiStreamClients.size + nativeReceivers,
        frameCount: state.ndiStream.frameCount,
      });
      return true;
    }

    const primarySourceName =
      (typeof body.sourceName === 'string' && body.sourceName.trim()) ||
      state.ndiStream.sourceName;
    const authorizedSources = new Set(state.ndiStream.activeSourceNames || []);
    const sentSourcesInBatch = new Set<string>();
    let updatedAnyFrame = false;

    // 1. Process per-list NDI frames FIRST so each active list tab (List 1, List 2, etc.)
    // always sends its own dedicated countdown frame to its exact NDI source name and MJPEG subscribers.
    if (body.perListFrames && typeof body.perListFrames === 'object') {
      for (const [lid, entry] of Object.entries(body.perListFrames as Record<string, any>)) {
        // Strictly reject frames for list tabs that are currently deactivated
        if (!state.ndiStream.multiActive && !state.ndiStream.activeByList?.[lid]) {
          continue;
        }
        const listSourceName =
          (entry && typeof entry.sourceName === 'string' && entry.sourceName.trim()) ||
          state.ndiStream.sourceNamesByList?.[lid] ||
          `ProTimer (${lid})`;
        const isSourceAuthorized =
          authorizedSources.size === 0 || authorizedSources.has(listSourceName);

        if (entry && typeof entry.frameDataUrl === 'string' && entry.frameDataUrl.startsWith('data:image/')) {
          state.latestNdiFramesByList[lid] = {
            sourceName: listSourceName,
            frameDataUrl: entry.frameDataUrl,
          };
          if (!state.latestNdiFrameDataUrl) {
            state.latestNdiFrameDataUrl = entry.frameDataUrl;
          }
          updatedAnyFrame = true;
          // Push directly to any MJPEG receivers subscribed specifically to this list tab
          pushFrameToNdiClients(entry.frameDataUrl, lid);
          if (
            electronNativeDecoder &&
            listSourceName &&
            isSourceAuthorized &&
            !sentSourcesInBatch.has(listSourceName)
          ) {
            electronNativeDecoder(
              entry.frameDataUrl,
              listSourceName,
              state.ndiStream.frameRate,
              state.ndiStream.alphaChannel
            );
            sentSourcesInBatch.add(listSourceName);
          }
        }
        if (
          entry &&
          typeof entry.rawRgbaBase64 === 'string' &&
          typeof body.width === 'number' &&
          typeof body.height === 'number' &&
          listSourceName &&
          isSourceAuthorized &&
          !sentSourcesInBatch.has(listSourceName)
        ) {
          try {
            const rawBuf = Buffer.from(entry.rawRgbaBase64, 'base64');
            ndiNativeBridge.sendRawFrame(
              rawBuf,
              body.width,
              body.height,
              'RGBA',
              state.ndiStream.frameRate,
              state.ndiStream.alphaChannel,
              listSourceName
            );
            sentSourcesInBatch.add(listSourceName);
            updatedAnyFrame = true;
          } catch {
            // Ignore raw buffer decode error
          }
        }
      }
    }

    // 2. Process primary / Multi Output frame
    const isPrimaryAuthorized =
      authorizedSources.size === 0 || authorizedSources.has(primarySourceName);
    if (typeof body.frameDataUrl === 'string' && body.frameDataUrl.startsWith('data:image/')) {
      state.latestNdiFrameDataUrl = body.frameDataUrl;
      updatedAnyFrame = true;
      pushFrameToNdiClients(body.frameDataUrl, null);
      if (
        electronNativeDecoder &&
        primarySourceName &&
        isPrimaryAuthorized &&
        !sentSourcesInBatch.has(primarySourceName)
      ) {
        electronNativeDecoder(
          body.frameDataUrl,
          primarySourceName,
          state.ndiStream.frameRate,
          state.ndiStream.alphaChannel
        );
        sentSourcesInBatch.add(primarySourceName);
      }
    }
    if (
      typeof body.rawRgbaBase64 === 'string' &&
      typeof body.width === 'number' &&
      typeof body.height === 'number' &&
      primarySourceName &&
      isPrimaryAuthorized &&
      !sentSourcesInBatch.has(primarySourceName)
    ) {
      try {
        const rawBuf = Buffer.from(body.rawRgbaBase64, 'base64');
        ndiNativeBridge.sendRawFrame(
          rawBuf,
          body.width,
          body.height,
          'RGBA',
          state.ndiStream.frameRate,
          state.ndiStream.alphaChannel,
          primarySourceName
        );
        sentSourcesInBatch.add(primarySourceName);
        updatedAnyFrame = true;
      } catch {
        // Ignore raw buffer decode error
      }
    }

    if (updatedAnyFrame) {
      state.ndiStream.lastFrameAt = Date.now();
      state.ndiStream.frameCount += 1;
    }

    const nativeReceivers = ndiNativeBridge.getConnectedReceiversCount();
    sendJson(200, {
      success: true,
      receiversCount: ndiStreamClients.size + nativeReceivers,
      frameCount: state.ndiStream.frameCount,
    });
    return true;
  }

  // 12. GET /api/lan/ndi/frame or /api/lan/ndi/frame.png (Remote computer captures live NDI RGBA/PNG frame)
  if ((pathname === '/api/lan/ndi/frame' || pathname === '/api/lan/ndi/frame.png') && method === 'GET') {
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const reqListId = params.get('listId') || '';

    // When a specific listId is requested, strictly verify that list is active and NEVER fall back to another list
    let chosenDataUrl: string | null = null;
    let chosenSourceName = state.ndiStream.sourceName;
    if (reqListId) {
      const isReqListActive =
        state.ndiStream.active &&
        (state.ndiStream.multiActive || Boolean(state.ndiStream.activeByList?.[reqListId]));
      const listFrameEntry = isReqListActive ? state.latestNdiFramesByList[reqListId] : null;
      chosenDataUrl = listFrameEntry?.frameDataUrl || null;
      chosenSourceName =
        listFrameEntry?.sourceName ||
        state.ndiStream.sourceNamesByList?.[reqListId] ||
        state.ndiStream.sourceName;
    } else {
      chosenDataUrl = state.ndiStream.active ? state.latestNdiFrameDataUrl : null;
    }

    if (!state.ndiStream.active || !chosenDataUrl) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(
        JSON.stringify({
          error: reqListId
            ? `NDI stream for list "${reqListId}" is currently inactive or no frame available`
            : 'NDI stream is currently inactive or no frame available',
        })
      );
      return true;
    }
    const commaIdx = chosenDataUrl.indexOf(',');
    const headerPart = chosenDataUrl.slice(0, commaIdx);
    const base64Part = chosenDataUrl.slice(commaIdx + 1);
    const mimeMatch = headerPart.match(/^data:([^;]+);base64$/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
    const buffer = Buffer.from(base64Part, 'base64');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Access-Control-Allow-Origin': '*',
      'X-NDI-Source-Name': chosenSourceName,
      'X-NDI-Resolution': `${state.ndiStream.width}x${state.ndiStream.height}`,
      'X-NDI-Framerate': String(state.ndiStream.frameRate),
      'X-NDI-Groups': state.ndiStream.useCustomGroups ? state.ndiStream.customGroups : 'Public',
    });
    res.end(buffer);
    return true;
  }

  // 13. GET /api/lan/ndi/mjpeg (Live continuous network video stream for OBS / vMix / VLC / Remote Capture)
  if (pathname === '/api/lan/ndi/mjpeg' && method === 'GET') {
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const reqListId = params.get('listId') || null;
    const rawMode = params.get('mode');
    const reqMode: 'single' | 'multi' | null =
      rawMode === 'multi' ? 'multi' : rawMode === 'single' ? 'single' : null;
    const headerSourceName = reqListId
      ? state.ndiStream.sourceNamesByList?.[reqListId] || `ProTimer (${reqListId})`
      : reqMode === 'multi'
      ? state.ndiStream.multiSourceName
      : state.ndiStream.sourceName;

    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=ndi_frame',
      'Cache-Control': 'no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0',
      Pragma: 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-NDI-Source-Name': headerSourceName,
    });

    ndiStreamClients.set(res, { listId: reqListId, mode: reqMode });

    // Immediately send the matching latest frame if available
    const initialDataUrl = reqListId
      ? state.ndiStream.active &&
        (state.ndiStream.multiActive || Boolean(state.ndiStream.activeByList?.[reqListId]))
        ? state.latestNdiFramesByList[reqListId]?.frameDataUrl || null
        : null
      : state.ndiStream.active
      ? state.latestNdiFrameDataUrl
      : null;

    if (initialDataUrl) {
      try {
        writeMjpegFrame(res, initialDataUrl);
      } catch {
        // ignore write error
      }
    }

    req.on('close', () => {
      ndiStreamClients.delete(res);
    });
    return true;
  }

  // 14. GET /api/lan/updates/check (Check GitHub Releases for newer ProTimer versions)
  if (pathname === '/api/lan/updates/check' && method === 'GET') {
    const rootDir = path.resolve(process.cwd());
    const { owner, repo } = resolveGitHubRepo(rootDir);
    const currentVersion = resolvePackageVersion(rootDir);
    try {
      const release = await fetchLatestGitHubRelease({
        owner,
        repo,
        currentVersion,
        platform: process.platform,
        arch: process.arch,
        isPortable: false,
      });
      if (release.isUpdateAvailable) {
        sendJson(200, {
          status: 'available',
          currentVersion: release.currentVersion,
          availableVersion: release.availableVersion,
          percent: 0,
          message: `ProTimer v${release.availableVersion} is available on GitHub Releases.`,
          error: null,
          releaseUrl: release.releaseUrl,
          downloadUrl: release.downloadUrl,
          releaseNotes: release.releaseNotes,
          publishedAt: release.publishedAt,
          canAutoInstall: false,
          checkedAt: Date.now(),
          source: 'github-api',
        });
      } else {
        sendJson(200, {
          status: 'up-to-date',
          currentVersion: release.currentVersion,
          availableVersion: release.availableVersion,
          percent: 100,
          message: `You are running the latest version (v${release.currentVersion}).`,
          error: null,
          releaseUrl: release.releaseUrl,
          downloadUrl: null,
          releaseNotes: release.releaseNotes,
          publishedAt: release.publishedAt,
          canAutoInstall: false,
          checkedAt: Date.now(),
          source: 'github-api',
        });
      }
    } catch (err: any) {
      sendJson(200, {
        status: 'error',
        currentVersion,
        availableVersion: null,
        percent: 0,
        message: 'Could not reach GitHub Releases update server.',
        error: err?.message || 'Unable to check GitHub Releases.',
        releaseUrl: `https://github.com/${owner}/${repo}/releases`,
        downloadUrl: null,
        releaseNotes: null,
        canAutoInstall: false,
        checkedAt: Date.now(),
        source: 'github-api',
      });
    }
    return true;
  }

  return false;
}
