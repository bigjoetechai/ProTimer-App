/**
 * NDI Network Broadcast Stream Service.
 * Activates and transmits the live NDI video stream in the background
 * using the Preferences -> NDI tab settings (Resolution, Framerate, Groups,
 * Source Name, and Transparent Alpha Channel) without popping out a window,
 * allowing any other computer on the network to capture the stream.
 */

import {
  AppPreferences,
  DisplaySyncPayload,
  resolveBackgroundImageForList,
  resolveLogoImageForList,
} from '../types';
import { storageService } from './storageService';
import { displaySyncService } from './displaySyncService';
import {
  getTargetElements,
  getTargetExtras,
  resolveDisplayDigitColor,
  resolveFontFamily,
} from '../utilities/displayStyleHelper';
import { formatClock, formatDate, formatSeconds } from '../utilities/timeFormatters';

export interface NdiStreamStatus {
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
  receiversCount: number;
  frameCount: number;
  ips: string[];
  port: number;
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
  private active = false;
  private mode: 'single' | 'multi' = 'single';
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

  constructor() {
    if (typeof window !== 'undefined') {
      displaySyncService.subscribe((payload) => {
        this.latestPayload = payload;
        if (this.active) {
          this.renderAndTransmitFrame();
        }
      });

      window.addEventListener('protimer-prefs-updated', () => {
        if (this.active) {
          this.syncConfigToServer(true);
          this.restartRenderLoop();
        }
        this.notifySubscribers();
      });

      this.fetchNetworkInfo();
    }
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
        this.notifySubscribers();
      }
    } catch {
      // Ignore if offline
    }
  }

  public getStatus(): NdiStreamStatus {
    const prefs: AppPreferences = storageService.getPreferences();
    const resolution = prefs.ndiResolution || 'HD - 1920 x 1080';
    const { width, height } = parseNdiResolution(resolution);
    const frameRate = Number(prefs.ndiFrameRate) || 30;
    const baseSourceName = prefs.ndiSourceName || 'ProTimer (Main Output)';
    const sourceName =
      this.mode === 'multi' && !baseSourceName.toLowerCase().includes('multi')
        ? `${baseSourceName} [Multi]`
        : baseSourceName;

    return {
      active: this.active,
      mode: this.mode,
      sourceName,
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
    };
  }

  public subscribe(cb: NdiStreamSubscriber): () => void {
    this.subscribers.add(cb);
    cb(this.getStatus());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers(): void {
    const status = this.getStatus();
    this.subscribers.forEach((cb) => {
      try {
        cb(status);
      } catch (e) {
        console.error('NDI stream subscriber error:', e);
      }
    });
  }

  public toggleStream(requestedMode: 'single' | 'multi' = 'single'): boolean {
    if (this.active && this.mode === requestedMode) {
      this.stopStream();
      return false;
    }
    this.startStream(requestedMode);
    return true;
  }

  public startStream(requestedMode: 'single' | 'multi' = 'single'): void {
    this.active = true;
    this.mode = requestedMode;
    this.syncConfigToServer(true);
    this.restartRenderLoop();
    this.startStatusPolling();
    this.notifySubscribers();
  }

  public stopStream(): void {
    this.active = false;
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
    this.syncConfigToServer(false);
    this.notifySubscribers();
  }

  private startStatusPolling(): void {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
    }
    this.statusPollTimer = setInterval(() => {
      if (!this.active) return;
      this.fetchNetworkInfo();
    }, 2500);
  }

  private async syncConfigToServer(active: boolean): Promise<void> {
    if (typeof window === 'undefined') return;
    const status = this.getStatus();
    try {
      const res = await fetch('/api/lan/ndi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active,
          mode: status.mode,
          sourceName: status.sourceName,
          resolution: status.resolution,
          width: status.width,
          height: status.height,
          frameRate: status.frameRate,
          alphaChannel: status.alphaChannel,
          useCustomGroups: status.useCustomGroups,
          customGroups: status.customGroups,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ndiStream && typeof data.ndiStream.frameCount === 'number') {
          this.frameCount = data.ndiStream.frameCount;
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
    if (!this.active || typeof window === 'undefined') return;

    // Render immediately
    this.renderAndTransmitFrame();

    // Stream frames over network at a responsive cadence derived from configured FPS
    const status = this.getStatus();
    const targetFps = Math.min(30, Math.max(1, Number(status.frameRate) || 30));
    const intervalMs = Math.max(120, Math.round(1000 / Math.min(targetFps, 8)));

    this.renderTimer = setInterval(() => {
      if (!this.active) return;
      this.renderAndTransmitFrame();
    }, intervalMs);
  }

  private getImageElement(dataUrl: string): HTMLImageElement | null {
    if (!dataUrl) return null;
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
    if (!this.active || typeof document === 'undefined' || !this.latestPayload) return;

    const status = this.getStatus();
    const prefs = storageService.getPreferences();
    const payload = this.latestPayload;

    // Offscreen canvas sized to NDI resolution aspect ratio (capped at 1920x1080 for fast network transmission)
    const scale = status.width > 1920 ? 1920 / status.width : 1;
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

    ctx.clearRect(0, 0, cw, ch);

    if (payload.isBlackout) {
      if (!status.alphaChannel) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, cw, ch);
      }
      this.transmitCanvas(status.alphaChannel);
      return;
    }

    if (this.mode === 'multi') {
      this.drawMultiFrame(ctx, cw, ch, payload, prefs, status.alphaChannel);
    } else {
      this.drawSingleFrame(ctx, cw, ch, payload, prefs, status.alphaChannel);
    }

    this.transmitCanvas(status.alphaChannel);
  }

  private drawSingleFrame(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    payload: DisplaySyncPayload,
    prefs: AppPreferences,
    alphaChannel: boolean
  ): void {
    const fsElements = getTargetElements(prefs, 'fullscreen_ndi_preview');
    const fsExtras = getTargetExtras(prefs, 'fullscreen_ndi_preview');
    const activeListId = payload.activeListId || 'list_1';

    // 1. Background (transparent when alphaChannel is true)
    if (!alphaChannel) {
      ctx.fillStyle = fsExtras?.bgKeyColor || '#000000';
      ctx.fillRect(0, 0, cw, ch);

      const bgUrl =
        resolveBackgroundImageForList(prefs, activeListId) || payload.backgroundImageUrl || '';
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
    const logoUrl = resolveLogoImageForList(prefs, activeListId) || payload.logoImageUrl || '';
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
      const cueTitle = payload.activeTimer?.name || 'STANDBY';
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

      const isOvertime = payload.isOvertime;
      const formattedCountdown = formatSeconds(
        payload.secondsRemaining,
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
            isPaused: payload.status === 'paused',
            activeAlertLevel: payload.activeAlertLevel,
            alertColor: payload.alertColor,
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

      const pct = payload.isOvertime
        ? 100
        : Math.min(100, Math.max(0, 100 - payload.progressPercent));
      ctx.fillStyle =
        payload.isOvertime || payload.activeAlertLevel === 'danger'
          ? prefs.dangerDigitsColor || '#ef4444'
          : payload.activeAlertLevel === 'warning'
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
              listName: 'Active List',
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

      // List Name
      ctx.fillStyle = '#94a3b8';
      ctx.font = `bold ${Math.round(cellH * 0.075)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(item.listName.toUpperCase(), x + 16, y + 14);

      // Cue Name
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${Math.round(cellH * 0.09)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        item.activeTimer?.name || 'STANDBY',
        x + cellW / 2,
        y + cellH * 0.3
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
      ctx.fillText(displayTime, x + cellW / 2, y + cellH * 0.62);
    });
  }

  private async transmitCanvas(alphaChannel: boolean): Promise<void> {
    if (!this.canvas || this.isSendingFrame) return;
    this.isSendingFrame = true;
    try {
      // Use PNG when alphaChannel is enabled to preserve full RGBA transparency;
      // use high-speed JPEG/WebP when opaque for ultra-low network latency
      const mime = alphaChannel ? 'image/png' : 'image/jpeg';
      const frameDataUrl = this.canvas.toDataURL(mime, alphaChannel ? undefined : 0.85);
      const res = await fetch('/api/lan/ndi/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameDataUrl }),
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
