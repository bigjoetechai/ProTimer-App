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

export interface OutputDisplayStatus {
  isFullscreenActive: boolean;
  isMultiFullscreenActive: boolean;
  isNdiActive: boolean;
  isNdiMultiActive: boolean;
  ndiSourceName: string;
}

class DisplaySyncService {
  private bus: CrossWindowBus;
  private isMaster: boolean = true;
  private isBlackout: boolean = false;
  private isClockMode: boolean = false;
  private activeMessage: StageMessage | null = null;
  private listeners: Set<DisplaySyncListener> = new Set();
  private lastPayload: DisplaySyncPayload | null = null;
  private masterPollInterval: any = null;
  private masterEventSource: EventSource | null = null;
  private clientEventSource: EventSource | null = null;
  private clientPollInterval: any = null;
  private executedCommandIds: Set<string> = new Set();
  private outputCommandHandler: ((command: string, payload?: unknown) => void) | null = null;
  private outputStatus: OutputDisplayStatus = {
    isFullscreenActive: false,
    isMultiFullscreenActive: false,
    isNdiActive: false,
    isNdiMultiActive: false,
    ndiSourceName: 'ProTimer (Main Output)',
  };
  private lastPushedBgUrl: string | undefined = undefined;
  private lastPushedLogoUrl: string | undefined = undefined;
  private lastPushedCueImages: Map<string, { bg?: string; logo?: string }> = new Map();
  private isPushingLanState: boolean = false;
  private pendingLanPush: { state: DisplaySyncPayload; timers: TimerItem[] } | null = null;
  private lastLanPushAt: number = 0;
  private lastPushedListId: string | undefined = undefined;
  private lastPushedStatus: string | undefined = undefined;
  private lastPushedTimerId: string | undefined = undefined;
  private lastRealtimeFrameAt: number = 0;
  private optimisticLockUntil: number = 0;
  private hasReceivedMasterSync: boolean = false;

  constructor() {
    this.bus = new CrossWindowBus('protimer_sync_v1');
    const isClientDisplay =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('display');
    this.isMaster = !isClientDisplay;

    // Seed initial payload immediately from timerManagerService if Master
    if (this.isMaster) {
      const initialSnap = timerManagerService.getSnapshot();
      this.lastPayload = this.buildPayload(initialSnap.status, initialSnap.currentSeconds);
    }
    this.setupListeners();
    if (this.isMaster) {
      this.startMasterPolling();
      // Push initial state immediately so LAN remote clients have state ready
      setTimeout(() => {
        if (this.isMaster) {
          const snap = timerManagerService.getSnapshot();
          this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
        }
      }, 50);
    }
  }

  public initAsClient(): void {
    this.isMaster = false;
    if (this.masterPollInterval) {
      clearInterval(this.masterPollInterval);
      this.masterPollInterval = null;
    }
    if (this.masterEventSource) {
      this.masterEventSource.close();
      this.masterEventSource = null;
    }
    // Request fresh sync frame from Master window and connect to LAN stream
    this.bus.post('REQUEST_SYNC', { timestamp: Date.now() });
    this.setupClientLanSync();
  }

  private acceptClientPayload(incoming: DisplaySyncPayload, source: 'bus' | 'sse' | 'poll'): void {
    if (!incoming) return;
    const now = Date.now();

    if (source === 'bus' || source === 'sse') {
      this.lastRealtimeFrameAt = now;
    } else if (source === 'poll') {
      // If real-time BroadcastChannel or SSE is actively streaming, ignore background poll responses
      // so delayed HTTP responses never cause the UI to jump backward
      if (this.hasReceivedMasterSync && now - this.lastRealtimeFrameAt < 1800) {
        return;
      }
    }

    // Reject stale frames with an older timestamp than what we already rendered
    if (
      this.hasReceivedMasterSync &&
      this.lastPayload?.timestamp &&
      incoming.timestamp &&
      incoming.timestamp < this.lastPayload.timestamp &&
      this.lastPayload.timestamp - incoming.timestamp < 8000
    ) {
      return;
    }

    // If user just tapped a button (< 180ms ago), ignore pre-command routine ticks
    if (now < this.optimisticLockUntil && incoming.timestamp && incoming.timestamp < this.optimisticLockUntil - 180) {
      return;
    }

    this.hasReceivedMasterSync = true;
    this.lastPayload = incoming;
    this.notifyListeners(incoming);
  }

