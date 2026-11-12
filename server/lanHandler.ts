/**
 * LAN Remote Control & Display Synchronization Engine.
 * Manages cross-device communication, access PIN security, and state relaying
 * for mobile phones, tablets, and remote AV computers on the local network.
 */

import os from 'os';
import type { IncomingMessage, ServerResponse } from 'http';

export interface NdiNetworkStreamConfig {
  active: boolean;
  mode: 'single' | 'multi';
  sourceName: string;
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

export interface LanState {
  masterState: unknown | null;
  timers: unknown[];
  accessPin: string;
  pinRequired: boolean;
  pendingCommands: Array<{
    id: string;
    command: string;
    payload?: unknown;
    timestamp: number;
  }>;
  ndiStream: NdiNetworkStreamConfig;
  latestNdiFrameDataUrl: string | null;
}

const state: LanState = {
  masterState: null,
  timers: [],
  accessPin: '1234',
  pinRequired: true,
  pendingCommands: [],
  ndiStream: {
    active: false,
    mode: 'single',
    sourceName: 'ProTimer (Main Output)',
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
};

// SSE connected clients
const sseClients: Set<ServerResponse> = new Set();

// Live NDI MJPEG / Multipart stream clients on the network
const ndiStreamClients: Set<ServerResponse> = new Set();

export function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const iface of list) {
      // Look for non-internal IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses.length > 0 ? addresses : ['127.0.0.1'];
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
    const ips = getLocalIpAddresses();
    const primaryIp = ips[0] || '127.0.0.1';
    const hostHeader = req.headers.host || `${primaryIp}:3000`;
    const isLocalhost = hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1');
    const resolvedHost = isLocalhost && primaryIp !== '127.0.0.1' ? `${primaryIp}:3000` : hostHeader;
    const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
    const baseOrigin = `${proto}://${resolvedHost}`;

    sendJson(200, {
      ip: primaryIp,
      ips,
      port: 3000,
      pin: state.accessPin,
      pinRequired: state.pinRequired,
      defaultPin: state.accessPin,
      interfaces: ips.map((addr, i) => ({ name: i === 0 ? 'Primary LAN' : `Interface ${i + 1}`, address: addr })),
      controlUrl: `${baseOrigin}/?display=lan_control`,
      displayUrl: `${baseOrigin}/?display=lan_display`,
      hasMaster: Boolean(state.masterState),
      connectedClients: sseClients.size,
      ndiStream: state.ndiStream,
      ndiClientsCount: ndiStreamClients.size,
    });
    return true;
  }

  // 2. POST /api/lan/pin (Configure PIN)
  if (pathname === '/api/lan/pin' && method === 'POST') {
    const body = await readBody();
    if (typeof body.pin === 'string') {
      state.accessPin = body.pin.trim() || '1234';
    }
    if (typeof body.pinRequired === 'boolean') {
      state.pinRequired = body.pinRequired;
    }
    sendJson(200, { success: true, pin: state.accessPin, pinRequired: state.pinRequired });
    return true;
  }

  // 3. POST /api/lan/verify-pin (Client verification)
  if (pathname === '/api/lan/verify-pin' && method === 'POST') {
    const body = await readBody();
    if (!state.pinRequired || String(body.pin).trim() === state.accessPin) {
      sendJson(200, {
        valid: true,
        token: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
    } else {
      sendJson(401, {
        valid: false,
        error: 'Invalid Access PIN. Please verify the PIN displayed on the ProTimer Master console.',
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
    sendJson(200, {
      state: state.masterState,
      timers: state.timers,
      pinRequired: state.pinRequired,
      timestamp: Date.now(),
    });
    return true;
  }

  // 6. GET /api/lan/stream (Server-Sent Events for real-time live push)
  if (pathname === '/api/lan/stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', state: state.masterState, timers: state.timers })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return true;
  }

  // 7. POST /api/lan/command (Remote client issues command)
  if (pathname === '/api/lan/command' && method === 'POST') {
    const body = await readBody();
    const clientPin = String(body.pin || '').trim();

    // Verify PIN if enabled
    if (state.pinRequired && clientPin !== state.accessPin) {
      sendJson(401, { success: false, error: 'Unauthorized: Valid Access PIN required to issue commands' });
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
    sendJson(200, {
      ...state.ndiStream,
      ips,
      port: 3000,
      receiversCount: ndiStreamClients.size,
      captureUrls: {
        browserSourceUrl: `http://${primaryIp}:3000/?display=ndi`,
        mjpegStreamUrl: `http://${primaryIp}:3000/api/lan/ndi/mjpeg`,
        liveFrameUrl: `http://${primaryIp}:3000/api/lan/ndi/frame.png`,
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
      sourceName:
        typeof body.sourceName === 'string' && body.sourceName.trim()
          ? body.sourceName.trim()
          : state.ndiStream.sourceName,
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

    if (!nextActive) {
      state.latestNdiFrameDataUrl = null;
    }

    broadcastSse({
      type: 'NDI_STREAM_UPDATED',
      ndiStream: state.ndiStream,
      timestamp: Date.now(),
    });

    sendJson(200, { success: true, ndiStream: state.ndiStream });
    return true;
  }

  // 11. POST /api/lan/ndi/frame (Master pushes rendered NDI video frame for network capture)
  if (pathname === '/api/lan/ndi/frame' && method === 'POST') {
    const body = await readBody();
    if (typeof body.frameDataUrl === 'string' && body.frameDataUrl.startsWith('data:image/')) {
      state.latestNdiFrameDataUrl = body.frameDataUrl;
      state.ndiStream.lastFrameAt = Date.now();
      state.ndiStream.frameCount += 1;
      pushFrameToNdiClients(body.frameDataUrl);
    }
    sendJson(200, {
      success: true,
      receiversCount: ndiStreamClients.size,
      frameCount: state.ndiStream.frameCount,
    });
    return true;
  }

  // 12. GET /api/lan/ndi/frame or /api/lan/ndi/frame.png (Remote computer captures live NDI RGBA/PNG frame)
  if ((pathname === '/api/lan/ndi/frame' || pathname === '/api/lan/ndi/frame.png') && method === 'GET') {
    if (!state.ndiStream.active || !state.latestNdiFrameDataUrl) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ error: 'NDI stream is currently inactive or no frame available' }));
      return true;
    }
    const commaIdx = state.latestNdiFrameDataUrl.indexOf(',');
    const headerPart = state.latestNdiFrameDataUrl.slice(0, commaIdx);
    const base64Part = state.latestNdiFrameDataUrl.slice(commaIdx + 1);
    const mimeMatch = headerPart.match(/^data:([^;]+);base64$/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
    const buffer = Buffer.from(base64Part, 'base64');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Access-Control-Allow-Origin': '*',
      'X-NDI-Source-Name': state.ndiStream.sourceName,
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
