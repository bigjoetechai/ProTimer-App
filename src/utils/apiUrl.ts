/**
 * Standalone API URL resolver for ProTimer.
 *
 * - In packaged Electron production (`window.location.protocol === 'file:'` loaded via `win.loadFile('dist/index.html')`),
 *   routes `/api/...` requests to the embedded HTTP server started by Electron's `main.cjs` on its active local port.
 * - In LAN browsers (`http://<LAN-IP>:<port>`) or standard web mode, uses relative same-origin paths (`/api/...`)
 *   without ever hardcoding `localhost:5173` or `localhost:3000`.
 */

let cachedApiBaseUrl = '';

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const electronApi = (window as any).electronAPI;
  if (electronApi) {
    if (typeof electronApi.getApiBaseUrl === 'function') {
      const url = electronApi.getApiBaseUrl();
      if (url && typeof url === 'string') {
        cachedApiBaseUrl = url.replace(/\/+$/, '');
        return cachedApiBaseUrl;
      }
    }
    if (typeof electronApi.apiBaseUrl === 'string' && electronApi.apiBaseUrl) {
      cachedApiBaseUrl = electronApi.apiBaseUrl.replace(/\/+$/, '');
      return cachedApiBaseUrl;
    }
    if (typeof electronApi.lanPort === 'number' && electronApi.lanPort > 0) {
      cachedApiBaseUrl = `http://127.0.0.1:${electronApi.lanPort}`;
      return cachedApiBaseUrl;
    }
  }

  if (cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  // If loaded via Electron loadFile (file:// protocol), connect to the embedded main-process server
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000';
  }

  // When accessed via HTTP/HTTPS (e.g. LAN device or web preview), use same-origin relative URLs
  return '';
}

export function resolveApiUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Installs a transparent interceptor on `window.fetch` and `window.EventSource`
 * when running in standalone Electron `file://` mode (`loadFile('dist/index.html')`),
 * ensuring any relative `/api/...` request automatically routes to the embedded server in `main.cjs`.
 */
export function installStandaloneFetchPatch(): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__protimerStandalonePatchInstalled) return;
  w.__protimerStandalonePatchInstalled = true;

  // Async refresh of active embedded server port from Electron main process
  if (w.electronAPI && typeof w.electronAPI.getAppInfo === 'function') {
    w.electronAPI
      .getAppInfo()
      .then((info: any) => {
        if (info && typeof info.lanPort === 'number' && info.lanPort > 0) {
          cachedApiBaseUrl = `http://127.0.0.1:${info.lanPort}`;
        }
      })
      .catch(() => {});
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return origFetch(resolveApiUrl(input), init);
    }
    return origFetch(input, init);
  }) as typeof window.fetch;

  if (typeof window.EventSource === 'function') {
    const OrigEventSource = window.EventSource;
    const PatchedEventSource = function (url: string | URL, eventSourceInitDict?: EventSourceInit) {
      const strUrl = typeof url === 'string' ? url : url.toString();
      const resolved = strUrl.startsWith('/api/') ? resolveApiUrl(strUrl) : strUrl;
      return new OrigEventSource(resolved, eventSourceInitDict);
    } as unknown as typeof EventSource;
    PatchedEventSource.prototype = OrigEventSource.prototype;
    (PatchedEventSource as any).CONNECTING = OrigEventSource.CONNECTING;
    (PatchedEventSource as any).OPEN = OrigEventSource.OPEN;
    (PatchedEventSource as any).CLOSED = OrigEventSource.CLOSED;
    window.EventSource = PatchedEventSource;
  }
}