  public registerOutputController(handler: (command: string, payload?: unknown) => void): () => void {
    this.outputCommandHandler = handler;
    return () => {
      if (this.outputCommandHandler === handler) {
        this.outputCommandHandler = null;
      }
    };
  }

  public updateOutputStatus(partial: Partial<OutputDisplayStatus>): void {
    const next: OutputDisplayStatus = {
      ...this.outputStatus,
      ...partial,
    };
    const changed =
      next.isFullscreenActive !== this.outputStatus.isFullscreenActive ||
      next.isMultiFullscreenActive !== this.outputStatus.isMultiFullscreenActive ||
      next.isNdiActive !== this.outputStatus.isNdiActive ||
      next.isNdiMultiActive !== this.outputStatus.isNdiMultiActive ||
      next.ndiSourceName !== this.outputStatus.ndiSourceName;
    this.outputStatus = next;
    if (changed && this.isMaster) {
      const snap = timerManagerService.getSnapshot();
      this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
    }
  }

  private markCommandExecuted(id?: string): boolean {
    if (!id) return true;
    if (this.executedCommandIds.has(id)) return false;
    this.executedCommandIds.add(id);
    if (this.executedCommandIds.size > 200) {
      const first = this.executedCommandIds.values().next().value;
      if (first) this.executedCommandIds.delete(first);
    }
    return true;
  }

