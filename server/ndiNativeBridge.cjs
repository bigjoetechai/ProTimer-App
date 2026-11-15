/**
 * Native NDI® SDK Bridge & mDNS (_ndi._tcp.local) Network Discovery Engine for ProTimer.
 *
 * Works in both Electron Main Process (Windows Desktop App) and Node.js Express Server:
 * 1. Automatically locates and loads the official NewTek/Vizrt NDI Runtime library:
 *    - Windows x64: `Processing.NDI.Lib.x64.dll` (via NDI_RUNTIME_DIR_V6 / V5 / V4,
 *      `C:\Program Files\NDI\...`, or local `ndi/` folder)
 *    - Linux x64: `libndi.so` / `libndi.so.6` / `libndi.so.5`
 *    - macOS: `libndi.dylib`
 * 2. Binds the official NDI C ABI using `koffi` (zero C++ compiler required):
 *    - `NDIlib_initialize()`
 *    - `NDIlib_send_create()` -> registers `<HOSTNAME> (<NDI Source Name>)` on the network
 *    - `NDIlib_send_send_video_v2()` -> streams raw BGRA / RGBA video frames with Alpha support
 *    - `NDIlib_send_get_no_connections()` -> reports live connected NDI receivers (OBS, vMix, etc.)
 * 3. Broadcasts mDNS (`_ndi._tcp.local`) multicast DNS announcements on 224.0.0.251:5353
 *    across all active LAN interfaces.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');

// FourCC constants from Processing.NDI.structs.h (little-endian 32-bit integers)
// NDI_LIB_FOURCC('B', 'G', 'R', 'A') = 0x41524742
// NDI_LIB_FOURCC('R', 'G', 'B', 'A') = 0x41424752
// NDI_LIB_FOURCC('B', 'G', 'R', 'X') = 0x58524742
// NDI_LIB_FOURCC('R', 'G', 'B', 'X') = 0x58424752
const FOURCC_BGRA = 0x41524742;
const FOURCC_BGRX = 0x58524742;
const FOURCC_RGBA = 0x41424752;
const FOURCC_RGBX = 0x58424752;

const FRAME_FORMAT_PROGRESSIVE = 1;
const NDI_SEND_TIMECODE_SYNTHESIZE = BigInt('9223372036854775807'); // INT64_MAX

const NDI_RUNTIME_DOWNLOAD_URL = 'http://ndi.link/NDIRedistV6';
const NDI_TOOLS_DOWNLOAD_URL = 'https://ndi.video/tools/';

function getCandidateDllPaths() {
  const candidates = [];
  const platform = process.platform;
  const arch = process.arch;

  const envVars = [
    'NDI_RUNTIME_DIR_V6',
    'NDI_RUNTIME_DIR_V5',
    'NDI_RUNTIME_DIR_V4',
    'NDI_RUNTIME_DIR_V3',
    'NDI_RUNTIME_DIR_V2',
  ];

  if (platform === 'win32') {
    const dllName = arch === 'ia32' ? 'Processing.NDI.Lib.x86.dll' : 'Processing.NDI.Lib.x64.dll';

    // 1. Official NDI environment variables set by NDI Runtime / NDI Tools installer
    for (const envName of envVars) {
      const dir = process.env[envName];
      if (dir) {
        candidates.push(path.join(dir, dllName));
      }
    }

    // 2. Local bundled `ndi/` directory next to executable or project root
    const appDirs = [
      process.cwd(),
      path.resolve(__dirname, '..'),
      process.resourcesPath || '',
      process.execPath ? path.dirname(process.execPath) : '',
    ].filter(Boolean);

    for (const base of appDirs) {
      candidates.push(path.join(base, 'ndi', dllName));
      candidates.push(path.join(base, dllName));
    }

    // 3. Standard Windows Program Files installation paths for NDI 6, NDI 5, and NDI 4
    const progFiles = [
      process.env['ProgramFiles'] || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ];
    for (const pf of progFiles) {
      candidates.push(
        path.join(pf, 'NDI', 'NDI 6 Runtime', 'v6', dllName),
        path.join(pf, 'NDI', 'NDI 6 Tools', 'Runtime', dllName),
        path.join(pf, 'NDI', 'NDI 6 Tools', 'Studio Monitor', dllName),
        path.join(pf, 'NDI', 'NDI 6 Tools', 'Screen Capture', dllName),
        path.join(pf, 'NDI', 'NDI 5 Runtime', 'v5', dllName),
        path.join(pf, 'NDI', 'NDI 5 Tools', 'Runtime', dllName),
        path.join(pf, 'NDI', 'NDI 5 Tools', 'Studio Monitor', dllName),
        path.join(pf, 'NewTek', 'NDI 5 Runtime', 'v5', dllName),
        path.join(pf, 'NewTek', 'NDI 4 Runtime', 'v4', dllName),
        path.join(pf, 'NewTek', 'NDI 4 Tools', 'Runtime', dllName)
      );
    }
  } else if (platform === 'linux') {
    for (const envName of envVars) {
      const dir = process.env[envName];
      if (dir) {
        candidates.push(
          path.join(dir, 'libndi.so.6'),
          path.join(dir, 'libndi.so.5'),
          path.join(dir, 'libndi.so')
        );
      }
    }
    const appDirs = [process.cwd(), path.resolve(__dirname, '..')];
    for (const base of appDirs) {
      candidates.push(path.join(base, 'ndi', 'libndi.so'));
      candidates.push(path.join(base, 'ndi', 'libndi.so.6'));
      candidates.push(path.join(base, 'ndi', 'libndi.so.5'));
    }
    candidates.push(
      '/usr/lib/libndi.so.6',
      '/usr/lib/libndi.so.5',
      '/usr/lib/libndi.so',
      '/usr/local/lib/libndi.so.6',
      '/usr/local/lib/libndi.so.5',
      '/usr/local/lib/libndi.so',
      '/usr/lib/x86_64-linux-gnu/libndi.so.6',
      '/usr/lib/x86_64-linux-gnu/libndi.so.5',
      '/usr/lib/x86_64-linux-gnu/libndi.so'
    );
  } else if (platform === 'darwin') {
    for (const envName of envVars) {
      const dir = process.env[envName];
      if (dir) {
        candidates.push(path.join(dir, 'libndi.dylib'));
      }
    }
    candidates.push(
      '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib',
      '/usr/local/lib/libndi.dylib'
    );
  }

  return Array.from(new Set(candidates));
}

function convertFrameRateToRational(fps) {
  const num = Number(fps) || 30;
  if (Math.abs(num - 59.94) < 0.05) return { N: 60000, D: 1001 };
  if (Math.abs(num - 29.97) < 0.05) return { N: 30000, D: 1001 };
  if (Math.abs(num - 23.976) < 0.05) return { N: 24000, D: 1001 };
  return { N: Math.round(num) * 1000, D: 1000 };
}

/**
 * Lightweight mDNS Responder for `_ndi._tcp.local` on 224.0.0.251:5353
 */
