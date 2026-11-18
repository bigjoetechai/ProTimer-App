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
import { displaySyncService } from './displaySyncService';
import { timerManagerService } from './timerManager';
import {
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
    if (this.latestPayload?.lists && this.latestPayload.lists.length > 0) {
      return this.latestPayload.lists;
    }
    const all = timerManagerService.getAllLists();
    if (all && all.length > 0) {
      return all.map((l) => ({ id: l.id, name: l.name }));
    }
    return [{ id: 'list_1', name: 'List 1' }];
  }

  private reconcileListsAndNames(payload?: DisplaySyncPayload | null): void {
    const lists =
      payload?.lists && payload.lists.length > 0 ? payload.lists : this.getCurrentLists();
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
      if (hadPrevSig) {
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
      const res = await fetch('/api/lan/ndi/status');
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
    for (const l of lists) {
      sourceNamesByList[l.id] = formatListNdiSourceName(l.name, prefs.ndiSourceName);
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
      const res = await fetch('/api/lan/ndi/config', {
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

    // 4 FPS (250ms) is crisp for digital countdown timers and keeps CPU usage minimal
    const intervalMs = 250;

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
    if (!this.isAnyStreamActive() || typeof document === 'undefined' || !this.latestPayload) return;
    if (this.isSendingFrame) return;

    const status = this.getStatus();
    const prefs = storageService.getPreferences();
    const payload = this.latestPayload;

    const lists = this.getCurrentLists();
    const targetListIds = this.multiActive
      ? lists.map((l) => l.id)
      : lists.filter((l) => this.activeByList[l.id]).map((l) => l.id);

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

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const listCueMap = new Map<string, ListActiveCueSummary>(
      (payload.listActiveCues || []).map((c) => [c.listId, c])
    );

    const perListFrames: Record<
      string,
      { sourceName: string; frameDataUrl: string }
    > = {};

    for (const lid of targetListIds) {
      ctx.clearRect(0, 0, cw, ch);
      const cueSummary = listCueMap.get(lid);
      const listName =
        cueSummary?.listName || lists.find((l) => l.id === lid)?.name || 'List 1';
      const sourceName =
        status.sourceNamesByList[lid] || formatListNdiSourceName(listName, prefs.ndiSourceName);

      if (payload.isBlackout) {
        if (!status.alphaChannel) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, cw, ch);
        }
      } else {
        this.drawSingleListFrame(ctx, cw, ch, lid, cueSummary, payload, prefs, status.alphaChannel);
      }

      const encoded = this.extractCanvasFrame(status.alphaChannel);
      if (encoded) {
        perListFrames[lid] = {
          sourceName,
          frameDataUrl: encoded.frameDataUrl,
        };
      }
    }

    // Also render the primary / Multi frame
    let primaryFrame: { frameDataUrl: string } | null = null;
    if (this.multiActive) {
      ctx.clearRect(0, 0, cw, ch);
      if (payload.isBlackout) {
        if (!status.alphaChannel) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, cw, ch);
        }
      } else {
        this.drawMultiFrame(ctx, cw, ch, payload, prefs, status.alphaChannel);
      }
      primaryFrame = this.extractCanvasFrame(status.alphaChannel);
    } else {
      const activeLid = payload.activeListId || targetListIds[0];
      const chosen =
        (activeLid && perListFrames[activeLid]) ||
        (targetListIds[0] ? perListFrames[targetListIds[0]] : null);
      if (chosen) {
        primaryFrame = {
          frameDataUrl: chosen.frameDataUrl,
        };
      }
    }

    if (primaryFrame || Object.keys(perListFrames).length > 0) {
      this.transmitEncodedFrames(cw, ch, status, primaryFrame, perListFrames);
    }
  }

  private extractCanvasFrame(
    alphaChannel: boolean
  ): { frameDataUrl: string } | null {
    if (!this.canvas) return null;
    // Fast hardware-accelerated JPEG when opaque (~2ms); PNG only when transparent alpha is explicitly enabled
    const mime = alphaChannel ? 'image/png' : 'image/jpeg';
    const frameDataUrl = this.canvas.toDataURL(mime, alphaChannel ? undefined : 0.8);
    return { frameDataUrl };
  }

  private drawSingleListFrame(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    listId: string,
    cueSummary: ListActiveCueSummary | undefined,
    payload: DisplaySyncPayload,
    prefs: AppPreferences,
    alphaChannel: boolean
  ): void {
    const fsElements = getTargetElements(prefs, 'fullscreen_ndi_preview');
    const fsExtras = getTargetExtras(prefs, 'fullscreen_ndi_preview');

    const activeTimer = cueSummary ? cueSummary.activeTimer : payload.activeTimer;
    const secondsRemaining = cueSummary ? cueSummary.secondsRemaining : payload.secondsRemaining;
    const isOvertime = cueSummary ? cueSummary.isOvertime : payload.isOvertime;
    const status = cueSummary ? cueSummary.status : payload.status;
    const activeAlertLevel = cueSummary ? cueSummary.activeAlertLevel : payload.activeAlertLevel;
    const alertColor = cueSummary ? cueSummary.alertColor : payload.alertColor;
    const progressPercent = cueSummary ? cueSummary.progressPercent : payload.progressPercent;

    // 1. Background (transparent when alphaChannel is true)
    if (!alphaChannel) {
      ctx.fillStyle = fsExtras?.bgKeyColor || '#000000';
      ctx.fillRect(0, 0, cw, ch);

      const bgUrl =
        resolveBackgroundImageForList(prefs, listId) ||
        cueSummary?.backgroundImageUrl ||
        (listId === payload.activeListId ? payload.backgroundImageUrl : '') ||
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
      (listId === payload.activeListId ? payload.logoImageUrl : '') ||
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
    if (nameCfg?.visible !== false && !payload.isClockMode) {
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
      const displayTime = payload.isClockMode
        ? formattedClock
        : isOvertime
        ? `+${formattedCountdown.replace(/^[+-]/, '')}`
        : formattedCountdown.replace(/^-/, '+');

      const digitColor = payload.isClockMode
        ? '#ffffff'
        : resolveDisplayDigitColor({
            isOvertime,
            isPaused: status === 'paused',
            activeAlertLevel,
            alertColor,
            prefs,
          });

      ctx.fillStyle = digitColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayTime, cw / 2, ch * 0.48);
    }

    // 6. Optional Clock & Date
    if (fsElements.clock?.visible && !payload.isClockMode) {
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
        payload.dateFormatted || formatDate(new Date(), prefs),
        cw * 0.04,
        ch * 0.07
      );
    }

    ctx.restore();

    // 7. Progress Bar
    const showProgress = Boolean(prefs.showProgressBar || fsElements.progress_bar?.visible);
    if (showProgress && !payload.isClockMode) {
      const barH = Math.max(6, Math.round((prefs.progressBarHeightPx ?? 12) * (ch / 1080)));
      const barY =
        (fsElements.progress_bar?.location || 'Bottom').toLowerCase() === 'top'
          ? 0
          : ch - barH;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(0, barY, cw, barH);

      const pct = isOvertime
        ? 100
        : Math.min(100, Math.max(0, 100 - progressPercent));
      ctx.fillStyle =
        isOvertime || activeAlertLevel === 'danger'
          ? prefs.dangerDigitsColor || '#ef4444'
          : activeAlertLevel === 'warning'
          ? prefs.warningDigitsColor || '#eab308'
          : '#10b981';
      ctx.fillRect(0, barY, Math.round((cw * pct) / 100), barH);
    }

    // 8. Stage Message Overlay
    if (payload.activeMessage && payload.activeMessage.visible && payload.activeMessage.text) {
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
    payload: DisplaySyncPayload,
    prefs: AppPreferences,
    alphaChannel: boolean
  ): void {
    if (!alphaChannel) {
      ctx.fillStyle = '#05070b';
      ctx.fillRect(0, 0, cw, ch);
    }

    const items =
      payload.listActiveCues && payload.listActiveCues.length > 0
        ? payload.listActiveCues
        : [
            {
              listId: payload.activeListId || 'list_1',
              listName: payload.activeListName || 'List 1',
              isCurrentOperatorList: true,
              activeTimer: payload.activeTimer,
              nextTimer: payload.nextTimer,
              status: payload.status,
              secondsRemaining: payload.secondsRemaining,
              totalDurationSeconds: payload.totalDurationSeconds,
              formattedTime: payload.formattedTime,
              isOvertime: payload.isOvertime,
              progressPercent: payload.progressPercent,
              alertColor: payload.alertColor,
              alertFlash: payload.alertFlash,
              alertOnOff: payload.alertOnOff,
              activeAlertLevel: payload.activeAlertLevel,
              totalCuesCount: 1,
              runningCuesCount: 0,
              backgroundImageUrl: payload.backgroundImageUrl,
              logoImageUrl: payload.logoImageUrl,
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
      const formatted = formatSeconds(item.secondsRemaining, true, item.isOvertime, prefs);
      const displayTime = item.isOvertime
        ? `+${formatted.replace(/^[+-]/, '')}`
        : formatted.replace(/^-/, '+');
      ctx.fillStyle = resolveDisplayDigitColor({
        isOvertime: item.isOvertime,
        isPaused: item.status === 'paused',
        activeAlertLevel: item.activeAlertLevel,
        alertColor: item.alertColor,
        prefs,
      });
      ctx.font = `bold ${Math.round(cellH * 0.28)}px monospace`;
      ctx.fillText(displayTime, x + cellW / 2, y + cellH * 0.64);
    });

    if (payload.activeMessage && payload.activeMessage.visible && payload.activeMessage.text) {
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
    try {
      const res = await fetch('/api/lan/ndi/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      // Ignore transient network errors
    } finally {
      this.isSendingFrame = false;
    }
  }
}

export const ndiStreamService = new NdiStreamService();