  private setupListeners() {
    // Listen for broadcast frames from Master (same-device windowing)
    this.bus.subscribe<DisplaySyncPayload>('SYNC_FRAME', (envelope) => {
      if (!this.isMaster) {
        this.acceptClientPayload(envelope.payload, 'bus');
      }
    });

    // Listen for sync requests from newly opened Preview / Secondary windows
    this.bus.subscribe('REQUEST_SYNC', () => {
      if (this.isMaster) {
        const snap = timerManagerService.getSnapshot();
        this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
      }
    });

    // Listen for remote control commands (same-device)
    this.bus.subscribe<{ id?: string; command: string; payload?: unknown }>('COMMAND', (envelope) => {
      if (this.isMaster) {
        if (this.markCommandExecuted(envelope.payload.id)) {
          this.handleRemoteCommand(envelope.payload.command, envelope.payload.payload);
        }
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
          this.lastPushedBgUrl = undefined;
          this.lastPushedLogoUrl = undefined;
          this.lastPushedCueImages.clear();
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
   * Listen via real-time SSE + fast fallback polling for incoming LAN commands sent by remote tablets/phones.
   */
  private startMasterPolling() {
    if (typeof window === 'undefined' || !this.isMaster) return;

    // 1. Instant real-time SSE listener for COMMAND_DISPATCHED (~1ms latency)
    try {
      if (this.masterEventSource) {
        this.masterEventSource.close();
      }
      this.masterEventSource = new EventSource('/api/lan/stream');
      this.masterEventSource.onmessage = (event) => {
        if (!this.isMaster) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'COMMAND_DISPATCHED' && data.command) {
            const cmd = data.command;
            if (this.markCommandExecuted(cmd.id)) {
              this.handleRemoteCommand(cmd.command, cmd.payload);
            }
          }
        } catch {
          // Ignore malformed frame
        }
      };
    } catch {
      // Fallback to polling if SSE unavailable
    }

    // 2. Fast fallback polling (120ms) to drain pendingCommands queue
    this.masterPollInterval = setInterval(async () => {
      if (!this.isMaster) return;
      try {
        const res = await fetch('/api/lan/commands');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.commands) && data.commands.length > 0) {
            for (const cmd of data.commands) {
              if (this.markCommandExecuted(cmd.id)) {
                this.handleRemoteCommand(cmd.command, cmd.payload);
              }
            }
          }
        }
      } catch {
        // Silently ignore if offline or in preview
      }
    }, 120);
  }

  /**
   * Client-side LAN synchronization for devices on the local network.
   */
  private setupClientLanSync() {
    if (typeof window === 'undefined') return;

    // 1. Server-Sent Events (SSE) for low latency
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
              this.acceptClientPayload(data.state, 'sse');
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

    // 2. Initial fetch + fallback polling (only used if SSE/BroadcastChannel isn't actively streaming)
    const fetchState = async (isInitial = false) => {
      try {
        const res = await fetch('/api/lan/state');
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            this.acceptClientPayload(data.state, isInitial ? 'sse' : 'poll');
          }
        }
      } catch {
        // Ignore network drops
      }
    };

    fetchState(true);
    if (this.clientPollInterval) {
      clearInterval(this.clientPollInterval);
    }
    this.clientPollInterval = setInterval(() => fetchState(false), 400);
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
      case 'SWITCH_LIST':
        if (p?.listId) {
          timerManagerService.switchList(p.listId);
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
        return;
      case 'TOGGLE_CLOCK':
        this.toggleClockMode();
        return;
      case 'SET_MESSAGE':
        if (p) {
          this.setMessage(typeof p === 'string' ? { text: p } : (p as StageMessage));
        }
        return;
      case 'CLEAR_MESSAGE':
        this.clearMessage();
        return;
      case 'TOGGLE_FULLSCREEN':
      case 'OPEN_FULLSCREEN':
      case 'CLOSE_FULLSCREEN':
      case 'TOGGLE_MULTI_FULLSCREEN':
      case 'TOGGLE_NDI':
      case 'TOGGLE_NDI_MULTI':
        if (this.outputCommandHandler) {
          this.outputCommandHandler(cmdUpper, p);
        }
        break;
    }

    // Immediately broadcast updated state back to all LAN clients and displays
    if (this.isMaster) {
      const snap = timerManagerService.getSnapshot();
      this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
    }
  }

  private buildPayload(status: TimerStatus, currentSeconds: number): DisplaySyncPayload {
    const snap = timerManagerService.getSnapshot();
    const activeListId = snap.activeListId;
    const allLists = timerManagerService.getAllLists();
    const currentListObj = allLists.find((l) => l.id === activeListId) || allLists[0];
    const activeListName = currentListObj?.name || 'Cue List';
    const listsSummary = allLists.map((l) => ({
      id: l.id,
      name: l.name,
      runningCount: timerManagerService.getRunningTimerCount(l.id),
    }));

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
      activeListName,
      lists: listsSummary,
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
      isFullscreenActive: this.outputStatus.isFullscreenActive,
      isMultiFullscreenActive: this.outputStatus.isMultiFullscreenActive,
      isNdiActive: this.outputStatus.isNdiActive,
      isNdiMultiActive: this.outputStatus.isNdiMultiActive,
      ndiSourceName: this.outputStatus.ndiSourceName,
    };
  }

  public notifyPreferencesUpdated(): void {
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
  }

  private flushLanPushQueue(): void {
    if (this.isPushingLanState || !this.pendingLanPush) return;
    const nextToPush = this.pendingLanPush;
    this.pendingLanPush = null;
    this.isPushingLanState = true;
    this.lastLanPushAt = Date.now();

    fetch('/api/lan/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextToPush),
    })
      .catch(() => {})
      .finally(() => {
        this.isPushingLanState = false;
        if (this.pendingLanPush) {
          this.flushLanPushQueue();
        }
      });
  }

  public broadcastCurrentState(status: TimerStatus, currentSeconds: number, immediate: boolean = false) {
    const payload = this.buildPayload(status, currentSeconds);
    const allActiveTimers = timerManagerService.getActiveListTimers();

    this.lastPayload = payload;
    this.bus.post('SYNC_FRAME', payload);
    this.notifyListeners(payload);

    // Push state to LAN/NDI API for remote network capture & mobile controllers
    if (this.isMaster && typeof window !== 'undefined') {
      const now = Date.now();
      const structuralChange =
        immediate ||
        payload.activeListId !== this.lastPushedListId ||
        payload.status !== this.lastPushedStatus ||
        payload.activeTimer?.id !== this.lastPushedTimerId;

      if (!structuralChange && now - this.lastLanPushAt < 95) {
        return;
      }

      this.lastPushedListId = payload.activeListId;
      this.lastPushedStatus = payload.status;
      this.lastPushedTimerId = payload.activeTimer?.id;

      const lanPrefs = payload.preferences
        ? {
            ...payload.preferences,
            backgroundImageDataUrl: '',
            logoImageDataUrl: '',
            listBackgroundImages: {},
            listLogoImages: {},
          }
        : undefined;

      const bgToSend =
        payload.backgroundImageUrl === this.lastPushedBgUrl
          ? '__CACHED__'
          : payload.backgroundImageUrl;
      const logoToSend =
        payload.logoImageUrl === this.lastPushedLogoUrl
          ? '__CACHED__'
          : payload.logoImageUrl;

      this.lastPushedBgUrl = payload.backgroundImageUrl;
      this.lastPushedLogoUrl = payload.logoImageUrl;

      const optimizedListCues = payload.listActiveCues?.map((cue) => {
        const prevCueImg = this.lastPushedCueImages.get(cue.listId);
        const cueBg =
          prevCueImg && prevCueImg.bg === cue.backgroundImageUrl
            ? '__CACHED__'
            : cue.backgroundImageUrl;
        const cueLogo =
          prevCueImg && prevCueImg.logo === cue.logoImageUrl
            ? '__CACHED__'
            : cue.logoImageUrl;
        this.lastPushedCueImages.set(cue.listId, {
          bg: cue.backgroundImageUrl,
          logo: cue.logoImageUrl,
        });
        return {
          ...cue,
          backgroundImageUrl: cueBg,
          logoImageUrl: cueLogo,
        };
      });

      const lanPayload: DisplaySyncPayload = {
        ...payload,
        backgroundImageUrl: bgToSend,
        logoImageUrl: logoToSend,
        listActiveCues: optimizedListCues,
        preferences: lanPrefs,
      };

      this.pendingLanPush = { state: lanPayload, timers: allActiveTimers };
      this.flushLanPushQueue();
    }
  }

  // --- DISPLAY TOGGLES ---

  public toggleBlackout(): void {
    this.isBlackout = !this.isBlackout;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
  }

  public setBlackout(blackout: boolean): void {
    this.isBlackout = blackout;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
  }

  public toggleClockMode(): void {
    this.isClockMode = !this.isClockMode;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
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
    this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
  }

  public toggleMessageVisibility(): void {
    if (!this.activeMessage) {
      this.setMessage({ text: 'STANDBY', visible: true });
      return;
    }
    this.activeMessage.visible = !this.activeMessage.visible;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
  }

  public clearMessage(): void {
    this.activeMessage = null;
    const snap = timerManagerService.getSnapshot();
    this.broadcastCurrentState(snap.status, snap.currentSeconds, true);
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

  // --- REMOTE DISPATCH (WITH 0ms OPTIMISTIC FEEDBACK) ---

  private applyOptimisticClientUpdate(command: string, payload?: unknown): void {
    if (!this.lastPayload) return;
    const cmdUpper = String(command).toUpperCase();
    const p = payload as any;
    const now = Date.now();
    this.optimisticLockUntil = now + 220;
    const next: DisplaySyncPayload = { ...this.lastPayload, timestamp: now };

    switch (cmdUpper) {
      case 'START':
        next.status = 'running';
        break;
      case 'PAUSE':
        next.status = next.status === 'paused' ? 'running' : 'paused';
        break;
      case 'STOP':
        next.status = 'idle';
        break;
      case 'RESTART':
        next.secondsRemaining = next.totalDurationSeconds;
        next.formattedTime = formatSeconds(next.totalDurationSeconds, true, false, next.preferences);
        next.isOvertime = false;
        next.progressPercent = 0;
        next.status = 'running';
        break;
      case 'SELECT_TIMER':
        if (p?.timerId && next.timerList) {
          next.timerList = next.timerList.map((item) => ({
            ...item,
            isCued: item.id === p.timerId,
          }));
        }
        break;
      case 'SWITCH_LIST':
        if (p?.listId) {
          next.activeListId = p.listId;
          const foundList = next.lists?.find((l) => l.id === p.listId);
          if (foundList) {
            next.activeListName = foundList.name;
          }
          const cueSummary = next.listActiveCues?.find((c) => c.listId === p.listId);
          if (cueSummary) {
            next.activeTimer = cueSummary.activeTimer;
            next.nextTimer = cueSummary.nextTimer;
            next.status = cueSummary.status;
            next.formattedTime = cueSummary.formattedTime;
            next.secondsRemaining = cueSummary.secondsRemaining;
            next.totalDurationSeconds = cueSummary.totalDurationSeconds;
            next.progressPercent = cueSummary.progressPercent;
            next.isOvertime = cueSummary.isOvertime;
          }
        }
        break;
      case 'ADJUST_DURATION': {
        const delta = typeof p?.secondsDelta === 'number' ? p.secondsDelta : typeof p === 'number' ? p : 0;
        if (delta !== 0) {
          next.secondsRemaining += delta;
          next.totalDurationSeconds = Math.max(1, next.totalDurationSeconds + delta);
          next.isOvertime = next.secondsRemaining < 0;
          next.formattedTime = formatSeconds(next.secondsRemaining, true, next.isOvertime, next.preferences);
        }
        break;
      }
      case 'TOGGLE_BLACKOUT':
        next.isBlackout = !next.isBlackout;
        break;
      case 'TOGGLE_CLOCK':
        next.isClockMode = !next.isClockMode;
        break;
      case 'TOGGLE_FULLSCREEN':
        next.isFullscreenActive = !next.isFullscreenActive;
        break;
      case 'OPEN_FULLSCREEN':
        next.isFullscreenActive = true;
        break;
      case 'CLOSE_FULLSCREEN':
        next.isFullscreenActive = false;
        break;
      case 'TOGGLE_MULTI_FULLSCREEN':
        next.isMultiFullscreenActive = !next.isMultiFullscreenActive;
        break;
      case 'TOGGLE_NDI':
        if (next.isNdiActive && !next.isNdiMultiActive) {
          next.isNdiActive = false;
        } else {
          next.isNdiActive = true;
          next.isNdiMultiActive = false;
        }
        break;
      case 'TOGGLE_NDI_MULTI':
        if (next.isNdiActive && next.isNdiMultiActive) {
          next.isNdiActive = false;
          next.isNdiMultiActive = false;
        } else {
          next.isNdiActive = true;
          next.isNdiMultiActive = true;
        }
        break;
      case 'SET_MESSAGE':
        if (p) {
          const text = typeof p === 'string' ? p : p.text || '';
          next.activeMessage = {
            id: 'optimistic_msg',
            text,
            visible: true,
            flash: false,
            urgent: false,
            color: '#f97316',
            createdAt: Date.now(),
          };
        }
        break;
      case 'CLEAR_MESSAGE':
        next.activeMessage = null;
        break;
    }

    this.lastPayload = next;
    this.notifyListeners(next);
  }

  public async sendRemoteCommand(command: string, payload?: unknown, pin?: string): Promise<{ success: boolean; error?: string }> {
    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 0. If called on Master directly (e.g. from LAN Hub modal), execute immediately in 0ms
    if (this.isMaster) {
      this.markCommandExecuted(cmdId);
      this.handleRemoteCommand(command, payload);
      return { success: true };
    }

    // 1. Instant 0ms optimistic update on the remote client UI
    this.applyOptimisticClientUpdate(command, payload);

    // 2. Same-device broadcast (instant across browser tabs on the same machine)
    this.bus.post('COMMAND', { id: cmdId, command, payload });

    // 3. LAN network dispatch (for smartphones, tablets, and other computers)
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