class NdiMdnsAdvertiser {
  constructor() {
    this.socket = null;
    this.announceTimer = null;
    this.active = false;
    this.sourceName = 'ProTimer (Main Output)';
    this.port = 5961;
  }

  encodeDnsName(name) {
    const parts = name.split('.').filter(Boolean);
    const buffers = [];
    for (const part of parts) {
      const b = Buffer.from(part, 'utf8');
      buffers.push(Buffer.from([b.length]), b);
    }
    buffers.push(Buffer.from([0]));
    return Buffer.concat(buffers);
  }

  buildAnnouncementPacket(sourceName, ipAddress, port) {
    const hostLabel = os.hostname().replace(/[^a-zA-Z0-9-]/g, '') || 'PROTIMER-PC';
    const fullInstanceName = `${hostLabel} (${sourceName})._ndi._tcp.local`;
    const serviceType = '_ndi._tcp.local';
    const targetHost = `${hostLabel}.local`;

    // DNS Header: Flags=0x8400 (Standard query response, Authoritative), ANCOUNT=3
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0x0000, 0); // ID
    header.writeUInt16BE(0x8400, 2); // Flags: Response + Authoritative
    header.writeUInt16BE(0, 4); // QDCOUNT
    header.writeUInt16BE(3, 6); // ANCOUNT
    header.writeUInt16BE(0, 8); // NSCOUNT
    header.writeUInt16BE(0, 10); // ARCOUNT

