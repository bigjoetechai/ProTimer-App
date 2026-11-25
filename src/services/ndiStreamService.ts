/**
 * NDI Network Broadcast Stream Service.
 * Supports:
 * 1. Independent per-list NDI activation (`activeByList[listId]`):
 *    - Clicking NDI on List 1 activates `ProTimer (List 1)` independently.
 *    - Clicking NDI on List 2 activates `ProTimer (List 2)` independently.
 *    - Renaming any list tab dynamically updates its NDI source name in the brackets: `ProTimer (<List Name>)`.
 * 2. Independent "NDI Multi" activation (`multiActive`):
 *    - Broadcasts multiple NDI displays simultaneously across all active list tabs
 *      (`ProTimer (List 1)`, `ProTimer (List 2)`, ..., plus `ProTimer (Multi Output)`).
 */

import {
  AppPreferences,
  DisplaySyncPayload,
  ListActiveCueSummary,
  formatListNdiSourceName,
  resolveBackgroundImageForList,
  resolveLogoImageForList,
} from '../types';
import { storageService } from './storageService';
import { resolveApiUrl } from '../utils/apiUrl';
import { displaySyncService } from './displaySyncService';
import { timerManagerService } from './timerManager';
import {
  COUNTDOWN_COLON_OFFSET_EM_STEP,
  COUNTDOWN_DIGIT_SPACING_EM_STEP,
  getTargetElements,
  getTargetExtras,
  resolveDisplayDigitColor,
  resolveFontFamily,
} from '../utilities/displayStyleHelper';
import { formatClock, formatDate, formatSeconds } from '../utilities/timeFormatters';

export interface NdiNativeDiagnostics {
  nativeNdiAvailable: boolean;
  nativeNdiSending: boolean;
  dllPath: string | null;
  ndiVersion: string | null;
  networkSourceFullName: string;
  hostname: string;
  connectedReceivers: number;
  mdnsActive: boolean;
  error: string | null;
  downloadUrl: string;
  toolsUrl: string;
  activeSources?: string[];
}

export interface NdiStreamStatus {
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
  receiversCount: number;
  frameCount: number;
  ips: string[];
  port: number;
  nativeNdi?: NdiNativeDiagnostics;
}

export type NdiStreamSubscriber = (status: NdiStreamStatus) => void;

export function parseNdiResolution(resLabel?: string): { width: number; height: number } {
  const raw = resLabel || 'HD - 1920 x 1080';
  const match = raw.match(/(\d+)\s*x\s*(\d+)/i);
  if (match) {
    return {
      width: Math.max(320, parseInt(match[1], 10) || 1920),
      height: Math.max(240, parseInt(match[2], 10) || 1080),
    };
  }
  return { width: 1920, height: 1080 };
}

class NdiStreamService {
  private activeByList: Record<string, boolean> = {};
  private multiActive = false;
  private lastKnownNamesSig = '';
  private subscribers: Set<NdiStreamSubscriber> = new Set();
  private canvas: HTMLCanvasElement | null = null;
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;
  private latestPayload: DisplaySyncPayload | null = null;
  private cachedImages: Map<string, HTMLImageElement> = new Map();
  private isSendingFrame = false;
  private activeFrameAbortController: AbortController | null = null;
  private receiversCount = 0;
  private frameCount = 0;
  private ips: string[] = [];
  private port = 3000;
  private nativeNdi: NdiNativeDiagnostics | undefined = undefined;

  private lastSyncedConfigSig = '';

  constructor() {
    if (typeof window !== 'undefined') {
      displaySyncService.subscribe((payload) => {
        this.latestPayload = payload;
        this.reconcileListsAndNames(payload);
        // NOTE: Do NOT call renderAndTransmitFrame() here!
        // displaySyncService fires at 20Hz while a cue is running; the dedicated
        // renderTimer handles frame rendering at a controlled, non-blocking rate.
      });

      window.addEventListener('protimer-prefs-updated', () => {
        if (this.isAnyStreamActive()) {
          this.syncConfigToServer(true);
          this.restartRenderLoop();
        }
        this.notifySubscribers();
      });

      this.fetchNetworkInfo();
    }
  }

  private isAnyStreamActive(): boolean {
    if (this.multiActive) return true;
    return Object.values(this.activeByList).some(Boolean);
  }

  private getCurrentLists(): Array<{ id: string; name: string }> {
    const all = timerManagerService.getAllLists();
    if (all && all.length > 0) {
      return all.map((l) => ({ id: l.id, name: l.name }));
    }
    if (this.latestPayload?.lists && this.latestPayload.lists.length > 0) {
      return this.latestPayload.lists;
    }
    return [{ id: 'list_1', name: 'List 1' }];
  }

  public reconcileLists(): void {
    this.reconcileListsAndNames();
  }

