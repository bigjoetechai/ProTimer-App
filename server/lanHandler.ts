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

// Live NDI MJPEG / Multipart stream clients on the network
const ndiStreamClients: Set<ServerResponse> = new Set();

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

function pushFrameToNdiClients(dataUrl: string) {
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

  // Helper to read JSON body (works with both Express pre-parsed req.body and raw HTTP streams)
  const readBody = (): Promise<any> => {
    const preParsed = (req as any).body;
    if (preParsed && typeof preParsed === 'object' && Object.keys(preParsed).length > 0) {
      return Promise.resolve(preParsed);
    }
    if ((req as any).readableEnded) {
      return Promise.resolve(preParsed || {});
    }
    return new Promise((resolve) => {
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
  };

  const sendJson = (statusCode: number, payload: unknown) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(payload));
  };

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

    sendJson(200, {
      ip: primaryIp,
      ips,
      port: activeServerPort,
      listId: requestedListId,
      pin: listConfig.pin,
      pinRequired: listConfig.pinRequired,
      sessionToken: listConfig.sessionToken,
      desktopSessionToken: listConfig.desktopSessionToken,
      defaultPin: listConfig.pin,
      listConfigs: state.listConfigs,
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

  // 2. POST /api/lan/pin (Configure PIN per list or globally)
  if (pathname === '/api/lan/pin' && method === 'POST') {
    const body = await readBody();
    const targetListId = typeof body.listId === 'string' && body.listId ? body.listId : '';
    if (targetListId) {
      const cfg = getOrCreateListLanConfig(targetListId);
      if (typeof body.pin === 'string') {
        cfg.pin = body.pin.trim() || '1234';
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
      state.accessPin = body.pin.trim() || '1234';
    }
    if (typeof body.pinRequired === 'boolean') {
      state.pinRequired = body.pinRequired;
    }
    sendJson(200, { success: true, pin: state.accessPin, pinRequired: state.pinRequired });
    return true;
  }

  // 3. POST /api/lan/verify-pin (Client verification per list or globally)
  if (pathname === '/api/lan/verify-pin' && method === 'POST') {
    const body = await readBody();
    const targetListId = typeof body.listId === 'string' && body.listId ? body.listId : '';
    const cfg = targetListId ? getOrCreateListLanConfig(targetListId) : null;
    const effectivePinRequired = cfg ? cfg.pinRequired : state.pinRequired;
    const effectivePin = cfg ? cfg.pin : state.accessPin;

    if (!effectivePinRequired || String(body.pin || '').trim() === effectivePin) {
      sendJson(200, {
        valid: true,
        listId: targetListId || undefined,
        token: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
    } else {
      sendJson(401, {
        valid: false,
        error: 'Invalid Access PIN. Please verify the Access PIN for this list on the ProTimer console.',
      });
    }
    return true;
  }

  // 4. POST /api/lan/state (Master pushes state)
  if (pathname === '/api/lan/state' && method === 'POST') {
    const body = await readBody();
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
    const body = await readBody();
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
    const matchesTargetPin = !effectivePinRequired || clientPin === effectivePin;
    const matchesAuthListPin = authCfg ? !authCfg.pinRequired || clientPin === authCfg.pin : false;

    // Verify PIN if enabled for this list
    if (!matchesTargetPin && !matchesAuthListPin) {
      sendJson(401, { success: false, error: 'Unauthorized: Valid Access PIN required to issue commands for this list' });
      return true;
    }

    if (!body.command) {
      sendJson(400, { success: false, error: 'Missing command name' });
      return true;
    }

    const commandEntry = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      command: String(body.command).toUpperCase(),
      payload: body.payload,
      timestamp: Date.now(),
    };

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
    const body = await readBody();
    const primarySourceName =
      (typeof body.sourceName === 'string' && body.sourceName.trim()) ||
      state.ndiStream.sourceName;
    const sentSourcesInBatch = new Set<string>();

    if (typeof body.frameDataUrl === 'string' && body.frameDataUrl.startsWith('data:image/')) {
      state.latestNdiFrameDataUrl = body.frameDataUrl;
      state.ndiStream.lastFrameAt = Date.now();
      state.ndiStream.frameCount += 1;
      pushFrameToNdiClients(body.frameDataUrl);
      if (electronNativeDecoder && primarySourceName) {
        electronNativeDecoder(
          body.frameDataUrl,
          primarySourceName,
          state.ndiStream.frameRate,
          state.ndiStream.alphaChannel
        );
        sentSourcesInBatch.add(primarySourceName);
      }
    }
    if (body.perListFrames && typeof body.perListFrames === 'object') {
      for (const [lid, entry] of Object.entries(body.perListFrames as Record<string, any>)) {
        const listSourceName =
          (entry && typeof entry.sourceName === 'string' && entry.sourceName.trim()) ||
          state.ndiStream.sourceNamesByList?.[lid] ||
          `ProTimer (${lid})`;
        if (entry && typeof entry.frameDataUrl === 'string') {
          state.latestNdiFramesByList[lid] = {
            sourceName: listSourceName,
            frameDataUrl: entry.frameDataUrl,
          };
          if (!state.latestNdiFrameDataUrl) {
            state.latestNdiFrameDataUrl = entry.frameDataUrl;
          }
          if (electronNativeDecoder && listSourceName && !sentSourcesInBatch.has(listSourceName)) {
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
          } catch {
            // Ignore raw buffer decode error
          }
        }
      }
    }
    if (
      typeof body.rawRgbaBase64 === 'string' &&
      typeof body.width === 'number' &&
      typeof body.height === 'number' &&
      primarySourceName &&
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
      } catch {
        // Ignore raw buffer decode error
      }
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
    const listFrameEntry = reqListId ? state.latestNdiFramesByList[reqListId] : null;
    const chosenDataUrl = listFrameEntry?.frameDataUrl || state.latestNdiFrameDataUrl;
    const chosenSourceName = listFrameEntry?.sourceName || state.ndiStream.sourceName;

    if (!state.ndiStream.active || !chosenDataUrl) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ error: 'NDI stream is currently inactive or no frame available' }));
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
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=ndi_frame',
      'Cache-Control': 'no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0',
      Pragma: 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-NDI-Source-Name': state.ndiStream.sourceName,
    });

    ndiStreamClients.add(res);

    // Immediately send the latest frame if available
    if (state.latestNdiFrameDataUrl) {
      try {
        const commaIdx = state.latestNdiFrameDataUrl.indexOf(',');
        const headerPart = state.latestNdiFrameDataUrl.slice(0, commaIdx);
        const base64Part = state.latestNdiFrameDataUrl.slice(commaIdx + 1);
        const mimeMatch = headerPart.match(/^data:([^;]+);base64$/);
        const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
        const buffer = Buffer.from(base64Part, 'base64');
        res.write(`--ndi_frame\r\n`);
        res.write(`Content-Type: ${contentType}\r\n`);
        res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
        res.write(buffer);
        res.write(`\r\n`);
      } catch {
        // ignore write error
      }
    }

    req.on('close', () => {
      ndiStreamClients.delete(res);
    });
    return true;
  }

  return false;
}