    // 1. PTR Record: _ndi._tcp.local -> <Host> (<Source>)._ndi._tcp.local
    const ptrName = this.encodeDnsName(serviceType);
    const ptrData = this.encodeDnsName(fullInstanceName);
    const ptrMeta = Buffer.alloc(10);
    ptrMeta.writeUInt16BE(12, 0); // TYPE PTR
    ptrMeta.writeUInt16BE(0x0001, 2); // CLASS IN
    ptrMeta.writeUInt32BE(120, 4); // TTL 120s
    ptrMeta.writeUInt16BE(ptrData.length, 8);

    // 2. SRV Record: <Host> (<Source>)._ndi._tcp.local -> port, targetHost
    const srvName = this.encodeDnsName(fullInstanceName);
    const targetHostEncoded = this.encodeDnsName(targetHost);
    const srvData = Buffer.alloc(6 + targetHostEncoded.length);
    srvData.writeUInt16BE(0, 0); // Priority
    srvData.writeUInt16BE(0, 2); // Weight
    srvData.writeUInt16BE(port || 5961, 4); // Port
    targetHostEncoded.copy(srvData, 6);
    const srvMeta = Buffer.alloc(10);
    srvMeta.writeUInt16BE(33, 0); // TYPE SRV
    srvMeta.writeUInt16BE(0x8001, 2); // CLASS IN + Cache Flush
    srvMeta.writeUInt32BE(120, 4); // TTL 120s
    srvMeta.writeUInt16BE(srvData.length, 8);

    // 3. A Record: targetHost -> IPv4
    const aName = this.encodeDnsName(targetHost);
    const ipParts = (ipAddress || '127.0.0.1').split('.').map((n) => parseInt(n, 10) || 0);
    const aData = Buffer.from([ipParts[0], ipParts[1], ipParts[2], ipParts[3]]);
    const aMeta = Buffer.alloc(10);
    aMeta.writeUInt16BE(1, 0); // TYPE A
    aMeta.writeUInt16BE(0x8001, 2); // CLASS IN + Cache Flush
    aMeta.writeUInt32BE(120, 4); // TTL 120s
    aMeta.writeUInt16BE(4, 8);

    return Buffer.concat([
      header,
      ptrName,
      ptrMeta,
      ptrData,
      srvName,
      srvMeta,
      srvData,
      aName,
      aMeta,
      aData,
    ]);
  }

  start(sourceName, ipAddresses, port = 5961) {
    this.stop();
    this.sourceName = sourceName || 'ProTimer (Main Output)';
    this.port = port;
    this.active = true;

    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.socket = sock;

      sock.on('error', () => {
        // Ignore if UDP 5353 is restricted
      });

      const broadcastPacket = () => {
        if (!this.active || !this.socket) return;
        const ips = Array.isArray(ipAddresses) && ipAddresses.length > 0 ? ipAddresses : ['127.0.0.1'];
        for (const ip of ips) {
          try {
            const pkt = this.buildAnnouncementPacket(this.sourceName, ip, this.port);
            this.socket.send(pkt, 0, pkt.length, 5353, '224.0.0.251');
          } catch {
            // Ignore send error
          }
        }
      };

      sock.bind(5353, '0.0.0.0', () => {
        try {
          sock.setBroadcast(true);
          sock.setMulticastTTL(255);
          sock.addMembership('224.0.0.251');
        } catch {
          // Membership optional
        }
        broadcastPacket();
      });

      sock.on('message', (msg) => {
        try {
          if (msg && msg.includes(Buffer.from('_ndi', 'utf8'))) {
            broadcastPacket();
          }
        } catch {
          // Ignore malformed packet
        }
      });

      this.announceTimer = setInterval(broadcastPacket, 3000);
    } catch {
      // Ignore if socket creation fails
    }
  }

  stop() {
    this.active = false;
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore
      }
      this.socket = null;
    }
  }
}

