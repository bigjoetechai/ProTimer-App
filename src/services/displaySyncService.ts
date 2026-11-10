/**
 * Display Synchronization & LAN Service.
 * Coordinates real-time state synchronization between the Main Console
 * and secondary displays (Presenter, Preview, Stage, Fullscreen, NDI, LAN).
 * Operates across:
 * 1. Same-device windows via CrossWindowBus (BroadcastChannel)
 * 2. Cross-device LAN networks via /api/lan (SSE & HTTP API)
 */

import {
  DisplaySyncPayload,
  DisplayTarget,
  StageMessage,
  TimerItem,
  TimerStatus,
  resolveBackgroundImageForList,
  resolveLogoImageForList,
} from '../types';
import { CrossWindowBus } from '../utilities/broadcast';
import { formatSeconds, formatClock, formatDate } from '../utilities/timeFormatters';
import { timerManagerService, computeActiveAlert } from './timerManager';
import { storageService } from './storageService';
import { generateId } from '../utilities/idGenerator';

export type DisplaySyncListener = (payload: DisplaySyncPayload) => void;

class DisplaySyncService {
  private bus: CrossWindowBus;
  private isMaster: boolean = true;
  private isBlackout: boolean = false;
  private isClockMode: boolean = false;
  private activeMessage: StageMessage | null = null;
  private listeners: Set<DisplaySyncListener> = new Set();
  private lastPayload: DisplaySyncPayload | null = null;
  private masterPollInterval: any = null;
  private clientEventSource: EventSource | null = null;
  private clientPollInterval: any = null;

  constructor() {
    this.bus = new CrossWindowBus('protimer_sync_v1');
    // Seed initial payload immediately from timerManagerService
    const initialSnap = timerManagerService.getSnapshot();
    this.lastPayload = this.buildPayload(initialSnap.status, initialSnap.currentSeconds);
    this.setupListeners();
    this.startMasterPolling();
  }

  public initAsClient(): void {
    this.isMaster = false;
    if (this.masterPollInterval) {
      clearInterval(this.masterPollInterval);
      this.masterPollInterval = null;
    }
    // Seed local state immediately and request fresh sync frame from Master window
    const snap = timerManagerService.getSnapshot();
    this.lastPayload = this.buildPayload(snap.status, snap.currentSeconds);
    this.notifyListeners(this.lastPayload);
    this.bus.post('REQUEST_SYNC', { timestamp: Date.now() });
    this.setupClientLanSync();
  }

  private setupListeners() {
    // Listen for broadcast frames from Master (same-device windowing)
    this.bus.subscribe<DisplaySyncPayload>('SYNC_FRAME', (envelope) => {
      this.lastPayload = envelope.payload;
      this.notifyListeners(envelope.payload);
    });

    // Listen for sync requests from newly opened Preview / Secondary windows
    this.bus.subscribe('REQUEST_SYNC', () => {
      if (this.isMaster) {
        const snap = timerManagerService.getSnapshot();
        this.broadcastCurrentState(snap.status, snap.currentSeconds);
      }
    });

    // Listen for remote control commands (same-device)
    this.bus.subscribe<{ command: string; payload?: unknown }>('COMMAND', (envelope) => {
      if (this.isMaster) {
        this.handleRemoteCommand(envelope.payload.command, envelope.payload.payload);
      }
    });

    // Master ticks and publishes state
    timerManagerService.subscribe((snapshot) => {
      if (this.isMaster) {
        this.broadcastCurrentState(snapshot.status, snapshot.currentSeconds);
      }
    });

    // Auto-blackout end action listener
    timerManagerService.onBlackout((blackout) => {
      if (this.isMaster) {
        this.setBlackout(blackout);
      }
    });

    // Immediately broadcast updated background images / style preferences when saved
    if (typeof window !== 'undefined') {
      window.addEventListener('protimer-prefs-updated', () => {
        if (this.isMaster) {
          this.notifyPreferencesUpdated();
        } else if (this.lastPayload) {
          const prefs = storageService.getPreferences();
          const activeListId = this.lastPayload.activeListId || timerManagerService.getSnapshot().activeListId;
          const updatedPayload: DisplaySyncPayload = {
            ...this.lastPayload,
            formattedTime: formatSeconds(
              this.lastPayload.secondsRemaining,
              true,
              this.lastPayload.isOvertime,
              prefs
            ),
            clockTimeFormatted: formatClock(new Date(), undefined, prefs),
            dateFormatted: formatDate(new Date(), prefs),
            backgroundImageUrl: resolveBackgroundImageForList(prefs, activeListId),
            backgroundFit: prefs.backgroundFit || 'cover',
            backgroundImageOpacity: prefs.backgroundImageOpacity ?? 100,
            logoImageUrl: resolveLogoImageForList(prefs, activeListId),
            preferences: prefs,
            listActiveCues: this.lastPayload.listActiveCues?.map((item) => ({
              ...item,
              formattedTime: formatSeconds(item.secondsRemaining, true, item.isOvertime, prefs),
              backgroundImageUrl: resolveBackgroundImageForList(prefs, item.listId),
              logoImageUrl: resolveLogoImageForList(prefs, item.listId),
            })),
          };
          this.lastPayload = updatedPayload;
          this.notifyListeners(updatedPayload);
        }
      });
    }
  }