  private reconcileListsAndNames(payload?: DisplaySyncPayload | null): void {
    const liveLists = this.getCurrentLists();
    const lists =
      liveLists.length > 0
        ? liveLists
        : payload?.lists && payload.lists.length > 0
        ? payload.lists
        : [{ id: 'list_1', name: 'List 1' }];
    const validIds = new Set(lists.map((l) => l.id));

    let activeMapChanged = false;
    for (const listId of Object.keys(this.activeByList)) {
      if (!validIds.has(listId)) {
        delete this.activeByList[listId];
        activeMapChanged = true;
      }
    }

    const prefs = storageService.getPreferences();
    const sig = lists
      .map((l) => `${l.id}:${formatListNdiSourceName(l.name, prefs.ndiSourceName)}`)
      .join('|');

    if (sig !== this.lastKnownNamesSig || activeMapChanged) {
      const hadPrevSig = Boolean(this.lastKnownNamesSig);
      this.lastKnownNamesSig = sig;
      if (activeMapChanged) {
        // An active NDI list tab was deleted: properly reconcile timers & server senders
        // (including stopping NDI completely if no active list tabs remain).
        this.applyStreamStateChange();
      } else if (hadPrevSig) {
        if (this.isAnyStreamActive()) {
          this.syncConfigToServer();
        }
        this.notifySubscribers();
      }
    }
  }

  public isListActive(listId?: string): boolean {
    const id =
      listId ||
      this.latestPayload?.activeListId ||
      timerManagerService.getSnapshot().activeListId ||
      'list_1';
    return Boolean(this.activeByList[id]);
  }

  public isMultiActive(): boolean {
    return this.multiActive;
  }

  public async refreshDiagnostics(): Promise<void> {
    await this.fetchNetworkInfo();
  }