class NdiNativeBridge {
  constructor() {
    this.koffiLoaded = false;
    this.ndiLib = null;
    this.dllPath = null;
    this.ndiVersion = null;
    this.loadError = null;

    // Bound C functions
    this.fnInitialize = null;
    this.fnDestroy = null;
    this.fnVersion = null;
    this.fnSendCreate = null;
    this.fnSendDestroy = null;
    this.fnSendVideoV2 = null;
    this.fnGetConnections = null;

    // Active sender state
    this.senderInstance = null;
    this.activeSourceName = null;
    this.activeGroups = null;
    this.lastRawBuffer = null;
    this.lastWidth = 1920;
    this.lastHeight = 1080;
    this.lastFourCC = FOURCC_RGBA;
    this.lastFps = 30;
    this.lastAlpha = false;
    this.keepAliveTimer = null;
    this.mdns = new NdiMdnsAdvertiser();

    this.tryLoadLibrary();
  }

  tryLoadLibrary() {
    if (this.ndiLib) return true;

    let koffi = null;
    try {
      koffi = require('koffi');
      this.koffiLoaded = true;
    } catch (err) {
      this.loadError = `FFI loader unavailable: ${err && err.message ? err.message : String(err)}`;
      return false;
    }

    const candidates = getCandidateDllPaths();
    let foundPath = null;
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          foundPath = candidate;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (!foundPath) {
      this.loadError =
        process.platform === 'win32'
          ? 'Processing.NDI.Lib.x64.dll not found. Install the free NDI 6 Runtime or NDI Tools on this Windows PC.'
          : 'Native NDI runtime library (libndi) not found on this machine.';
      return false;
    }

    try {
      // Add the DLL directory to PATH on Windows so any dependent DLLs load cleanly
      if (process.platform === 'win32') {
        const dllDir = path.dirname(foundPath);
        if (process.env.PATH && !process.env.PATH.includes(dllDir)) {
          process.env.PATH = `${dllDir};${process.env.PATH}`;
        }
      }

      const lib = koffi.load(foundPath);

      const NDIlib_send_create_t = koffi.struct('NDIlib_send_create_t', {
        p_ndi_name: 'const char *',
        p_groups: 'const char *',
        clock_video: 'bool',
        clock_audio: 'bool',
      });

      const NDIlib_video_frame_v2_t = koffi.struct('NDIlib_video_frame_v2_t', {
        xres: 'int32_t',
        yres: 'int32_t',
        FourCC: 'int32_t',
        frame_rate_N: 'int32_t',
        frame_rate_D: 'int32_t',
        picture_aspect_ratio: 'float',
        frame_format_type: 'int32_t',
        timecode: 'int64_t',
        p_data: 'uint8_t *',
        line_stride_in_bytes: 'int32_t',
        p_metadata: 'const char *',
        timestamp: 'int64_t',
      });

      this.fnInitialize = lib.func('bool NDIlib_initialize()');
      this.fnDestroy = lib.func('void NDIlib_destroy()');
      this.fnVersion = lib.func('const char * NDIlib_version()');
      this.fnSendCreate = lib.func(
        'void * NDIlib_send_create(const NDIlib_send_create_t * p_create_settings)'
      );
      this.fnSendDestroy = lib.func('void NDIlib_send_destroy(void * p_instance)');
      this.fnSendVideoV2 = lib.func(
        'void NDIlib_send_send_video_v2(void * p_instance, const NDIlib_video_frame_v2_t * p_video_data)'
      );
      this.fnGetConnections = lib.func(
        'int32_t NDIlib_send_get_no_connections(void * p_instance, uint32_t timeout_in_ms)'
      );

      const initialized = this.fnInitialize();
      if (!initialized) {
        this.loadError = 'NDIlib_initialize() returned false (CPU may not support NDI instructions).';
        return false;
      }

      this.ndiLib = lib;
      this.dllPath = foundPath;
      try {
        this.ndiVersion = this.fnVersion();
      } catch {
        this.ndiVersion = 'NDI Native Runtime';
      }
      this.loadError = null;
      return true;
    } catch (err) {
      this.loadError = `Failed loading NDI Runtime (${foundPath}): ${
        err && err.message ? err.message : String(err)
      }`;
      return false;
    }
  }

