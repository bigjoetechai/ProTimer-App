/**
 * LAN Remote Control & Display Synchronization Engine.
 * Manages cross-device communication, access PIN security, and state relaying
 * for mobile phones, tablets, and remote AV computers on the local network.
 */

import os from 'os';
import type { IncomingMessage, ServerResponse } from 'http';

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
}

const state: LanState = {
  masterState: null,
  timers: [],
  accessPin: '1234',
  pinRequired: true,
  pendingCommands: [],
};

// SSE connected clients
const sseClients: Set<ServerResponse> = new Set();

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

  // Helper to read JSON body
  const readBody = (): Promise<any> => {
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
    sendJson(200, {
      ips,
      port: 3000,
      pinRequired: state.pinRequired,
      defaultPin: state.accessPin,
      hasMaster: Boolean(state.masterState),
      connectedClients: sseClients.size,
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
      state.masterState = body.state;
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

  return false;
}