  /**
   * Start polling for incoming LAN commands sent by remote tablets/phones.
   */
  private startMasterPolling() {
    if (typeof window === 'undefined') return;

    this.masterPollInterval = setInterval(async () => {
      if (!this.isMaster) return;
      try {
        const res = await fetch('/api/lan/commands');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.commands) && data.commands.length > 0) {
            for (const cmd of data.commands) {
              this.handleRemoteCommand(cmd.command, cmd.payload);
            }
          }
        }
      } catch {
        // Silently ignore if offline or in preview
      }
    }, 300);
  }

  /**
   * Client-side LAN synchronization for devices on the local network.
   */
  private setupClientLanSync() {
    if (typeof window === 'undefined') return;

    // 1. Try Server-Sent Events (SSE) for low latency
    const connectSse = () => {
      try {
        if (this.clientEventSource) {
          this.clientEventSource.close();
        }
        this.clientEventSource = new EventSource('/api/lan/stream');

        this.clientEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.state) {
              this.lastPayload = data.state;
              this.notifyListeners(data.state);
            }
          } catch (e) {
            console.error('SSE parse error:', e);
          }
        };

        this.clientEventSource.onerror = () => {
          // SSE failed or reconnecting, fallback to polling
        };
      } catch {
        // SSE not supported or blocked
      }
    };

    connectSse();

    // 2. Continuous fallback polling
    const fetchState = async () => {
      try {
        const res = await fetch('/api/lan/state');
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            this.lastPayload = data.state;
            this.notifyListeners(data.state);
          }
        }
      } catch {
        // Ignore network drops
      }
    };

    fetchState();
    this.clientPollInterval = setInterval(fetchState, 500);
  }

  private handleRemoteCommand(command: string, payload?: unknown) {
    const cmdUpper = String(command).toUpperCase();
    const p = payload as any;

    switch (cmdUpper) {
      case 'START':
        if (p?.timerId) {
          timerManagerService.start(p.timerId);
        } else {
          timerManagerService.start();
        }
        break;
      case 'PAUSE':
        timerManagerService.pause(p?.timerId);
        break;
      case 'STOP':
        timerManagerService.stop(p?.timerId);
        break;
      case 'RESTART':
        timerManagerService.restart(p?.timerId);
        break;
      case 'SELECT_TIMER':
        if (p?.timerId) {
          timerManagerService.cue(p.timerId);
        }
        break;
      case 'ADJUST_DURATION':
        if (typeof p?.secondsDelta === 'number') {
          timerManagerService.adjustDuration(p.secondsDelta);
        } else if (typeof p === 'number') {
          timerManagerService.adjustDuration(p);
        }
        break;
      case 'MOVE_NEXT':
      case 'CUE_NEXT':
        timerManagerService.moveNextCue();
        break;
      case 'MOVE_PREV':
      case 'CUE_PREV':
        timerManagerService.movePrevCue();
        break;
      case 'TOGGLE_BLACKOUT':
        this.toggleBlackout();
        break;
      case 'TOGGLE_CLOCK':
        this.toggleClockMode();
        break;
      case 'SET_MESSAGE':
        if (p) {
          this.setMessage(typeof p === 'string' ? { text: p } : (p as StageMessage));
        }
        break;
      case 'CLEAR_MESSAGE':
        this.clearMessage();
        break;
    }
  }

  private buildPayload(status: TimerStatus, currentSeconds: number): DisplaySyncPayload {
    const snap = timerManagerService.getSnapshot();
    const activeListId = snap.activeListId;
    const runningOrActiveTimer = timerManagerService.getActiveTimer();
    const cuedTimer = timerManagerService.getCuedTimer();
    const displayTarget = runningOrActiveTimer || cuedTimer;
    const nextTimer = timerManagerService.getNextTimer();
    const isOvertime = status === 'overtime' || currentSeconds < 0;

    const alertInfo = computeActiveAlert(displayTarget, currentSeconds, status);
    const activeAlertLevel: 'none' | 'warning' | 'danger' = 
      alertInfo.level === 'alert2' || alertInfo.level === 'overtime'
        ? 'danger'
        : (alertInfo.level === 'alert1' ? 'warning' : 'none');
    const alertColor = alertInfo.color;
    const alertFlash = alertInfo.flash;
    const alertOnOff = alertInfo.onOff;

    const totalDur = displayTarget?.durationSeconds || 1;
    const progressPercent = runningOrActiveTimer
      ? Math.min(100, Math.max(0, ((totalDur - currentSeconds) / totalDur) * 100))
      : 0;

    // Get active rundown timers for remote selection
    const allActiveTimers = timerManagerService.getActiveListTimers();
    const timerList = allActiveTimers.map((t) => ({
      id: t.id,
      name: t.name,
      durationFormatted: formatSeconds(t.durationSeconds, true),
      status: t.status || 'idle',
      isCued: t.id === snap.cuedTimerId,
    }));

    // Get active cues across all Cue List tabs for independent Multi FS display
    const listActiveCues = timerManagerService.getAllListsActiveCues();

    // Resolve background and logo image for the active list
    const prefs = storageService.getPreferences();
    const backgroundImageUrl = resolveBackgroundImageForList(prefs, activeListId);
    const logoImageUrl = resolveLogoImageForList(prefs, activeListId);

    return {
      activeListId,
      activeTimer: displayTarget,
      nextTimer,
      status,
      formattedTime: formatSeconds(currentSeconds, true, isOvertime, prefs),
      secondsRemaining: currentSeconds,
      totalDurationSeconds: totalDur,
      progressPercent,
      isOvertime,
      overtimeFormatted: isOvertime ? formatSeconds(Math.abs(currentSeconds), true, true, prefs) : '00:00:00',
      activeAlertLevel,
      alertColor,
      alertFlash,
      alertOnOff,
      activeMessage: this.activeMessage?.visible ? this.activeMessage : null,
      clockTimeFormatted: formatClock(new Date(), undefined, prefs),
      dateFormatted: formatDate(new Date(), prefs),
      isBlackout: this.isBlackout,
      isClockMode: this.isClockMode,
      speed: snap.speed,
      timestamp: Date.now(),
      backgroundImageUrl,
      backgroundFit: prefs.backgroundFit || 'cover',
      backgroundImageOpacity: prefs.backgroundImageOpacity ?? 100,
      logoImageUrl,
      preferences: prefs,
      timerList,
      listActiveCues,
    };
  }

  public notifyPreferencesUpdated(): void {
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds);
  }

  public broadcastCurrentState(status: TimerStatus, currentSeconds: number) {
    const payload = this.buildPayload(status, currentSeconds);
    const allActiveTimers = timerManagerService.getActiveListTimers();

    this.lastPayload = payload;
    this.bus.post('SYNC_FRAME', payload);
    this.notifyListeners(payload);

    // Push lightweight state to LAN API for remote smartphones & tablets
    if (this.isMaster && typeof window !== 'undefined') {
      const lanPrefs = payload.preferences
        ? {
            ...payload.preferences,
            backgroundImageDataUrl: '',
            logoImageDataUrl: '',
            listBackgroundImages: {},
            listLogoImages: {},
          }
        : undefined;
      const lanPayload: DisplaySyncPayload = {
        ...payload,
        backgroundImageUrl: undefined,
        logoImageUrl: undefined,
        preferences: lanPrefs,
        listActiveCues: payload.listActiveCues?.map((item) => ({
          ...item,
          backgroundImageUrl: undefined,
          logoImageUrl: undefined,
        })),
      };
      fetch('/api/lan/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: lanPayload, timers: allActiveTimers }),
      }).catch(() => {});
    }
  }

  // --- DISPLAY TOGGLES ---

  public toggleBlackout(): void {
    this.isBlackout = !this.isBlackout;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds);
  }

  public setBlackout(blackout: boolean): void {
    this.isBlackout = blackout;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds);
  }

  public toggleClockMode(): void {
    this.isClockMode = !this.isClockMode;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds);
  }

  public setMessage(msg: Partial<StageMessage>): void {
    this.activeMessage = {
      id: generateId('msg'),
      text: msg.text || '',
      visible: true,
      flash: msg.flash ?? false,
      urgent: msg.urgent ?? false,
      color: msg.color || '#f97316',
      createdAt: Date.now(),
      ...msg,
    };
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds);
  }

  public toggleMessageVisibility(): void {
    if (!this.activeMessage) {
      this.setMessage({ text: 'STANDBY', visible: true });
      return;
    }
    this.activeMessage.visible = !this.activeMessage.visible;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds);
  }

  public clearMessage(): void {
    this.activeMessage = null;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds);
  }

  public getActiveMessage(): StageMessage | null {
    return this.activeMessage;
  }

  public isDisplayBlackout(): boolean {
    return this.isBlackout;
  }

  public isDisplayClock(): boolean {
    return this.isClockMode;
  }

  // --- REMOTE DISPATCH ---

  public async sendRemoteCommand(command: string, payload?: unknown, pin?: string): Promise<{ success: boolean; error?: string }> {
    // 1. Same-device broadcast
    this.bus.post('COMMAND', { command, payload });

    // 2. LAN network dispatch
    if (typeof window !== 'undefined') {
      try {
        const storedPin = pin || sessionStorage.getItem('protimer_lan_pin') || '';
        const res = await fetch('/api/lan/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, payload, pin: storedPin }),
        });
        const result = await res.json();
        return result;
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    return { success: true };
  }

  // --- SUBSCRIPTIONS ---

  public subscribe(listener: DisplaySyncListener): () => void {
    this.listeners.add(listener);
    if (this.lastPayload) {
      listener(this.lastPayload);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(payload: DisplaySyncPayload) {
    this.listeners.forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        console.error('Display sync listener error:', e);
      }
    });
  }

  // --- WINDOW LAUNCHER ---

  public openDisplayWindow(
    target: DisplayTarget,
    bounds?: { x: number; y: number; width: number; height: number }
  ): Window | null {
    const url = `${window.location.origin}${window.location.pathname}?display=${target}`;
    const windowName = `ProTimer_${target}_Window`;
    const isCompactPopout = target === 'preview' || target === 'presenter';
    const width = bounds?.width || (isCompactPopout ? 360 : 1280);
    const height = bounds?.height || (isCompactPopout ? 240 : 720);
    const left = bounds?.x ?? (target === 'preview' ? Math.max(20, window.screen.availWidth - 390) : 28);
    const top = bounds?.y ?? (isCompactPopout ? 60 : 0);
    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,menubar=no,toolbar=no,location=no,status=no`;
    const win = window.open(url, windowName, features);
    // Broadcast current state multiple times as the child window boots so it never misses initial sync
    for (const delay of [100, 300, 700]) {
      setTimeout(() => {
        const snap = timerManagerService.getSnapshot();
        this.broadcastCurrentState(snap.status, snap.currentSeconds);
      }, delay);
    }
    return win;
  }
}

export const displaySyncService = new DisplaySyncService();