  getRuntimeDiagnostics() {
    if (!this.ndiLib) {
      this.tryLoadLibrary();
    }
    const hostname = os.hostname() || 'PC';
    const sourceName = this.activeSourceName || 'ProTimer (Main Output)';
    return {
      nativeNdiAvailable: Boolean(this.ndiLib),
      nativeNdiSending: Boolean(this.senderInstance),
      dllPath: this.dllPath,
      ndiVersion: this.ndiVersion,
      networkSourceFullName: `${hostname} (${sourceName})`,
      hostname,
      connectedReceivers: this.getConnectedReceiversCount(),
      mdnsActive: Boolean(this.mdns && this.mdns.active),
      error: this.loadError,
      downloadUrl: NDI_RUNTIME_DOWNLOAD_URL,
      toolsUrl: NDI_TOOLS_DOWNLOAD_URL,
      searchedPaths: getCandidateDllPaths().slice(0, 8),
    };
  }

  getConnectedReceiversCount() {
    if (!this.senderInstance || !this.fnGetConnections) return 0;
    try {
      const count = this.fnGetConnections(this.senderInstance, 0);
      return Math.max(0, Number(count) || 0);
    } catch {
      return 0;
    }
  }

  startSender({ sourceName, groups, useCustomGroups, width, height, frameRate, alphaChannel, ips, port }) {
    const cleanName = (sourceName && String(sourceName).trim()) || 'ProTimer (Main Output)';
    const cleanGroups =
      useCustomGroups && groups && String(groups).trim() && String(groups).trim().toLowerCase() !== 'public'
        ? String(groups).trim()
        : null;

    this.lastWidth = Number(width) || 1920;
    this.lastHeight = Number(height) || 1080;
    this.lastFps = Number(frameRate) || 30;
    this.lastAlpha = Boolean(alphaChannel);

    // Start mDNS _ndi._tcp.local discovery responder
    this.mdns.start(cleanName, ips, port || 5961);

    // Ensure native NDI DLL is loaded
    if (!this.ndiLib) {
      this.tryLoadLibrary();
    }

    if (this.ndiLib && this.fnSendCreate) {
      // Recreate sender if sourceName or groups changed
      if (
        this.senderInstance &&
        (this.activeSourceName !== cleanName || this.activeGroups !== cleanGroups)
      ) {
        this.destroySenderOnly();
      }

      if (!this.senderInstance) {
        try {
          // clock_video: false so we can push frames at either UI cadence or keepalive cadence without blocking the main thread
          this.senderInstance = this.fnSendCreate({
            p_ndi_name: cleanName,
            p_groups: cleanGroups,
            clock_video: false,
            clock_audio: false,
          });
          this.activeSourceName = cleanName;
          this.activeGroups = cleanGroups;

          // Send an initial frame immediately so the NDI source appears in OBS / vMix / Studio Monitor right away
          if (!this.lastRawBuffer || this.lastRawBuffer.length !== this.lastWidth * this.lastHeight * 4) {
            this.lastRawBuffer = Buffer.alloc(this.lastWidth * this.lastHeight * 4, 0);
            this.lastFourCC = this.lastAlpha ? FOURCC_RGBA : FOURCC_RGBX;
          }
          this.pushCurrentBufferToNdi();
        } catch (err) {
          this.loadError = `NDIlib_send_create failed: ${err && err.message ? err.message : String(err)}`;
        }
      }
    }

    // Start a keepalive loop (every 250ms) so NDI receivers see continuous frames even when timer is paused
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    this.keepAliveTimer = setInterval(() => {
      if (this.senderInstance && this.lastRawBuffer) {
        this.pushCurrentBufferToNdi();
      }
    }, 250);

    return this.getRuntimeDiagnostics();
  }