  private async fetchNetworkInfo(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch(resolveApiUrl('/api/lan/ndi/status'));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.ips)) this.ips = data.ips;
        if (typeof data.port === 'number') this.port = data.port;
        if (typeof data.receiversCount === 'number') this.receiversCount = data.receiversCount;
        if (typeof data.frameCount === 'number') this.frameCount = data.frameCount;
        if (data.nativeNdi && typeof data.nativeNdi === 'object') {
          this.nativeNdi = data.nativeNdi;
        }
        this.notifySubscribers();
      }
    } catch {
      // Ignore if offline
    }
  }

  public getStatus(forListId?: string): NdiStreamStatus {
    const prefs: AppPreferences = storageService.getPreferences();
    const resolution = prefs.ndiResolution || 'HD - 1920 x 1080';
    const { width, height } = parseNdiResolution(resolution);
    const frameRate = Number(prefs.ndiFrameRate) || 30;

    const lists = this.getCurrentLists();
    const activeListId =
      forListId ||
      this.latestPayload?.activeListId ||
      timerManagerService.getSnapshot().activeListId ||
      lists[0]?.id ||
      'list_1';
    const currentListObj = lists.find((l) => l.id === activeListId) || lists[0] || {
      id: activeListId,
      name: 'List 1',
    };

    const sourceNamesByList: Record<string, string> = {};
    const usedSourceCounts = new Map<string, number>();
    for (const l of lists) {
      const baseFormatted = formatListNdiSourceName(l.name, prefs.ndiSourceName);
      const key = baseFormatted.toLowerCase();
      const count = (usedSourceCounts.get(key) || 0) + 1;
      usedSourceCounts.set(key, count);
      // Disambiguate duplicate list tab names so each tab always gets its own independent NDI sender
      sourceNamesByList[l.id] =
        count === 1
          ? baseFormatted
          : formatListNdiSourceName(`${l.name} #${count}`, prefs.ndiSourceName);
    }
    if (!sourceNamesByList[activeListId]) {
      sourceNamesByList[activeListId] = formatListNdiSourceName(
        currentListObj.name,
        prefs.ndiSourceName
      );
    }

    const multiSourceName = formatListNdiSourceName('Multi Output', prefs.ndiSourceName);
    const currentListSourceName = sourceNamesByList[activeListId];

    const activeSourceNames: string[] = [];
    // 1. Add every individually activated list tab's NDI source name
    for (const l of lists) {
      if (this.activeByList[l.id] && sourceNamesByList[l.id]) {
        const sName = sourceNamesByList[l.id];
        if (!activeSourceNames.includes(sName)) {
          activeSourceNames.push(sName);
        }
      }
    }
    // 2. If NDI Multi is active, ensure every list tab's NDI source AND ProTimer (Multi Output) are included
    if (this.multiActive) {
      if (!activeSourceNames.includes(multiSourceName)) {
        activeSourceNames.unshift(multiSourceName);
      }
      for (const l of lists) {
        const sName = sourceNamesByList[l.id];
        if (sName && !activeSourceNames.includes(sName)) {
          activeSourceNames.push(sName);
        }
      }
    }

    const anySingleActive = Object.values(this.activeByList).some(Boolean);
    const overallActive = anySingleActive || this.multiActive;
    const mode: 'single' | 'multi' = this.multiActive ? 'multi' : 'single';

    // Ensure primary sourceName is always the active tab's source (if active), or Multi Output (if multiActive), or the first active list source
    const effectivePrimarySourceName = this.activeByList[activeListId]
      ? currentListSourceName
      : this.multiActive
      ? multiSourceName
      : activeSourceNames[0] || currentListSourceName;

    return {
      active: overallActive,
      mode,
      multiActive: this.multiActive,
      activeByList: { ...this.activeByList },
      sourceNamesByList,
      activeSourceNames,
      sourceName: effectivePrimarySourceName,
      multiSourceName,
      resolution,
      width,
      height,
      frameRate,
      alphaChannel: Boolean(prefs.ndiAlphaChannel),
      useCustomGroups: Boolean(prefs.ndiUseCustomGroups),
      customGroups: prefs.ndiCustomGroups || 'Public',
      receiversCount: this.receiversCount,
      frameCount: this.frameCount,
      ips:
        this.ips.length > 0
          ? this.ips
          : typeof window !== 'undefined'
          ? [window.location.hostname]
          : ['127.0.0.1'],
      port: this.port,
      nativeNdi: this.nativeNdi,
    };
  }

  public subscribe(cb: NdiStreamSubscriber): () => void {
    this.subscribers.add(cb);
    cb(this.getStatus());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  public notifySubscribers(): void {
    const status = this.getStatus();
    this.subscribers.forEach((cb) => {
      try {
        cb(status);
      } catch (e) {
        console.error('NDI stream subscriber error:', e);
      }
    });
  }

  /**
   * Toggle NDI for a specific Cue List tab (`requestedMode === 'single'`)
   * or toggle Multi-NDI across all Cue List tabs (`requestedMode === 'multi'`).
   */
  public toggleStream(
    requestedMode: 'single' | 'multi' = 'single',
    listId?: string
  ): boolean {
    if (requestedMode === 'multi') {
      this.multiActive = !this.multiActive;
      this.applyStreamStateChange();
      return this.multiActive;
    }

    const targetListId =
      listId ||
      this.latestPayload?.activeListId ||
      timerManagerService.getSnapshot().activeListId ||
      'list_1';
    const nextState = !this.activeByList[targetListId];
    if (nextState) {
      this.activeByList[targetListId] = true;
    } else {
      delete this.activeByList[targetListId];
    }

    this.applyStreamStateChange();
    return nextState;
  }

  public startStream(
    requestedMode: 'single' | 'multi' = 'single',
    listId?: string
  ): void {
    if (requestedMode === 'multi') {
      this.multiActive = true;
    } else {
      const targetListId =
        listId ||
        this.latestPayload?.activeListId ||
        timerManagerService.getSnapshot().activeListId ||
        'list_1';
      this.activeByList[targetListId] = true;
    }
    this.applyStreamStateChange();
  }

  public stopStream(listId?: string, stopAll = false): void {
    if (stopAll) {
      this.activeByList = {};
      this.multiActive = false;
    } else if (listId) {
      delete this.activeByList[listId];
    } else {
      const targetListId =
        this.latestPayload?.activeListId ||
        timerManagerService.getSnapshot().activeListId ||
        'list_1';
      delete this.activeByList[targetListId];
    }
    this.applyStreamStateChange();
  }

  private applyStreamStateChange(): void {
    // Abort any in-flight frame POST immediately so stale frames from a deactivated
    // list tab cannot race with the upcoming /api/lan/ndi/config update.
    if (this.activeFrameAbortController) {
      try {
        this.activeFrameAbortController.abort();
      } catch {
        // Ignore abort error
      }
      this.activeFrameAbortController = null;
      this.isSendingFrame = false;
    }

    const anyActive = this.isAnyStreamActive();
    if (anyActive) {
      this.syncConfigToServer(true);
      this.restartRenderLoop();
      this.startStatusPolling();
    } else {
      if (this.renderTimer) {
        clearInterval(this.renderTimer);
        this.renderTimer = null;
      }
      if (this.statusPollTimer) {
        clearInterval(this.statusPollTimer);
        this.statusPollTimer = null;
      }
      this.syncConfigToServer(true);
    }
    this.notifySubscribers();
  }

  private startStatusPolling(): void {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
    }
    this.statusPollTimer = setInterval(() => {
      if (!this.isAnyStreamActive()) return;
      this.fetchNetworkInfo();
    }, 3500);
  }

  public async syncConfigToServer(force = false): Promise<void> {
    if (typeof window === 'undefined') return;
    const status = this.getStatus();
    const configPayload = {
      active: status.active,
      mode: status.mode,
      multiActive: status.multiActive,
      activeByList: status.activeByList,
      sourceNamesByList: status.sourceNamesByList,
      activeSourceNames: status.activeSourceNames,
      sourceName: status.sourceName,
      multiSourceName: status.multiSourceName,
      resolution: status.resolution,
      width: status.width,
      height: status.height,
      frameRate: status.frameRate,
      alphaChannel: status.alphaChannel,
      useCustomGroups: status.useCustomGroups,
      customGroups: status.customGroups,
    };

    const sig = JSON.stringify(configPayload);
    if (!force && sig === this.lastSyncedConfigSig) {
      return;
    }
    this.lastSyncedConfigSig = sig;

    try {
      const res = await fetch(resolveApiUrl('/api/lan/ndi/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: sig,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ndiStream && typeof data.ndiStream.frameCount === 'number') {
          this.frameCount = data.ndiStream.frameCount;
        }
        if (data.nativeNdi && typeof data.nativeNdi === 'object') {
          this.nativeNdi = data.nativeNdi;
        }
      }
    } catch {
      // Ignore network error
    }
  }

  private restartRenderLoop(): void {
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (!this.isAnyStreamActive() || typeof window === 'undefined') return;

    // Schedule initial frame asynchronously so button click returns in 0ms
    setTimeout(() => {
      if (this.isAnyStreamActive()) {
        this.renderAndTransmitFrame();
      }
    }, 16);

    // 10 FPS (100ms) keeps all NDI countdown displays in tight real-time sync with Fullscreen/Console
    const intervalMs = 100;

    this.renderTimer = setInterval(() => {
      if (!this.isAnyStreamActive()) return;
      this.renderAndTransmitFrame();
    }, intervalMs);
  }

  private getImageElement(dataUrl: string): HTMLImageElement | null {
    if (!dataUrl || dataUrl === '__CACHED__') return null;
    const existing = this.cachedImages.get(dataUrl);
    if (existing) {
      return existing.complete && existing.naturalWidth > 0 ? existing : null;
    }
    if (this.cachedImages.size > 24) {
      this.cachedImages.clear();
    }
    const img = new Image();
    img.src = dataUrl;
    this.cachedImages.set(dataUrl, img);
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  private renderAndTransmitFrame(): void {
    if (!this.isAnyStreamActive() || typeof document === 'undefined') return;
    if (this.isSendingFrame) return;

    const status = this.getStatus();
    const prefs = storageService.getPreferences();
    const payload = this.latestPayload;

    // Always pull live per-list active/cued timer state directly from timerManagerService
    // so every list tab (List 1, List 2, etc.) counts down accurately in real time
    // regardless of which list tab is currently focused on the main console.
    const freshListCues = timerManagerService.getAllListsActiveCues();
    const listCueMap = new Map<string, ListActiveCueSummary>();
    if (payload?.listActiveCues) {
      for (const c of payload.listActiveCues) {
        listCueMap.set(c.listId, c);
      }
    }
    for (const c of freshListCues) {
      listCueMap.set(c.listId, c);
    }
    const resolvedListCues =
      freshListCues.length > 0 ? freshListCues : payload?.listActiveCues || [];

    const lists = this.getCurrentLists();
    const targetListIds = this.multiActive
      ? lists.map((l) => l.id)
      : Array.from(
          new Set([
            ...lists.filter((l) => this.activeByList[l.id]).map((l) => l.id),
            ...Object.keys(this.activeByList).filter((id) => this.activeByList[id]),
          ])
        );

    // Use a fast, crisp broadcast resolution (1280x720 for single stream, 960x540 when encoding multiple concurrent lists)
    const maxW = targetListIds.length > 1 || this.multiActive ? 960 : 1280;
    const scale = status.width > maxW ? maxW / status.width : 1;
    const cw = Math.round(status.width * scale);
    const ch = Math.round(status.height * scale);

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const isBlackout = Boolean(payload?.isBlackout);
    // In standalone Node.js mode (non-Electron), nativeImage isn't available on the server,
    // so attach raw RGBA pixels whenever the native NDI runtime DLL is loaded.
    const isElectronEnv =
      typeof window !== 'undefined' &&
      Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron);
    const includeRawRgba = !isElectronEnv && Boolean(this.nativeNdi?.nativeNdiAvailable);

    const perListFrames: Record<
      string,
      { sourceName: string; frameDataUrl: string; rawRgbaBase64?: string }
    > = {};

    for (const lid of targetListIds) {
      ctx.clearRect(0, 0, cw, ch);
      const cueSummary = listCueMap.get(lid);
      const listName =
        cueSummary?.listName || lists.find((l) => l.id === lid)?.name || 'List 1';
      const sourceName =
        status.sourceNamesByList[lid] || formatListNdiSourceName(listName, prefs.ndiSourceName);

      if (isBlackout) {
        if (!status.alphaChannel) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, cw, ch);
        }
      } else {
        this.drawSingleListFrame(
          ctx,
          cw,
          ch,
          lid,
          cueSummary,
          payload,
          prefs,
          status.alphaChannel
        );
      }

      const encoded = this.extractCanvasFrame(ctx, cw, ch, status.alphaChannel, includeRawRgba);
      if (encoded) {
        perListFrames[lid] = {
          sourceName,
          frameDataUrl: encoded.frameDataUrl,
          ...(encoded.rawRgbaBase64 ? { rawRgbaBase64: encoded.rawRgbaBase64 } : {}),
        };
      }
    }

    // Also render the primary / Multi frame
    let primaryFrame: { frameDataUrl: string; rawRgbaBase64?: string } | null = null;
    if (this.multiActive) {
      ctx.clearRect(0, 0, cw, ch);
      if (isBlackout) {
        if (!status.alphaChannel) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, cw, ch);
        }
      } else {
        this.drawMultiFrame(
          ctx,
          cw,
          ch,
          resolvedListCues,
          payload,
          prefs,
          status.alphaChannel
        );
      }
      primaryFrame = this.extractCanvasFrame(ctx, cw, ch, status.alphaChannel, includeRawRgba);
    } else {
      const activeLid =
        payload?.activeListId ||
        timerManagerService.getSnapshot().activeListId ||
        targetListIds[0];
      const chosen =
        (activeLid && perListFrames[activeLid]) ||
        (targetListIds[0] ? perListFrames[targetListIds[0]] : null);
      if (chosen) {
        primaryFrame = {
          frameDataUrl: chosen.frameDataUrl,
          ...(chosen.rawRgbaBase64 ? { rawRgbaBase64: chosen.rawRgbaBase64 } : {}),
        };
      }
    }

    if (primaryFrame || Object.keys(perListFrames).length > 0) {
      this.transmitEncodedFrames(cw, ch, status, primaryFrame, perListFrames);
    }
  }

  private uint8ArrayToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
    const chunkSize = 0x8000;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      chunks.push(String.fromCharCode.apply(null, sub as unknown as number[]));
    }
    return btoa(chunks.join(''));
  }

  private extractCanvasFrame(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    alphaChannel: boolean,
    includeRawRgba: boolean
  ): { frameDataUrl: string; rawRgbaBase64?: string } | null {
    if (!this.canvas) return null;
    // Fast hardware-accelerated JPEG when opaque (~2ms); PNG only when transparent alpha is explicitly enabled
    const mime = alphaChannel ? 'image/png' : 'image/jpeg';
    const frameDataUrl = this.canvas.toDataURL(mime, alphaChannel ? undefined : 0.85);
    let rawRgbaBase64: string | undefined;
    if (includeRawRgba) {
      try {
        const imgData = ctx.getImageData(0, 0, cw, ch);
        rawRgbaBase64 = this.uint8ArrayToBase64(imgData.data);
      } catch {
        // Ignore getImageData errors
      }
    }
    return rawRgbaBase64 ? { frameDataUrl, rawRgbaBase64 } : { frameDataUrl };
  }

  private drawSingleListFrame(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    listId: string,
    cueSummary: ListActiveCueSummary | undefined,
    payload: DisplaySyncPayload | null,
    prefs: AppPreferences,
    alphaChannel: boolean
  ): void {
    const fsElements = getTargetElements(prefs, 'fullscreen_ndi_preview');
    const fsExtras = getTargetExtras(prefs, 'fullscreen_ndi_preview');

    // Strictly isolate per-list state: only fall back to top-level payload if this listId IS the active payload list
    const canFallbackToPayload = Boolean(!cueSummary && payload && listId === payload.activeListId);
    const activeTimer = cueSummary
      ? cueSummary.activeTimer
      : canFallbackToPayload
      ? payload?.activeTimer || null
      : null;
    const secondsRemaining = cueSummary
      ? cueSummary.secondsRemaining
      : canFallbackToPayload
      ? payload?.secondsRemaining ?? 0
      : 0;
    const isOvertime = cueSummary
      ? cueSummary.isOvertime
      : canFallbackToPayload
      ? Boolean(payload?.isOvertime)
      : false;
    const status = cueSummary
      ? cueSummary.status
      : canFallbackToPayload
      ? payload?.status || 'idle'
      : 'idle';
    const activeAlertLevel = cueSummary
      ? cueSummary.activeAlertLevel
      : canFallbackToPayload
      ? payload?.activeAlertLevel || 'none'
      : 'none';
    const alertColor = cueSummary
      ? cueSummary.alertColor
      : canFallbackToPayload
      ? payload?.alertColor
      : undefined;
    const alertFlash = cueSummary
      ? Boolean(cueSummary.alertFlash)
      : canFallbackToPayload
      ? Boolean(payload?.alertFlash)
      : false;
    const alertOnOff = cueSummary
      ? cueSummary.alertOnOff
      : canFallbackToPayload
      ? Boolean(payload?.alertOnOff)
      : false;
    const progressPercent = cueSummary
      ? cueSummary.progressPercent
      : canFallbackToPayload
      ? payload?.progressPercent ?? 0
      : 0;
    const isClockMode = Boolean(payload?.isClockMode);
    const isDigitalClockCue = activeTimer?.type === 'digital_clock';
    const isEmptyCue = activeTimer?.type === 'empty';

    // 1. Background (transparent when alphaChannel is true)
    if (!alphaChannel) {
      ctx.fillStyle = fsExtras?.bgKeyColor || '#000000';
      ctx.fillRect(0, 0, cw, ch);

      const bgUrl =
        resolveBackgroundImageForList(prefs, listId) ||
        cueSummary?.backgroundImageUrl ||
        (listId === payload?.activeListId ? payload?.backgroundImageUrl : '') ||
        '';
      const bgImg = this.getImageElement(bgUrl);
      if (bgImg) {
        ctx.save();
        ctx.globalAlpha = Math.min(
          1,
          Math.max(0, (prefs.backgroundImageOpacity ?? 100) / 100)
        );
        ctx.drawImage(bgImg, 0, 0, cw, ch);
        ctx.restore();
      }
    }

    // 2. Per-List Logo
    const logoUrl =
      resolveLogoImageForList(prefs, listId) ||
      cueSummary?.logoImageUrl ||
      (listId === payload?.activeListId ? payload?.logoImageUrl : '') ||
      '';
    const logoImg = this.getImageElement(logoUrl);
    if (logoImg && fsElements.logo?.visible !== false) {
      const logoScale = Math.max(0.2, (fsElements.logo?.sizePercent ?? 20) / 20);
      const targetH = Math.round(ch * 0.065 * logoScale);
      const ratio = logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight);
      const targetW = Math.round(targetH * ratio);
      const loc = (fsElements.logo?.location || 'TopRight').toLowerCase();
      let lx = cw - targetW - Math.round(cw * 0.035);
      let ly = Math.round(ch * 0.035);
      if (loc.includes('left')) lx = Math.round(cw * 0.035);
      if (loc.includes('bottom')) ly = ch - targetH - Math.round(ch * 0.035);
      ctx.drawImage(logoImg, lx, ly, targetW, targetH);
    }

    // 3. Configure Shadow
    ctx.save();
    if (fsExtras?.enableShadow && !fsExtras?.shadowColorTransparent) {
      ctx.shadowColor = fsExtras.shadowColor || '#000000';
      ctx.shadowOffsetX = fsExtras.shadowXOffset ?? 5;
      ctx.shadowOffsetY = -(fsExtras.shadowYOffset ?? -5);
      ctx.shadowBlur = fsExtras.shadowBlur ?? 0;
    }

    // 4. Cue Name
    const nameCfg = fsElements.name;
    if (nameCfg?.visible !== false && !isClockMode) {
      const nameScale = Math.max(0.2, (nameCfg?.sizePercent ?? 33) / 33);
      const nameFontPx = Math.round(ch * 0.05 * nameScale);
      const nameFont = resolveFontFamily(nameCfg?.font);
      const isBold = (nameCfg?.fontStyle || '').toLowerCase().includes('bold');
      const isItalic = (nameCfg?.fontStyle || '').toLowerCase().includes('italic');
      ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : '600 '}${nameFontPx}px ${nameFont}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cueTitle = activeTimer?.name || 'STANDBY';
      const nameY =
        (nameCfg?.location || 'Bottom').toLowerCase() === 'top'
          ? Math.round(ch * 0.14)
          : Math.round(ch * 0.82);
      ctx.fillText(cueTitle, cw / 2, nameY);

      if (activeTimer?.endTime) {
        const endFontPx = Math.max(12, Math.round(nameFontPx * 0.42));
        ctx.font = `600 ${endFontPx}px ${nameFont}`;
        ctx.fillStyle = '#d4d4d8';
        ctx.fillText(
          `Ends at: ${activeTimer.endTime}`,
          cw / 2,
          nameY + Math.round(nameFontPx * 0.78)
        );
      }
    }

    // 5. Main Countdown / Clock Digits
    const countdownCfg = fsElements.countdown;
    if (countdownCfg?.visible !== false) {
      const countdownScale = Math.max(0.2, (countdownCfg?.sizePercent ?? 113) / 113);
      const digitFontPx = Math.round(ch * 0.25 * countdownScale);
      const digitFont = resolveFontFamily(countdownCfg?.font);
      const isBold = (countdownCfg?.fontStyle || 'Bold').toLowerCase().includes('bold');
      const isItalic = (countdownCfg?.fontStyle || '').toLowerCase().includes('italic');
      ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${digitFontPx}px ${digitFont}`;

      const formattedCountdown = formatSeconds(
        secondsRemaining,
        true,
        isOvertime,
        prefs
      );
      const formattedClock = formatClock(new Date(), undefined, prefs);
      const displayTime =
        isClockMode || isDigitalClockCue
          ? formattedClock
          : isEmptyCue
          ? '--:--:--'
          : isOvertime
          ? `+${formattedCountdown.replace(/^[+-]/, '')}`
          : formattedCountdown.replace(/^-/, '+');

      const digitColor =
        isClockMode || isDigitalClockCue
          ? '#ffffff'
          : resolveDisplayDigitColor({
              isOvertime,
              isPaused: status === 'paused',
              activeAlertLevel,
              alertColor,
              prefs,
            });

      const shouldBlinkOff = Boolean(alertOnOff && (status === 'running' || status === 'overtime'));
      const blinkVisible = !shouldBlinkOff || Math.floor(Date.now() / 500) % 2 === 0;
      const shouldPulse = Boolean(
        alertFlash && prefs.flashAlertsEnabled !== false && (status === 'running' || status === 'overtime')
      );

      if (blinkVisible) {
        const prevAlpha = ctx.globalAlpha;
        if (shouldPulse) {
          ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 260));
        }
        ctx.fillStyle = digitColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.drawSpacedCountdownText(
          ctx,
          displayTime,
          cw / 2,
          ch * 0.48,
          digitFontPx,
          fsElements.colon?.vert ?? 0,
          fsElements.countdown?.spacing ?? 0,
          fsElements.colon?.horiz ?? 0
        );
        ctx.globalAlpha = prevAlpha;
      }
    }

    // 6. Optional Clock & Date
    if (fsElements.clock?.visible && !isClockMode) {
      const clockScale = Math.max(0.2, (fsElements.clock?.sizePercent ?? 33) / 33);
      const clockPx = Math.round(ch * 0.042 * clockScale);
      ctx.font = `600 ${clockPx}px ${resolveFontFamily(fsElements.clock?.font)}`;
      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'right';
      ctx.fillText(formatClock(new Date(), undefined, prefs), cw - cw * 0.04, ch * 0.07);
    }
    if (fsElements.date?.visible) {
      const dateScale = Math.max(0.2, (fsElements.date?.sizePercent ?? 33) / 33);
      const datePx = Math.round(ch * 0.036 * dateScale);
      ctx.font = `500 ${datePx}px ${resolveFontFamily(fsElements.date?.font)}`;
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'left';
      ctx.fillText(
        payload?.dateFormatted || formatDate(new Date(), prefs),
        cw * 0.04,
        ch * 0.07
      );
    }

    ctx.restore();

    // 7. Progress Bar (matches NdiDisplay: elapsed progressPercent 0 -> 100%, full 100% in overtime)
    const showProgress = Boolean(prefs.showProgressBar || fsElements.progress_bar?.visible);
    if (showProgress && !isClockMode && !isDigitalClockCue) {
      const barH = Math.max(6, Math.round((prefs.progressBarHeightPx ?? 12) * (ch / 1080)));
      const barY =
        (fsElements.progress_bar?.location || 'Bottom').toLowerCase() === 'top'
          ? 0
          : ch - barH;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(0, barY, cw, barH);

      const pct = isOvertime
        ? 100
        : Math.min(100, Math.max(0, progressPercent));
      ctx.fillStyle =
        isOvertime || activeAlertLevel === 'danger'
          ? prefs.dangerDigitsColor || '#ef4444'
          : activeAlertLevel === 'warning'
          ? prefs.warningDigitsColor || '#eab308'
          : '#10b981';
      ctx.fillRect(0, barY, Math.round((cw * pct) / 100), barH);
    }

    // 8. Stage Message Overlay
    if (payload?.activeMessage && payload.activeMessage.visible && payload.activeMessage.text) {
      const msgH = Math.round(ch * 0.14);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.92)';
      ctx.fillRect(0, 0, cw, msgH);
      ctx.fillStyle = payload.activeMessage.color || '#f97316';
      const msgPx = Math.round(ch * 0.055);
      ctx.font = `bold ${msgPx}px ${resolveFontFamily(fsElements.message?.font)}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(payload.activeMessage.text, cw / 2, msgH / 2);
    }
  }

  private drawMultiFrame(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    listActiveCues: ListActiveCueSummary[],
    payload: DisplaySyncPayload | null,
    prefs: AppPreferences,
    alphaChannel: boolean
  ): void {
    if (!alphaChannel) {
      ctx.fillStyle = '#05070b';
      ctx.fillRect(0, 0, cw, ch);
    }

    const items: ListActiveCueSummary[] =
      listActiveCues && listActiveCues.length > 0
        ? listActiveCues
        : [
            {
              listId: payload?.activeListId || 'list_1',
              listName: payload?.activeListName || 'List 1',
              isCurrentOperatorList: true,
              activeTimer: payload?.activeTimer || null,
              nextTimer: payload?.nextTimer || null,
              status: payload?.status || 'idle',
              secondsRemaining: payload?.secondsRemaining ?? 0,
              totalDurationSeconds: payload?.totalDurationSeconds ?? 0,
              formattedTime: payload?.formattedTime || '00:00:00',
              isOvertime: Boolean(payload?.isOvertime),
              progressPercent: payload?.progressPercent ?? 0,
              alertColor: payload?.alertColor,
              alertFlash: Boolean(payload?.alertFlash),
              alertOnOff: Boolean(payload?.alertOnOff),
              activeAlertLevel: payload?.activeAlertLevel || 'none',
              totalCuesCount: 1,
              runningCuesCount: 0,
              backgroundImageUrl: payload?.backgroundImageUrl || '',
              logoImageUrl: payload?.logoImageUrl || '',
            },
          ];

    const count = items.length;
    const cols = count === 1 ? 1 : count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / cols);
    const pad = Math.round(cw * 0.015);
    const cellW = Math.floor((cw - pad * (cols + 1)) / cols);
    const cellH = Math.floor((ch - pad * (rows + 1)) / rows);

    items.forEach((item, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const x = pad + c * (cellW + pad);
      const y = pad + r * (cellH + pad);

      if (!alphaChannel) {
        ctx.fillStyle = '#0b0f17';
        ctx.fillRect(x, y, cellW, cellH);

        const listBg =
          resolveBackgroundImageForList(prefs, item.listId) || item.backgroundImageUrl || '';
        const bgImg = this.getImageElement(listBg);
        if (bgImg) {
          ctx.drawImage(bgImg, x, y, cellW, cellH);
        }
      }

      ctx.strokeStyle = item.isOvertime
        ? '#ef4444'
        : item.status === 'running'
        ? '#10b981'
        : '#1e293b';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, cellW, cellH);

      // List NDI Source Name Header (`ProTimer (<List Name>)`)
      const listNdiName = formatListNdiSourceName(item.listName, prefs.ndiSourceName);
      ctx.fillStyle = '#22d3ee';
      ctx.font = `bold ${Math.round(cellH * 0.068)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(listNdiName, x + 16, y + 14);

      // Cue Name
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${Math.round(cellH * 0.088)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        item.activeTimer?.name || 'STANDBY',
        x + cellW / 2,
        y + cellH * 0.32
      );

      // Time Digits
      const isDigitalClockCue = item.activeTimer?.type === 'digital_clock';
      const isEmptyCue = item.activeTimer?.type === 'empty';
      const formatted = formatSeconds(item.secondsRemaining, true, item.isOvertime, prefs);
      const displayTime =
        payload?.isClockMode || isDigitalClockCue
          ? formatClock(new Date(), undefined, prefs)
          : isEmptyCue
          ? '--:--:--'
          : item.isOvertime
          ? `+${formatted.replace(/^[+-]/, '')}`
          : formatted.replace(/^-/, '+');
      ctx.fillStyle = resolveDisplayDigitColor({
        isOvertime: item.isOvertime,
        isPaused: item.status === 'paused',
        activeAlertLevel: item.activeAlertLevel,
        alertColor: item.alertColor,
        prefs,
      });
      const mtElements = getTargetElements(prefs, 'multitimer');
      const mtCountdownFont = resolveFontFamily(mtElements.countdown?.font);
      const mtIsBold = (mtElements.countdown?.fontStyle || 'Bold').toLowerCase().includes('bold');
      const mtIsItalic = (mtElements.countdown?.fontStyle || '').toLowerCase().includes('italic');
      const tileFontPx = Math.round(cellH * 0.28);
      ctx.font = `${mtIsItalic ? 'italic ' : ''}${mtIsBold ? 'bold ' : ''}${tileFontPx}px ${mtCountdownFont}`;
      this.drawSpacedCountdownText(
        ctx,
        displayTime,
        x + cellW / 2,
        y + cellH * 0.64,
        tileFontPx,
        mtElements.colon?.vert ?? 0,
        mtElements.countdown?.spacing ?? 0,
        mtElements.colon?.horiz ?? 0
      );
    });

    if (payload?.activeMessage && payload.activeMessage.visible && payload.activeMessage.text) {
      const msgH = Math.round(ch * 0.12);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.92)';
      ctx.fillRect(0, 0, cw, msgH);
      ctx.fillStyle = payload.activeMessage.color || '#f97316';
      const msgPx = Math.round(ch * 0.05);
      ctx.font = `bold ${msgPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(payload.activeMessage.text, cw / 2, msgH / 2);
    }
  }

  private drawSpacedCountdownText(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    centerY: number,
    fontPx: number,
    colonVert: number,
    digitSpacing: number,
    colonHoriz: number
  ): void {
    if (!colonVert && !digitSpacing && !colonHoriz) {
      ctx.fillText(text, centerX, centerY);
      return;
    }

    const chars = Array.from(text);
    const digitGapPx = digitSpacing * COUNTDOWN_DIGIT_SPACING_EM_STEP * fontPx;
    const colonGapPx = colonHoriz * COUNTDOWN_DIGIT_SPACING_EM_STEP * fontPx;
    const colonOffsetYPx = -colonVert * COUNTDOWN_COLON_OFFSET_EM_STEP * fontPx;

    const widths = chars.map((ch) => ctx.measureText(ch).width);
    let totalWidth = 0;
    for (let i = 0; i < chars.length; i++) {
      const isColon = chars[i] === ':';
      if (isColon) totalWidth += colonGapPx;
      totalWidth += widths[i];
      if (i < chars.length - 1) {
        totalWidth += digitGapPx;
        if (isColon) totalWidth += colonGapPx;
      }
    }

    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    let cursorX = centerX - totalWidth / 2;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const isColon = ch === ':';
      if (isColon) {
        cursorX += colonGapPx;
      }
      ctx.fillText(ch, cursorX, centerY + (isColon ? colonOffsetYPx : 0));
      cursorX += widths[i];
      if (i < chars.length - 1) {
        cursorX += digitGapPx;
        if (isColon) {
          cursorX += colonGapPx;
        }
      }
    }

    ctx.textAlign = prevAlign;
  }

  private async transmitEncodedFrames(
    w: number,
    h: number,
    status: NdiStreamStatus,
    primaryFrame: { frameDataUrl: string; rawRgbaBase64?: string } | null,
    perListFrames: Record<
      string,
      { sourceName: string; frameDataUrl: string; rawRgbaBase64?: string }
    >
  ): Promise<void> {
    this.isSendingFrame = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.activeFrameAbortController = controller;
    const timeoutId = controller
      ? setTimeout(() => {
          controller.abort();
        }, 1500)
      : null;

    try {
      const res = await fetch(resolveApiUrl('/api/lan/ndi/frame'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller?.signal,
        body: JSON.stringify({
          frameDataUrl: primaryFrame?.frameDataUrl,
          rawRgbaBase64: primaryFrame?.rawRgbaBase64,
          sourceName: status.multiActive ? status.multiSourceName : status.sourceName,
          perListFrames,
          width: w,
          height: h,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.receiversCount === 'number') {
          this.receiversCount = data.receiversCount;
        }
        if (typeof data.frameCount === 'number') {
          this.frameCount = data.frameCount;
        }
      }
    } catch {
      // Ignore transient network errors or aborts
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (this.activeFrameAbortController === controller) {
        this.activeFrameAbortController = null;
      }
      this.isSendingFrame = false;
    }
  }
}

export const ndiStreamService = new NdiStreamService();