  destroySenderOnly() {
    if (this.senderInstance && this.fnSendDestroy) {
      try {
        this.fnSendDestroy(this.senderInstance);
      } catch {
        // Ignore destroy errors
      }
    }
    this.senderInstance = null;
  }

  stopSender() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.mdns.stop();
    this.destroySenderOnly();
    this.lastRawBuffer = null;
    return this.getRuntimeDiagnostics();
  }

  /**
   * Send raw RGBA or BGRA pixel buffer to the active NDI® sender.
   * @param {Buffer|Uint8Array} rawBuffer - Raw 4-bytes-per-pixel buffer (width * height * 4)
   * @param {number} width
   * @param {number} height
   * @param {'RGBA'|'BGRA'} pixelFormat
   * @param {number} frameRate
   * @param {boolean} alphaChannel
   */
  sendRawFrame(rawBuffer, width, height, pixelFormat = 'RGBA', frameRate = 30, alphaChannel = true) {
    if (!rawBuffer || !width || !height) return false;
    const expectedLen = width * height * 4;
    if (rawBuffer.byteLength < expectedLen) return false;

    const buf = Buffer.isBuffer(rawBuffer)
      ? rawBuffer
      : Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, expectedLen);

    this.lastRawBuffer = buf;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastFps = frameRate || this.lastFps || 30;
    this.lastAlpha = Boolean(alphaChannel);

    if (pixelFormat === 'BGRA') {
      this.lastFourCC = this.lastAlpha ? FOURCC_BGRA : FOURCC_BGRX;
    } else {
      this.lastFourCC = this.lastAlpha ? FOURCC_RGBA : FOURCC_RGBX;
    }

    return this.pushCurrentBufferToNdi();
  }

  pushCurrentBufferToNdi() {
    if (!this.senderInstance || !this.fnSendVideoV2 || !this.lastRawBuffer) {
      return false;
    }
    try {
      const { N, D } = convertFrameRateToRational(this.lastFps);
      const w = this.lastWidth;
      const h = this.lastHeight;

      this.fnSendVideoV2(this.senderInstance, {
        xres: w,
        yres: h,
        FourCC: this.lastFourCC,
        frame_rate_N: N,
        frame_rate_D: D,
        picture_aspect_ratio: w / Math.max(1, h),
        frame_format_type: FRAME_FORMAT_PROGRESSIVE,
        timecode: NDI_SEND_TIMECODE_SYNTHESIZE,
        p_data: this.lastRawBuffer,
        line_stride_in_bytes: w * 4,
        p_metadata: null,
        timestamp: 0n,
      });
      return true;
    } catch (err) {
      this.loadError = `NDI frame send error: ${err && err.message ? err.message : String(err)}`;
      return false;
    }
  }
}

const ndiNativeBridge = new NdiNativeBridge();

module.exports = {
  ndiNativeBridge,
  NDI_RUNTIME_DOWNLOAD_URL,
  NDI_TOOLS_DOWNLOAD_URL,
};
