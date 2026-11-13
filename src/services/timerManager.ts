/**
 * Central Timer Management Engine.
 *
 * Implements high-precision, drift-free real-time timer calculations
 * using wall-clock timestamp deltas (immune to setInterval drift and background tab throttling).
 *
 * Supports:
 * - START: Start selected timer
 * - STOP: Stop selected timer
 * - PAUSE: Pause selected timer while preserving current value
 * - RESTART: Reset timer to original duration and start again immediately
 * - CUE: Return timer to configured starting value without auto-starting
 * - Duration Controls: Increase, decrease, manual editing, and configurable increments
 * - Speed Control: 1% to 200% (50% = half speed, 200% = twice as fast)
 * - Timer Types: Countdown, Count Up, Stopwatch (with Laps), Digital Clock, Meeting Timer
 * - Multiple independently running timers
 */

import { 
  TimerItem, 
  TimerList, 
  TimerStatus, 
  TimerSnapshot, 
  StopwatchLap,
  TimerAlert,
  ListExportData,
  AllListsBackupData,
  ListActiveCueSummary,
  TimerRunLogEntry,
  resolveBackgroundImageForList,
  resolveLogoImageForList
} from '../types';
import { generateId } from '../utilities/idGenerator';
import { formatSeconds } from '../utilities/timeFormatters';
import { storageService } from './storageService';
import { audioController } from '../audio/AudioController';
import { formatClock, calculateEndTime } from '../utilities/timeFormatters';

export type TimerManagerSubscriber = (snapshot: TimerSnapshot, timers: TimerItem[]) => void;

export interface ActiveAlertInfo {
  color?: string;
  flash: boolean;
  onOff: boolean;
  level: 'none' | 'alert1' | 'alert2' | 'overtime';
  name?: string;
}

/**
 * Universal evaluator for Alert 1 and Alert 2 thresholds across count down and count up timers.
 * Accurately determines when timer reaches Alert 1 threshold (applying Alert 1 color)
 * and when timer reaches Alert 2 threshold (applying Alert 2 color).
 */
export function computeActiveAlert(
  timer: TimerItem | null | undefined,
  currentSeconds: number,
  status?: TimerStatus
): ActiveAlertInfo {
  if (!timer || timer.type === 'spacer' || timer.type === 'empty') {
    return { flash: false, onOff: false, level: 'none' };
  }

  const isCountUp = timer.type === 'count_up' || timer.type === 'stopwatch';
  const isOvertime = status === 'overtime' || (!isCountUp && currentSeconds <= 0 && (status === 'running' || status === 'paused'));

  // If timer is in overtime (completed countdown or past zero)
  if (isOvertime) {
    const color = timer.alert2?.color || timer.alert1?.color || '#ef4444';
    const onOff = timer.alert2?.onOff ?? timer.alert1?.onOff ?? true;
    const flash = onOff ? false : (timer.alert2?.flash ?? timer.alert1?.flash ?? false);
    return { color, flash, onOff, level: 'overtime', name: 'Overtime' };
  }

  // Only apply alert colors when the timer is active/running/paused
  if (status !== 'running' && status !== 'paused') {
    return { flash: false, onOff: false, level: 'none' };
  }

  const a1 = timer.alert1;
  const a2 = timer.alert2;

  if (isCountUp) {
    // For Count Up: alert triggers when elapsed time reaches or exceeds the threshold
    const a1Due = a1 ? currentSeconds >= a1.timeSeconds : false;
    const a2Due = a2 ? currentSeconds >= a2.timeSeconds : false;

    if (a1Due && a2Due && a1 && a2) {
      // Both thresholds reached: whichever threshold was reached second (higher threshold) takes priority
      if (a2.timeSeconds >= a1.timeSeconds) {
        return { color: a2.color, flash: a2.flash, onOff: !!a2.onOff, level: 'alert2', name: a2.label || 'Alert 2' };
      } else {
        return { color: a1.color, flash: a1.flash, onOff: !!a1.onOff, level: 'alert1', name: a1.label || 'Alert 1' };
      }
    } else if (a2Due && a2) {
      return { color: a2.color, flash: a2.flash, onOff: !!a2.onOff, level: 'alert2', name: a2.label || 'Alert 2' };
    } else if (a1Due && a1) {
      return { color: a1.color, flash: a1.flash, onOff: !!a1.onOff, level: 'alert1', name: a1.label || 'Alert 1' };
    }
  } else {
    // For Countdown: alert triggers when remaining time drops to or below the threshold
    const a1Due = a1 ? currentSeconds <= a1.timeSeconds && currentSeconds > 0 : false;
    const a2Due = a2 ? currentSeconds <= a2.timeSeconds && currentSeconds > 0 : false;

    if (a1Due && a2Due && a1 && a2) {
      // Both thresholds met: whichever threshold is closer to zero (lower threshold / reached second) takes priority
      if (a2.timeSeconds <= a1.timeSeconds) {
        return { color: a2.color, flash: a2.flash, onOff: !!a2.onOff, level: 'alert2', name: a2.label || 'Alert 2' };
      } else {
        return { color: a1.color, flash: a1.flash, onOff: !!a1.onOff, level: 'alert1', name: a1.label || 'Alert 1' };
      }
    } else if (a2Due && a2) {
      return { color: a2.color, flash: a2.flash, onOff: !!a2.onOff, level: 'alert2', name: a2.label || 'Alert 2' };
    } else if (a1Due && a1) {
      return { color: a1.color, flash: a1.flash, onOff: !!a1.onOff, level: 'alert1', name: a1.label || 'Alert 1' };
    }
  }

  return { flash: false, onOff: false, level: 'none' };
}

class TimerManagerService {
  private timers: Map<string, TimerItem> = new Map();
  private lists: Map<string, TimerList> = new Map();
  private activeListId: string = 'list_1';

  private activeTimerId: string | null = null;
  private cuedTimerId: string | null = null;

  // Set of IDs of timers currently running concurrently
  private runningTimerIds: Set<string> = new Set();

  // Timer execution history logs (Start & Stop timestamps)
  private runLogs: TimerRunLogEntry[] = [];
  private activeLogIdByTimerId: Map<string, string> = new Map();

  // Central high-resolution tick interval
  private intervalHandle: number | null = null;
  private readonly TICK_RATE_MS = 50; // 20 ticks per second for silky smooth UI

  // Configurable duration adjustment increment (default: 60s / 1 min)
  private durationIncrementSeconds: number = 60;
  private autoAdvanceRundown: boolean = false;
  private wallClockCheckerInterval: any = null;

  private subscribers: Set<TimerManagerSubscriber> = new Set();
  private blackoutListeners: Set<(blackout: boolean) => void> = new Set();
  private isInitialized: boolean = false;

  public onBlackout(listener: (blackout: boolean) => void): () => void {
    this.blackoutListeners.add(listener);
    return () => {
      this.blackoutListeners.delete(listener);
    };
  }

  private triggerBlackout(blackout: boolean): void {
    this.blackoutListeners.forEach((fn) => {
      try {
        fn(blackout);
      } catch {}
    });
  }

  constructor() {
    // Listen for tab focus / visibility restoration to immediately catch up any background time
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.runningTimerIds.size > 0) {
          this.tickAllRunning();
        }
      });
      window.addEventListener('focus', () => {
        if (this.runningTimerIds.size > 0) {
          this.tickAllRunning();
        }
      });
    }
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const CLEAN_DEFAULTS_KEY = 'protimer_clean_defaults_v2';
    const hasCleanedLegacyDefaults =
      typeof window !== 'undefined' && localStorage.getItem(CLEAN_DEFAULTS_KEY) === 'true';

    // Load lists & timers from IndexedDB
    let savedLists = await storageService.getAllLists();
    let savedTimers = await storageService.getAllTimers();

    // One-time cleanup of previously seeded default tabs & sample cues
    if (!hasCleanedLegacyDefaults) {
      const legacySampleNames = new Set([
        'Prelude & Welcome',
        'Worship & Praise',
        'Sermon: Living with Purpose',
        'Benediction & Dismissal',
        'Keynote Presentation',
        'Expert Panel Discussion',
        'Morning Coffee Break',
        'Guest Speaker 1',
        'Lightning Talks',
        'Closing Remarks',
      ]);

      const cleanList1: TimerList = {
        id: 'list_1',
        name: 'List 1',
        order: 0,
        isDefault: true,
        timerIds: [],
      };

      // Keep only user-created timers that were not part of the seeded sample set
      const userTimers = savedTimers.filter((t) => !legacySampleNames.has(t.name));
      cleanList1.timerIds = userTimers.map((t) => t.id);

      await storageService.replaceAllListsAndTimers([cleanList1], userTimers);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(CLEAN_DEFAULTS_KEY, 'true');
        } catch {
          // Ignore storage error
        }
      }
      savedLists = [cleanList1];
      savedTimers = userTimers;
    }

    if (savedLists.length > 0) {
      savedLists.forEach((l, idx) => {
        if (l.order === undefined) l.order = idx;
        if (l.name === 'List 1: Sunday Service') {
          l.name = 'List 1';
          storageService.saveList(l);
        }
        this.lists.set(l.id, l);
      });
      this.activeListId = savedLists[0].id;
    } else {
      const defaultList: TimerList = {
        id: 'list_1',
        name: 'List 1',
        order: 0,
        isDefault: true,
        timerIds: [],
      };
      this.lists.set(defaultList.id, defaultList);
      storageService.saveList(defaultList);
      this.activeListId = 'list_1';
    }

    if (savedTimers.length > 0) {
      savedTimers.forEach((t) => {
        t.status = t.status === 'running' ? 'paused' : (t.status || 'idle');
        this.timers.set(t.id, t);
      });
    }

    // Load persisted timer run history logs
    const savedLogs = storageService.getRunLogs();
    if (Array.isArray(savedLogs)) {
      let modified = false;
      this.runLogs = savedLogs.map((entry) => {
        if (entry.status === 'running' || entry.status === 'paused') {
          modified = true;
          return {
            ...entry,
            status: 'stopped' as const,
            stopTimestamp: entry.stopTimestamp || Date.now(),
          };
        }
        return entry;
      });
      if (modified) {
        storageService.saveRunLogs(this.runLogs);
      }
    }

    // Auto-cue first timer in active list if any exist
    const activeList = this.lists.get(this.activeListId);
    if (activeList && activeList.timerIds.length > 0) {
      const firstId = activeList.timerIds[0];
      this.cue(firstId);
    }

    if (typeof window !== 'undefined' && !this.wallClockCheckerInterval) {
      this.wallClockCheckerInterval = setInterval(() => {
        this.checkScheduledAutoStarts();
      }, 1000);
    }

    this.isInitialized = true;
    this.notifySubscribers();
  }

  // ===========================================================================
  // TIMER RUN HISTORY LOGGING (START & STOP TIMESTAMPS)
  // ===========================================================================

  private findParentListForTimer(timerId: string): TimerList | undefined {
    for (const list of this.lists.values()) {
      if (list.timerIds.includes(timerId)) {
        return list;
      }
    }
    return this.lists.get(this.activeListId);
  }

  private recordTimerStart(timer: TimerItem, isResumingFromPause: boolean = false): void {
    const existingLogId = this.activeLogIdByTimerId.get(timer.id);
    if (isResumingFromPause && existingLogId) {
      const entry = this.runLogs.find((l) => l.id === existingLogId);
      if (entry) {
        entry.status = 'running';
        entry.stopTimestamp = null;
        storageService.saveRunLogs(this.runLogs);
        return;
      }
    }

    if (existingLogId) {
      this.recordTimerStop(timer, 'stopped');
    }

    const parentList = this.findParentListForTimer(timer.id);
    const now = Date.now();
    const newEntry: TimerRunLogEntry = {
      id: generateId('log'),
      timerId: timer.id,
      timerName: timer.name || 'Untitled Timer',
      timerType: timer.type,
      listId: parentList?.id || this.activeListId,
      listName: parentList?.name || 'Cue List',
      plannedDurationSeconds: timer.durationSeconds || 0,
      startTimestamp: now,
      stopTimestamp: null,
      elapsedSeconds: Math.max(0, Math.round(timer.elapsedSeconds || 0)),
      status: 'running',
    };

    this.runLogs.unshift(newEntry);
    if (this.runLogs.length > 500) {
      this.runLogs = this.runLogs.slice(0, 500);
    }
    this.activeLogIdByTimerId.set(timer.id, newEntry.id);
    storageService.saveRunLogs(this.runLogs);
  }

  private recordTimerPause(timer: TimerItem): void {
    const activeLogId = this.activeLogIdByTimerId.get(timer.id);
    if (!activeLogId) return;
    const entry = this.runLogs.find((l) => l.id === activeLogId);
    if (entry) {
      entry.status = 'paused';
      entry.elapsedSeconds = Math.max(0, Math.round(timer.elapsedSeconds || 0));
      storageService.saveRunLogs(this.runLogs);
    }
  }

  private recordTimerStop(timer: TimerItem, finalStatus: 'stopped' | 'completed' = 'stopped'): void {
    const activeLogId = this.activeLogIdByTimerId.get(timer.id);
    if (!activeLogId) return;
    const entry = this.runLogs.find((l) => l.id === activeLogId);
    if (entry) {
      entry.stopTimestamp = Date.now();
      entry.elapsedSeconds = Math.max(0, Math.round(timer.elapsedSeconds || 0));
      entry.status = finalStatus;
    }
    this.activeLogIdByTimerId.delete(timer.id);
    storageService.saveRunLogs(this.runLogs);
  }

  public getRunLogs(): TimerRunLogEntry[] {
    return this.runLogs;
  }

  public deleteRunLog(logId: string): void {
    this.runLogs = this.runLogs.filter((l) => l.id !== logId);
    for (const [timerId, activeLogId] of this.activeLogIdByTimerId.entries()) {
      if (activeLogId === logId) {
        this.activeLogIdByTimerId.delete(timerId);
      }
    }
    storageService.saveRunLogs(this.runLogs);
    this.notifySubscribers();
  }

  public clearRunLogs(): void {
    this.runLogs = [];
    this.activeLogIdByTimerId.clear();
    storageService.saveRunLogs(this.runLogs);
    this.notifySubscribers();
  }

  public exportRunLogsCsv(): void {
    const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
    let csvContent =
      'Timer Name,Cue List,Timer Type,Planned Duration,Actual Elapsed,Start Timestamp,Stop Timestamp,Status\r\n';

    this.runLogs.forEach((entry) => {
      const startDateStr = new Date(entry.startTimestamp).toLocaleString();
      const stopDateStr = entry.stopTimestamp
        ? new Date(entry.stopTimestamp).toLocaleString()
        : entry.status === 'running'
        ? 'RUNNING'
        : 'PAUSED';
      const plannedStr = formatSeconds(entry.plannedDurationSeconds, true);
      const elapsedStr = formatSeconds(entry.elapsedSeconds, true);

      csvContent +=
        [
          escapeCsv(entry.timerName),
          escapeCsv(entry.listName),
          escapeCsv(entry.timerType),
          escapeCsv(plannedStr),
          escapeCsv(elapsedStr),
          escapeCsv(startDateStr),
          escapeCsv(stopDateStr),
          escapeCsv(entry.status.toUpperCase()),
        ].join(',') + '\r\n';
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protimer-history-logs-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private seedInitialTimers() {
    const list1 = this.lists.get('list_1') || Array.from(this.lists.values())[0];
    const list2 = this.lists.get('list_2');
    const list3 = this.lists.get('list_3');

    const allNewTimers: TimerItem[] = [];

    // --- List 1: Sunday Service Timers ---
    if (list1 && list1.timerIds.length === 0) {
      const l1Timers: TimerItem[] = [
        {
          id: generateId('t'),
          name: 'Prelude & Welcome',
          order: 0,
          durationSeconds: 300, // 5 min
          elapsedSeconds: 0,
          remainingSeconds: 300,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          alert1: { id: 'a1', timeSeconds: 60, color: '#eab308', label: '1m Warning', flash: true, soundEnabled: true },
          endAction: 'next_timer',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: generateId('t'),
          name: 'Worship & Praise',
          order: 1,
          durationSeconds: 1200, // 20 min
          elapsedSeconds: 0,
          remainingSeconds: 1200,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          alert1: { id: 'a1', timeSeconds: 180, color: '#eab308', label: '3m Wrap Up', flash: false, soundEnabled: true },
          alert2: { id: 'a2', timeSeconds: 60, color: '#ef4444', label: 'Final Song', flash: true, soundEnabled: true },
          endAction: 'next_timer',
          createdAt: Date.now() + 1,
          updatedAt: Date.now() + 1,
        },
        {
          id: generateId('t'),
          name: 'Sermon: Living with Purpose',
          order: 2,
          durationSeconds: 2100, // 35 min
          elapsedSeconds: 0,
          remainingSeconds: 2100,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          alert1: { id: 'a1', timeSeconds: 300, color: '#eab308', label: '5m Remaining', flash: true, soundEnabled: true },
          alert2: { id: 'a2', timeSeconds: 60, color: '#ef4444', label: 'Conclude', flash: true, soundEnabled: true },
          endAction: 'count_up',
          createdAt: Date.now() + 2,
          updatedAt: Date.now() + 2,
        },
        {
          id: generateId('t'),
          name: 'Benediction & Dismissal',
          order: 3,
          durationSeconds: 300, // 5 min
          elapsedSeconds: 0,
          remainingSeconds: 300,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          alert1: { id: 'a1', timeSeconds: 60, color: '#eab308', label: '1m Warning', flash: false, soundEnabled: true },
          alert2: { id: 'a2', timeSeconds: 30, color: '#ef4444', label: '30s Final', flash: true, soundEnabled: true },
          endAction: 'count_up',
          createdAt: Date.now() + 3,
          updatedAt: Date.now() + 3,
        },
      ];
      l1Timers.forEach(t => {
        this.timers.set(t.id, t);
        list1.timerIds.push(t.id);
        allNewTimers.push(t);
      });
      storageService.saveList(list1);
    }

    // --- List 2: Conference Timers ---
    if (list2 && list2.timerIds.length === 0) {
      const l2Timers: TimerItem[] = [
        {
          id: generateId('t'),
          name: 'Keynote Presentation',
          order: 0,
          durationSeconds: 2700, // 45 min
          elapsedSeconds: 0,
          remainingSeconds: 2700,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          alert1: { id: 'alt_10', timeSeconds: 600, color: '#eab308', label: '10m Warning', flash: false, soundEnabled: true, soundType: 'chime' },
          alert2: { id: 'alt_1', timeSeconds: 60, color: '#ef4444', label: '1m Urgent', flash: true, soundEnabled: true, soundType: 'alarm' },
          endAction: 'count_up',
          createdAt: Date.now() + 10,
          updatedAt: Date.now() + 10,
        },
        {
          id: generateId('t'),
          name: 'Expert Panel Discussion',
          order: 1,
          durationSeconds: 1800, // 30 min
          elapsedSeconds: 0,
          remainingSeconds: 1800,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          endAction: 'stop',
          createdAt: Date.now() + 11,
          updatedAt: Date.now() + 11,
        },
        {
          id: generateId('t'),
          name: 'Morning Coffee Break',
          order: 2,
          durationSeconds: 900, // 15 min
          elapsedSeconds: 0,
          remainingSeconds: 900,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          endAction: 'stop',
          createdAt: Date.now() + 12,
          updatedAt: Date.now() + 12,
        },
      ];
      l2Timers.forEach(t => {
        this.timers.set(t.id, t);
        list2.timerIds.push(t.id);
        allNewTimers.push(t);
      });
      storageService.saveList(list2);
    }

    // --- List 3: Speakers Timers ---
    if (list3 && list3.timerIds.length === 0) {
      const l3Timers: TimerItem[] = [
        {
          id: generateId('t'),
          name: 'Guest Speaker 1',
          order: 0,
          durationSeconds: 1500, // 25 min
          elapsedSeconds: 0,
          remainingSeconds: 1500,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          alert1: { id: 'a1', timeSeconds: 120, color: '#eab308', label: 'Wrap Up', flash: true, soundEnabled: true },
          endAction: 'count_up',
          createdAt: Date.now() + 20,
          updatedAt: Date.now() + 20,
        },
        {
          id: generateId('t'),
          name: 'Lightning Talks',
          order: 1,
          durationSeconds: 600, // 10 min
          elapsedSeconds: 0,
          remainingSeconds: 600,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          endAction: 'next_timer',
          createdAt: Date.now() + 21,
          updatedAt: Date.now() + 21,
        },
        {
          id: generateId('t'),
          name: 'Closing Remarks',
          order: 2,
          durationSeconds: 300, // 5 min
          elapsedSeconds: 0,
          remainingSeconds: 300,
          type: 'countdown',
          status: 'idle',
          speed: 100,
          endAction: 'stop',
          createdAt: Date.now() + 22,
          updatedAt: Date.now() + 22,
        },
      ];
      l3Timers.forEach(t => {
        this.timers.set(t.id, t);
        list3.timerIds.push(t.id);
        allNewTimers.push(t);
      });
      storageService.saveList(list3);
    }

    if (allNewTimers.length > 0) {
      storageService.saveTimersBatch(allNewTimers);
    }

    if (typeof window !== 'undefined' && !this.wallClockCheckerInterval) {
      this.wallClockCheckerInterval = setInterval(() => {
        this.checkScheduledAutoStarts();
      }, 1000);
    }
  }

  // ===========================================================================
  // TIMER AUTOMATION & SCHEDULED STARTS
  // ===========================================================================

  public setAutoAdvance(enabled: boolean): void {
    this.autoAdvanceRundown = enabled;
    this.notifySubscribers();
  }

  public isAutoAdvanceEnabled(): boolean {
    return this.autoAdvanceRundown;
  }

  private checkScheduledAutoStarts(): void {
    const list = this.lists.get(this.activeListId);
    if (!list) return;

    const now = new Date();
    const currentHms = formatClock(now, true);
    const currentHm = currentHms.slice(0, 5);

    for (const id of list.timerIds) {
      const timer = this.timers.get(id);
      if (timer && timer.autoStart && timer.scheduledStartTime && timer.status !== 'running' && timer.status !== 'completed') {
        const scheduled = timer.scheduledStartTime.trim();
        if (scheduled === currentHms || scheduled === currentHm) {
          timer.autoStart = false;
          this.saveTimerToStorage(timer);
          this.start(timer.id);
          break;
        }
      }
    }
  }

  // ===========================================================================
  // CONTROL BUTTON IMPLEMENTATIONS
  // ===========================================================================

  /**
   * START: Starts the next cue (or specified timer ID).
   * - Uses system time + duration to determine the END time.
   * - At the click of start button it starts the next cue in sequence and advances the cue pointer.
   * - The active running cue becomes highlighted in red.
   */
  private findListForTimer(timerId: string): TimerList | undefined {
    for (const list of this.lists.values()) {
      if (list.timerIds.includes(timerId)) {
        return list;
      }
    }
    return undefined;
  }

  public start(targetId?: string): void {
    const activeList = this.lists.get(this.activeListId);
    const targetList = targetId
      ? this.findListForTimer(targetId) || activeList
      : activeList;
    if (!targetList || targetList.timerIds.length === 0) return;

    const isTargetListActive = targetList.id === this.activeListId;

    const findNextPlayableId = (fromIndex: number): string | null => {
      for (let step = 1; step <= targetList.timerIds.length; step++) {
        const candidateId = targetList.timerIds[(fromIndex + step) % targetList.timerIds.length];
        const candidate = this.timers.get(candidateId);
        if (candidate && candidate.type !== 'spacer') {
          return candidateId;
        }
      }
      return null;
    };

    // Ensure activeTimerId and cuedTimerId belong to targetList when operating on activeList
    const currentActiveInList =
      this.activeTimerId && targetList.timerIds.includes(this.activeTimerId)
        ? this.activeTimerId
        : targetList.timerIds.find((tid) => this.runningTimerIds.has(tid)) ||
          targetList.timerIds.find((tid) => this.timers.get(tid)?.status === 'paused') ||
          null;

    const currentCuedInList =
      this.cuedTimerId && targetList.timerIds.includes(this.cuedTimerId)
        ? this.cuedTimerId
        : null;

    let idToStart: string | null = null;

    if (targetId && targetList.timerIds.includes(targetId)) {
      idToStart = targetId;
    } else if (
      currentActiveInList &&
      this.timers.get(currentActiveInList)?.status === 'paused' &&
      (!currentCuedInList || currentCuedInList === currentActiveInList)
    ) {
      // Resume currently paused timer in this list
      idToStart = currentActiveInList;
    } else if (currentCuedInList && currentCuedInList !== currentActiveInList) {
      idToStart = currentCuedInList;
    } else if (currentActiveInList && this.runningTimerIds.has(currentActiveInList)) {
      const currentIndex = targetList.timerIds.indexOf(currentActiveInList);
      idToStart = findNextPlayableId(currentIndex);
    } else if (currentCuedInList) {
      idToStart = currentCuedInList;
    } else {
      idToStart = findNextPlayableId(-1);
    }

    if (!idToStart) return;

    const timer = this.timers.get(idToStart);
    if (!timer || timer.type === 'spacer') return;

    // Transition any other running/overtime/paused timer in THIS SAME LIST to completed/idle
    targetList.timerIds.forEach((tid) => {
      if (tid !== idToStart) {
        const prevTimer = this.timers.get(tid);
        if (
          prevTimer &&
          (prevTimer.status === 'running' ||
            prevTimer.status === 'overtime' ||
            prevTimer.status === 'paused')
        ) {
          this.recordTimerStop(prevTimer, 'stopped');
          prevTimer.status = 'completed';
          this.runningTimerIds.delete(tid);
          this.saveTimerToStorage(prevTimer);
        }
      }
    });

    const wasPaused = timer.status === 'paused';

    // START uses the system time + duration to determine the END time
    const now = new Date();
    if (!wasPaused) {
      timer.startTime = formatClock(now, true);
    }

    // If starting fresh (idle, cued, or completed), reset elapsed and remaining
    if (timer.status === 'idle' || timer.status === 'cued' || timer.status === 'completed') {
      timer.elapsedSeconds = 0;
      timer.remainingSeconds = timer.durationSeconds;
    }

    const durationForEnd = timer.remainingSeconds > 0 ? timer.remainingSeconds : timer.durationSeconds;
    timer.endTime = calculateEndTime(durationForEnd, now);

    // Transition to running state
    timer.status = 'running';
    if (!wasPaused) {
      timer.triggeredAlertIds = [];
      (timer as unknown as { endActionTriggered?: boolean }).endActionTriggered = false;
    }
    (timer as unknown as { lastWallClockTime: number }).lastWallClockTime = now.getTime();

    this.runningTimerIds.add(idToStart);
    if (isTargetListActive) {
      this.activeTimerId = idToStart;
      this.cuedTimerId = idToStart;
    }
    this.ensureTickerRunning();
    this.recordTimerStart(timer, wasPaused);
    this.saveTimerToStorage(timer);

    this.notifySubscribers();
  }

  public resume(targetId?: string): void {
    this.start(targetId);
  }

  /**
   * STOP: Stop the selected timer in the current list (or specified targetId).
   */
  public stop(targetId?: string): void {
    const activeList = this.lists.get(this.activeListId);
    const resolvedActive = this.getActiveTimer()?.id || this.getCuedTimer()?.id || null;
    const idToStop = targetId || resolvedActive;
    if (!idToStop) return;

    const timer = this.timers.get(idToStop);
    if (!timer) return;

    // Record stop timestamp before resetting elapsed time
    if (
      this.activeLogIdByTimerId.has(idToStop) ||
      timer.status === 'running' ||
      timer.status === 'paused' ||
      timer.status === 'overtime'
    ) {
      this.recordTimerStop(timer, 'stopped');
    }

    timer.status = 'idle';
    timer.triggeredAlertIds = [];
    (timer as unknown as { endActionTriggered?: boolean }).endActionTriggered = false;
    this.runningTimerIds.delete(idToStop);
    this.checkStopTicker();

    // Reset elapsed and remaining back to configured values
    timer.elapsedSeconds = 0;
    if (timer.type === 'count_up' || timer.type === 'stopwatch') {
      timer.remainingSeconds = timer.startingValueSeconds || 0;
    } else if (timer.type === 'digital_clock') {
      const now = new Date();
      timer.remainingSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    } else {
      timer.remainingSeconds = timer.durationSeconds;
    }

    // Cue this timer back if it belongs to the active list
    if (!activeList || activeList.timerIds.includes(idToStop)) {
      this.cuedTimerId = idToStop;
      if (this.activeTimerId === idToStop) {
        this.activeTimerId = null;
      }
    }

    this.saveTimerToStorage(timer);
    this.notifySubscribers();
  }

  /**
   * PAUSE: Pause the selected timer while preserving its current value.
   * Clicking Pause again while paused resumes the timer from where it left off.
   */
  public pause(targetId?: string): void {
    const activeList = this.lists.get(this.activeListId);
    const idToPause = targetId || this.getActiveTimer()?.id || null;
    if (!idToPause) return;

    const timer = this.timers.get(idToPause);
    if (!timer) return;

    // If already paused, resume the timer
    if (timer.status === 'paused') {
      const now = new Date();
      (timer as unknown as { lastWallClockTime: number }).lastWallClockTime = now.getTime();

      if (timer.remainingSeconds > 0) {
        timer.endTime = calculateEndTime(timer.remainingSeconds, now);
      }

      const isCountUp = timer.type === 'count_up' || timer.type === 'stopwatch' || timer.type === 'digital_clock';
      timer.status = !isCountUp && timer.remainingSeconds <= 0 ? 'overtime' : 'running';

      if (!activeList || activeList.timerIds.includes(idToPause)) {
        this.activeTimerId = idToPause;
      }
      this.runningTimerIds.add(idToPause);
      this.ensureTickerRunning();
      this.recordTimerStart(timer, true);

      this.saveTimerToStorage(timer);
      this.notifySubscribers();
      return;
    }

    if (timer.status !== 'running' && timer.status !== 'overtime') return;

    // Advance up to the exact moment of pause to ensure zero lost time
    const now = Date.now();
    const lastWall = (timer as unknown as { lastWallClockTime?: number }).lastWallClockTime || now;
    const deltaMs = now - lastWall;
    const virtualDeltaSec = (deltaMs / 1000) * ((timer.speed || 100) / 100);

    timer.elapsedSeconds += virtualDeltaSec;
    this.updateComputedSeconds(timer);

    timer.status = 'paused';
    (timer as unknown as { lastWallClockTime: number }).lastWallClockTime = now;

    this.runningTimerIds.delete(idToPause);
    this.checkStopTicker();
    this.recordTimerPause(timer);

    this.saveTimerToStorage(timer);
    this.notifySubscribers();
  }

  /**
   * RESTART: Reset the timer to its original configured duration and start it again immediately.
   * Ensures alerts can trigger again after restarting.
   */
  public restart(targetId?: string): void {
    const activeList = this.lists.get(this.activeListId);
    const idToRestart = targetId || this.getActiveTimer()?.id || this.getCuedTimer()?.id || null;
    if (!idToRestart) return;

    const timer = this.timers.get(idToRestart);
    if (!timer) return;

    if (
      this.activeLogIdByTimerId.has(idToRestart) ||
      timer.status === 'running' ||
      timer.status === 'paused' ||
      timer.status === 'overtime'
    ) {
      this.recordTimerStop(timer, 'stopped');
    }

    const now = new Date();
    timer.startTime = formatClock(now, true);
    timer.endTime = calculateEndTime(timer.durationSeconds, now);

    // Reset to starting values and clear triggered alert states
    timer.elapsedSeconds = 0;
    timer.triggeredAlertIds = [];
    (timer as unknown as { endActionTriggered?: boolean }).endActionTriggered = false;

    if (timer.type === 'count_up' || timer.type === 'stopwatch') {
      timer.remainingSeconds = timer.durationSeconds;
    } else if (timer.type === 'digital_clock') {
      timer.elapsedSeconds = 0;
      timer.remainingSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    } else {
      timer.remainingSeconds = timer.durationSeconds;
    }

    timer.status = 'running';
    (timer as unknown as { lastWallClockTime: number }).lastWallClockTime = now.getTime();

    if (!activeList || activeList.timerIds.includes(idToRestart)) {
      this.activeTimerId = idToRestart;
      this.cuedTimerId = idToRestart;
    }
    this.runningTimerIds.add(idToRestart);
    this.ensureTickerRunning();
    this.recordTimerStart(timer, false);

    this.saveTimerToStorage(timer);
    this.notifySubscribers();
  }

  /**
   * CUE / SELECT: Select a cue by clicking it without starting the countup or countdown
   * to be an active cue. The only way to make a cue active is when the user hits the start button.
   */
  public cue(targetId: string): void {
    const timer = this.timers.get(targetId);
    if (!timer || timer.type === 'spacer') return;

    // Set this as the selected/cued timer
    this.cuedTimerId = targetId;

    // Do NOT set activeTimerId. The only way to make a cue active is when the user hits the start button.
    // If another timer is actively running, that running timer continues uninterrupted.

    // If this timer is not running, prime its initial display values without starting
    if (timer.status !== 'running') {
      timer.elapsedSeconds = 0;
      timer.status = 'cued';
      timer.triggeredAlertIds = [];
      (timer as unknown as { endActionTriggered?: boolean }).endActionTriggered = false;

      if (timer.type !== 'empty') {
        const now = new Date();
        timer.endTime = calculateEndTime(timer.durationSeconds, now);

        if (timer.type === 'count_up') {
          timer.remainingSeconds = timer.startingValueSeconds || 0;
        } else if (timer.type === 'stopwatch') {
          timer.remainingSeconds = 0;
        } else if (timer.type === 'digital_clock') {
          timer.remainingSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        } else {
          timer.remainingSeconds = timer.durationSeconds;
        }
      }

      this.saveTimerToStorage(timer);
    }

    this.notifySubscribers();
  }

  /**
   * MOVE CUE NEXT:
   * Moves the cued highlight in order through the timer list,
   * without moving or interrupting the active selected view or running timer.
   */
  public moveNextCue(): void {
    const list = this.lists.get(this.activeListId);
    if (!list || list.timerIds.length === 0) return;

    // Use current cuedTimerId if set, otherwise fallback to activeTimerId or first item
    const baseId = this.cuedTimerId || this.activeTimerId || list.timerIds[0];
    const currentIndex = list.timerIds.indexOf(baseId);
    let nextId: string | null = null;
    for (let step = 1; step <= list.timerIds.length; step++) {
      const candidateId = list.timerIds[(currentIndex + step) % list.timerIds.length];
      const candidate = this.timers.get(candidateId);
      if (candidate && candidate.type !== 'spacer') {
        nextId = candidateId;
        break;
      }
    }
    if (!nextId) return;

    // Only highlight the cue in order without moving the active selected view
    this.cuedTimerId = nextId;

    const cuedTimer = this.timers.get(nextId);
    if (cuedTimer && cuedTimer.status !== 'running' && cuedTimer.type !== 'empty') {
      const now = new Date();
      cuedTimer.endTime = calculateEndTime(cuedTimer.durationSeconds, now);
      this.saveTimerToStorage(cuedTimer);
    }

    this.notifySubscribers();
  }

  /**
   * MOVE CUE PREV:
   * Moves the cued highlight backwards in order through the timer list,
   * without moving or interrupting the active selected view or running timer.
   */
  public movePrevCue(): void {
    const list = this.lists.get(this.activeListId);
    if (!list || list.timerIds.length === 0) return;

    const baseId = this.cuedTimerId || this.activeTimerId || list.timerIds[0];
    const currentIndex = list.timerIds.indexOf(baseId);
    let prevId: string | null = null;
    for (let step = 1; step <= list.timerIds.length; step++) {
      const candidateId = list.timerIds[(currentIndex - step + list.timerIds.length) % list.timerIds.length];
      const candidate = this.timers.get(candidateId);
      if (candidate && candidate.type !== 'spacer') {
        prevId = candidateId;
        break;
      }
    }
    if (!prevId) return;

    // Only highlight the cue in order without moving the active selected view
    this.cuedTimerId = prevId;

    const cuedTimer = this.timers.get(prevId);
    if (cuedTimer && cuedTimer.status !== 'running' && cuedTimer.type !== 'empty') {
      const now = new Date();
      cuedTimer.endTime = calculateEndTime(cuedTimer.durationSeconds, now);
      this.saveTimerToStorage(cuedTimer);
    }

    this.notifySubscribers();
  }

  public skipEvent(): void {
    this.moveNextCue();
  }

  public moveToPrevEvent(): void {
    this.movePrevCue();
  }

  public cueNext(): void {
    this.moveNextCue();
  }

  public cuePrev(): void {
    this.movePrevCue();
  }

  public togglePlayPause(targetId?: string): void {
    const id = targetId || this.activeTimerId;
    if (!id) {
      this.start();
      return;
    }

    const timer = this.timers.get(id);
    if (timer?.status === 'running' || timer?.status === 'overtime') {
      this.pause(id);
    } else {
      this.start(id);
    }
  }

  // ===========================================================================
  // DURATION CONTROLS
  // ===========================================================================

  /**
   * Increase or decrease duration by specified delta (default 60s / 1 min).
   */
  public adjustDuration(secondsDelta: number, targetId?: string): void {
    const id = targetId || this.activeTimerId || this.cuedTimerId;
    if (!id) return;

    const timer = this.timers.get(id);
    if (!timer) return;

    timer.durationSeconds = Math.max(5, timer.durationSeconds + secondsDelta);

    if (timer.type === 'countdown' || timer.type === 'count_down' || timer.type === 'meeting_timer') {
      if (timer.status === 'idle' || timer.status === 'cued') {
        timer.remainingSeconds = timer.durationSeconds;
      } else {
        timer.remainingSeconds = timer.durationSeconds - timer.elapsedSeconds;
      }

      if (timer.remainingSeconds > 0) {
        timer.endTime = calculateEndTime(timer.remainingSeconds, new Date());

        // If the added time passes overtime, return the timer to normal running time
        if (timer.status === 'overtime') {
          timer.status = 'running';
          (timer as unknown as { lastWallClockTime: number }).lastWallClockTime = Date.now();
          this.runningTimerIds.add(timer.id);
          this.ensureTickerRunning();
        }

        // Reset triggered alerts whose threshold is now below current remaining time
        if (timer.triggeredAlertIds && timer.triggeredAlertIds.length > 0) {
          timer.triggeredAlertIds = timer.triggeredAlertIds.filter((alertId) => {
            if (alertId === 'alert1' && timer.alert1 && timer.remainingSeconds > timer.alert1.timeSeconds) {
              return false;
            }
            if (alertId === 'alert2' && timer.alert2 && timer.remainingSeconds > timer.alert2.timeSeconds) {
              return false;
            }
            return true;
          });
        }
      } else if (timer.status === 'running') {
        this.handleTimerCompletion(timer);
      }
    }

    this.saveTimerToStorage(timer);
    this.notifySubscribers();
  }

  /**
   * Manual duration editing (e.g. user types new duration HH:MM:SS directly).
   */
  public setTimerDuration(targetId: string, newDurationSec: number): void {
    const timer = this.timers.get(targetId);
    if (!timer) return;

    const clampedSec = Math.max(1, newDurationSec);
    timer.durationSeconds = clampedSec;

    // If timer has not run or is idle/cued, update remaining to match
    if (timer.elapsedSeconds === 0 || timer.status === 'idle' || timer.status === 'cued') {
      timer.remainingSeconds = clampedSec;
    } else if (timer.type === 'countdown' || timer.type === 'count_down' || timer.type === 'meeting_timer') {
      timer.remainingSeconds = timer.durationSeconds - timer.elapsedSeconds;
      if (timer.remainingSeconds > 0 && timer.status === 'overtime') {
        timer.status = 'running';
        (timer as unknown as { lastWallClockTime: number }).lastWallClockTime = Date.now();
        this.runningTimerIds.add(timer.id);
        this.ensureTickerRunning();
      }
    }

    this.saveTimerToStorage(timer);
    this.notifySubscribers();
  }

  /**
   * Configurable adjustment increment (e.g. 15s, 30s, 60s, 300s).
   */
  public setAdjustmentIncrement(incrementSeconds: number): void {
    this.durationIncrementSeconds = Math.max(1, incrementSeconds);
  }

  public getAdjustmentIncrement(): number {
    return this.durationIncrementSeconds;
  }

  // ===========================================================================
  // SPEED CONTROL (1% to 200%)
  // ===========================================================================

  /**
   * Adjust timer playback speed between 1% and 200%.
   * 100% = normal speed (1.0x).
   * 50% = half speed (0.5x).
   * 200% = twice as fast (2.0x).
   */
  public setSpeed(speedPercent: number, targetId?: string): void {
    const clampedSpeed = Math.max(1, Math.min(200, Math.round(speedPercent)));
    const id = targetId || this.activeTimerId;

    if (id) {
      const timer = this.timers.get(id);
      if (timer) {
        timer.speed = clampedSpeed;
        this.saveTimerToStorage(timer);
      }
    }

    this.notifySubscribers();
  }

  // ===========================================================================
  // STOPWATCH LAP FUNCTIONALITY
  // ===========================================================================

  /**
   * Record a lap split for a stopwatch timer.
   */
  public recordLap(targetId?: string): StopwatchLap | null {
    const id = targetId || this.activeTimerId;
    if (!id) return null;

    const timer = this.timers.get(id);
    if (!timer) return null;

    if (!timer.laps) {
      timer.laps = [];
    }

    const lapNumber = timer.laps.length + 1;
    const overallTimeSeconds = timer.elapsedSeconds;
    const lastLapOverall = timer.laps.length > 0 ? timer.laps[timer.laps.length - 1].overallTimeSeconds : 0;
    const lapTimeSeconds = Math.max(0, overallTimeSeconds - lastLapOverall);

    const newLap: StopwatchLap = {
      lapNumber,
      lapTimeSeconds,
      overallTimeSeconds,
      timestamp: Date.now(),
    };

    timer.laps.push(newLap);
    this.saveTimerToStorage(timer);
    this.notifySubscribers();
    return newLap;
  }

  public resetLaps(targetId?: string): void {
    const id = targetId || this.activeTimerId;
    if (!id) return;
    const timer = this.timers.get(id);
    if (!timer) return;
    timer.laps = [];
    this.saveTimerToStorage(timer);
    this.notifySubscribers();
  }

  // ===========================================================================
  // DRIFT-FREE MULTI-TIMER TICK ENGINE
  // ===========================================================================

  private ensureTickerRunning(): void {
    if (this.intervalHandle === null) {
      this.intervalHandle = window.setInterval(() => {
        this.tickAllRunning();
      }, this.TICK_RATE_MS);
    }
  }

  private checkStopTicker(): void {
    if (this.runningTimerIds.size === 0 && this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Advances all currently running timers using wall-clock timestamp delta calculation.
   * Completely immune to setInterval delay variations and browser tab throttling.
   */
  private tickAllRunning(): void {
    if (this.runningTimerIds.size === 0) return;

    const now = Date.now();
    const completedTimers: TimerItem[] = [];

    this.runningTimerIds.forEach((id) => {
      const timer = this.timers.get(id);
      if (!timer || (timer.status !== 'running' && timer.status !== 'overtime')) {
        this.runningTimerIds.delete(id);
        return;
      }

      const timerObj = timer as unknown as { lastWallClockTime?: number };
      const lastWall = timerObj.lastWallClockTime || now;
      timerObj.lastWallClockTime = now;

      const deltaMs = now - lastWall;
      const speedMultiplier = (timer.speed || 100) / 100;
      const virtualDeltaSec = (deltaMs / 1000) * speedMultiplier;

      timer.elapsedSeconds += virtualDeltaSec;
      const isComplete = this.updateComputedSeconds(timer);

      // Update live elapsed seconds in active run log entry
      const activeLogId = this.activeLogIdByTimerId.get(timer.id);
      if (activeLogId) {
        const logEntry = this.runLogs.find((l) => l.id === activeLogId);
        if (logEntry) {
          logEntry.elapsedSeconds = Math.max(0, Math.round(timer.elapsedSeconds));
        }
      }

      if (!isComplete && timer.status === 'overtime') {
        timer.status = 'running';
      }

      // Check all alerts for this timer (only triggers once per run)
      this.checkTimerAlerts(timer);

      if (isComplete && timer.status !== 'overtime') {
        completedTimers.push(timer);
      }
    });

    completedTimers.forEach((t) => this.handleTimerCompletion(t));
    this.notifySubscribers();
  }

  /**
   * Updates remaining and display seconds based on timer type.
   * Returns true if timer has hit its target completion point.
   */
  private updateComputedSeconds(timer: TimerItem): boolean {
    const tType = timer.type;

    if (tType === 'count_up') {
      // Counts upwards towards duration
      const startingVal = timer.startingValueSeconds || 0;
      const currentVal = startingVal + timer.elapsedSeconds;
      timer.remainingSeconds = currentVal;
      return timer.durationSeconds > 0 && currentVal >= timer.durationSeconds;
    } else if (tType === 'stopwatch') {
      // Free-running elapsed count
      timer.remainingSeconds = timer.elapsedSeconds;
      return false;
    } else if (tType === 'digital_clock') {
      // Real-time clock of the day
      const d = new Date();
      timer.remainingSeconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      return false;
    } else {
      // Countdown / meeting_timer
      const currentRemaining = timer.durationSeconds - timer.elapsedSeconds;
      timer.remainingSeconds = currentRemaining;
      return currentRemaining <= 0;
    }
  }

  private checkTimerAlerts(timer: TimerItem): void {
    if (timer.status !== 'running') return;
    if (timer.type !== 'countdown' && timer.type !== 'count_down' && timer.type !== 'meeting_timer') return;

    if (!timer.triggeredAlertIds) {
      timer.triggeredAlertIds = [];
    }

    const remaining = timer.remainingSeconds;

    // Alert 1
    if (timer.alert1 && !timer.triggeredAlertIds.includes('alert1')) {
      if (remaining <= timer.alert1.timeSeconds && remaining > 0) {
        timer.triggeredAlertIds.push('alert1');
      }
    }

    // Alert 2
    if (timer.alert2 && !timer.triggeredAlertIds.includes('alert2')) {
      if (remaining <= timer.alert2.timeSeconds && remaining > 0) {
        timer.triggeredAlertIds.push('alert2');
      }
    }
  }

  private handleTimerCompletion(timer: TimerItem): void {
    const ownerList = this.findListForTimer(timer.id);

    // Process standard end action
    switch (timer.endAction) {
      case 'blackout':
        this.recordTimerStop(timer, 'completed');
        timer.status = 'completed';
        this.runningTimerIds.delete(timer.id);
        this.checkStopTicker();
        if (!ownerList || ownerList.id === this.activeListId) {
          this.triggerBlackout(true);
        }
        break;
      case 'next_timer': {
        this.recordTimerStop(timer, 'completed');
        timer.status = 'completed';
        this.runningTimerIds.delete(timer.id);
        if (ownerList && ownerList.timerIds.length > 0) {
          const currentIdx = ownerList.timerIds.indexOf(timer.id);
          let nextId: string | null = null;
          for (let step = 1; step <= ownerList.timerIds.length; step++) {
            const candidateId = ownerList.timerIds[(currentIdx + step) % ownerList.timerIds.length];
            const candidate = this.timers.get(candidateId);
            if (candidate && candidate.type !== 'spacer' && candidateId !== timer.id) {
              nextId = candidateId;
              break;
            }
          }
          if (nextId) {
            this.start(nextId);
          } else {
            this.checkStopTicker();
          }
        } else {
          this.checkStopTicker();
        }
        break;
      }
      case 'loop':
        this.recordTimerStop(timer, 'completed');
        this.restart(timer.id);
        break;
      case 'stop':
        // If explicitly requested to stop, complete and stop ticker
        this.recordTimerStop(timer, 'completed');
        timer.status = 'completed';
        this.runningTimerIds.delete(timer.id);
        this.checkStopTicker();
        break;
      case 'count_up':
      case 'none':
      default:
        // Overtime mode: continues ticking upward in overtime elapsed time
        timer.status = 'overtime';
        break;
    }

    this.saveTimerToStorage(timer);
  }

  private saveTimerToStorage(timer: TimerItem): void {
    timer.updatedAt = Date.now();
    storageService.saveTimer(timer);
  }

  // ===========================================================================
  // UNDO / REDO HISTORY ENGINE (Cue Lists & Cues)
  // ===========================================================================

  private undoStack: Array<{
    actionLabel: string;
    lists: TimerList[];
    timers: TimerItem[];
    activeListId: string;
    activeTimerId: string | null;
    cuedTimerId: string | null;
  }> = [];

  private redoStack: Array<{
    actionLabel: string;
    lists: TimerList[];
    timers: TimerItem[];
    activeListId: string;
    activeTimerId: string | null;
    cuedTimerId: string | null;
  }> = [];

  private readonly MAX_HISTORY = 50;

  private captureHistoryState(actionLabel: string) {
    const clonedLists: TimerList[] = Array.from(this.lists.values()).map((l) => ({
      ...l,
      timerIds: [...l.timerIds],
    }));

    const clonedTimers: TimerItem[] = Array.from(this.timers.values()).map((t) => ({
      ...t,
      alert1: t.alert1 ? { ...t.alert1 } : undefined,
      alert2: t.alert2 ? { ...t.alert2 } : undefined,
      laps: t.laps ? t.laps.map((lap) => ({ ...lap })) : [],
      triggeredAlertIds: t.triggeredAlertIds ? [...t.triggeredAlertIds] : undefined,
    }));

    return {
      actionLabel,
      lists: clonedLists,
      timers: clonedTimers,
      activeListId: this.activeListId,
      activeTimerId: this.activeTimerId,
      cuedTimerId: this.cuedTimerId,
    };
  }

  private pushHistory(actionLabel: string): void {
    if (!this.isInitialized) return;
    this.undoStack.push(this.captureHistoryState(actionLabel));
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private applyHistoryState(entry: {
    actionLabel: string;
    lists: TimerList[];
    timers: TimerItem[];
    activeListId: string;
    activeTimerId: string | null;
    cuedTimerId: string | null;
  }): void {
    const previousRunningTimers = new Map<string, TimerItem>();
    this.runningTimerIds.forEach((tid) => {
      const t = this.timers.get(tid);
      if (t) previousRunningTimers.set(tid, t);
    });

    this.lists.clear();
    entry.lists.forEach((l) => {
      this.lists.set(l.id, { ...l, timerIds: [...l.timerIds] });
    });

    this.timers.clear();
    entry.timers.forEach((t) => {
      const liveTimer = previousRunningTimers.get(t.id);
      if (liveTimer && (liveTimer.status === 'running' || liveTimer.status === 'overtime')) {
        // Preserve live ticking progress for timers that remained running across the undo/redo
        this.timers.set(t.id, {
          ...t,
          status: liveTimer.status,
          elapsedSeconds: liveTimer.elapsedSeconds,
          remainingSeconds: liveTimer.remainingSeconds,
        });
      } else {
        this.timers.set(t.id, {
          ...t,
          status: t.status === 'running' || t.status === 'overtime' ? 'paused' : t.status,
          alert1: t.alert1 ? { ...t.alert1 } : undefined,
          alert2: t.alert2 ? { ...t.alert2 } : undefined,
          laps: t.laps ? t.laps.map((lap) => ({ ...lap })) : [],
        });
      }
    });

    // Clean up runningTimerIds for any timer that no longer exists
    Array.from(this.runningTimerIds).forEach((tid) => {
      if (!this.timers.has(tid)) {
        this.runningTimerIds.delete(tid);
      }
    });
    this.checkStopTicker();

    if (this.lists.has(entry.activeListId)) {
      this.activeListId = entry.activeListId;
    } else {
      const firstList = this.getAllLists()[0];
      this.activeListId = firstList ? firstList.id : 'list_1';
    }

    const activeList = this.lists.get(this.activeListId);
    this.activeTimerId =
      entry.activeTimerId && this.timers.has(entry.activeTimerId) ? entry.activeTimerId : null;
    this.cuedTimerId =
      entry.cuedTimerId && this.timers.has(entry.cuedTimerId)
        ? entry.cuedTimerId
        : activeList?.timerIds[0] || null;

    storageService.replaceAllListsAndTimers(
      this.getAllLists(),
      Array.from(this.timers.values())
    );

    this.notifySubscribers();
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const entry = this.undoStack.pop()!;
    this.redoStack.push(this.captureHistoryState(entry.actionLabel));
    this.applyHistoryState(entry);
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const entry = this.redoStack.pop()!;
    this.undoStack.push(this.captureHistoryState(entry.actionLabel));
    this.applyHistoryState(entry);
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoLabel(): string | null {
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1].actionLabel
      : null;
  }

  public getRedoLabel(): string | null {
    return this.redoStack.length > 0
      ? this.redoStack[this.redoStack.length - 1].actionLabel
      : null;
  }

  // ===========================================================================
  // CRUD & LIST MANAGEMENT
  // ===========================================================================

  public addTimer(timerData: Partial<TimerItem>): TimerItem {
    this.pushHistory(`Add Cue "${timerData.name || timerData.type || 'Timer'}"`);
    const prefs = storageService.getPreferences();
    const list = this.lists.get(this.activeListId);
    const order = list ? list.timerIds.length : 0;

    const resolvedType =
      timerData.type ||
      (prefs.defaultNewTimerType === 'end_time'
        ? 'countdown'
        : prefs.defaultNewTimerType) ||
      'countdown';

    const isSpecialRow = resolvedType === 'empty' || resolvedType === 'spacer';
    const prefDefaultDur =
      prefs.defaultDurationEnabled !== false ? (prefs.defaultDurationSeconds ?? 600) : 0;
    const durSec = timerData.durationSeconds ?? (isSpecialRow ? 0 : prefDefaultDur);

    const defaultAlert1: TimerAlert | undefined = isSpecialRow
      ? undefined
      : timerData.alert1 !== undefined
      ? timerData.alert1
      : prefs.defaultAlert1Enabled !== false
      ? {
          id: generateId('alt'),
          timeSeconds: prefs.defaultWarningSeconds ?? 90,
          color: '#eab308',
          flash: false,
          soundEnabled: false,
          label: 'Alert 1 (Warning)',
        }
      : undefined;

    const defaultAlert2: TimerAlert | undefined = isSpecialRow
      ? undefined
      : timerData.alert2 !== undefined
      ? timerData.alert2
      : prefs.defaultAlert2Enabled
      ? {
          id: generateId('alt'),
          timeSeconds: prefs.defaultDangerSeconds ?? 30,
          color: '#ef4444',
          flash: true,
          soundEnabled: false,
          label: 'Alert 2 (Danger)',
        }
      : undefined;

    const newTimer: TimerItem = {
      id: generateId('t'),
      name: timerData.name !== undefined ? timerData.name : `Timer ${order + 1}`,
      order,
      durationSeconds: durSec,
      elapsedSeconds: 0,
      remainingSeconds: durSec,
      type: resolvedType,
      status: 'idle',
      speed: isSpecialRow ? (timerData.speed ?? 0) : Math.max(1, Math.min(200, timerData.speed || 100)),
      alert1: defaultAlert1,
      alert2: defaultAlert2,
      endAction:
        timerData.endAction ||
        (isSpecialRow ? 'none' : prefs.defaultNewTimerEndAction || 'count_up'),
      laps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...timerData,
    };

    this.timers.set(newTimer.id, newTimer);

    if (list) {
      list.timerIds.push(newTimer.id);
      storageService.saveList(list);
    }

    storageService.saveTimer(newTimer);

    if (!this.cuedTimerId && newTimer.type !== 'spacer') {
      this.cue(newTimer.id);
    }

    this.notifySubscribers();
    return newTimer;
  }

  public updateTimer(id: string, updates: Partial<TimerItem>): void {
    const existing = this.timers.get(id);
    if (!existing) return;
    this.pushHistory(`Edit Cue "${existing.name || 'Cue'}"`);

    const updated: TimerItem = {
      ...existing,
      ...updates,
      speed: updates.speed !== undefined
        ? Math.max(1, Math.min(200, updates.speed))
        : (existing.speed || (updates.type && updates.type !== 'empty' && updates.type !== 'spacer' ? 100 : existing.speed)),
      updatedAt: Date.now(),
    };

    // If duration was changed and timer hasn't run, sync remaining
    if (updates.durationSeconds !== undefined && existing.elapsedSeconds === 0) {
      updated.remainingSeconds = updates.durationSeconds;
    }

    // If timer type was changed while not running, prime its initial counter display
    if (updates.type !== undefined && existing.status !== 'running' && existing.status !== 'overtime') {
      updated.elapsedSeconds = 0;
      if (existing.type === 'empty' && updates.type !== 'empty' && updates.type !== 'spacer') {
        if (!updated.speed) updated.speed = 100;
        if (updated.endAction === 'none' && updates.endAction === undefined) {
          updated.endAction = 'count_up';
        }
      }
      if (updated.type === 'count_up' || updated.type === 'stopwatch') {
        updated.remainingSeconds = updated.startingValueSeconds || 0;
      } else if (updated.type === 'digital_clock') {
        const now = new Date();
        updated.remainingSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      } else if (updated.type === 'empty' || updated.type === 'spacer') {
        updated.remainingSeconds = 0;
      } else {
        if (updated.durationSeconds <= 0) {
          updated.durationSeconds = 300;
        }
        updated.remainingSeconds = updated.durationSeconds;
      }
    }

    this.timers.set(id, updated);
    this.saveTimerToStorage(updated);
    this.notifySubscribers();
  }

  public deleteTimer(id: string): void {
    const existing = this.timers.get(id);
    if (!existing) return;
    this.pushHistory(`Delete Cue "${existing.name || 'Cue'}"`);

    this.runningTimerIds.delete(id);
    this.checkStopTicker();

    this.timers.delete(id);
    const list = this.lists.get(this.activeListId);
    if (list) {
      list.timerIds = list.timerIds.filter(tid => tid !== id);
      storageService.saveList(list);
    }

    storageService.deleteTimer(id);

    if (this.activeTimerId === id) {
      this.activeTimerId = list?.timerIds[0] || null;
    }
    if (this.cuedTimerId === id) {
      this.cuedTimerId = list?.timerIds[0] || null;
    }

    this.notifySubscribers();
  }

  public duplicateTimer(id: string): TimerItem | null {
    const original = this.timers.get(id);
    if (!original) return null;

    const list = this.lists.get(this.activeListId);
    if (!list) return null;

    this.pushHistory(`Duplicate Cue "${original.name || 'Cue'}"`);

    const originalIdx = list.timerIds.indexOf(id);
    const insertIdx = originalIdx >= 0 ? originalIdx + 1 : list.timerIds.length;

    const newTimer: TimerItem = {
      ...original,
      id: generateId('t'),
      name: `${original.name} (Copy)`,
      order: insertIdx,
      status: 'idle',
      elapsedSeconds: 0,
      remainingSeconds: original.durationSeconds,
      laps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.timers.set(newTimer.id, newTimer);
    list.timerIds.splice(insertIdx, 0, newTimer.id);

    // Update order values for all timers in the list
    list.timerIds.forEach((tid, idx) => {
      const t = this.timers.get(tid);
      if (t) {
        t.order = idx;
        storageService.saveTimer(t);
      }
    });

    storageService.saveList(list);
    this.cue(newTimer.id);
    this.notifySubscribers();
    return newTimer;
  }

  private clipboardTimer: TimerItem | null = null;

  public copySelectedTimer(id?: string): TimerItem | null {
    const targetId = id || this.cuedTimerId || this.activeTimerId;
    if (!targetId) return null;
    const timer = this.timers.get(targetId);
    if (!timer) return null;
    this.clipboardTimer = { ...timer };
    this.notifySubscribers();
    return this.clipboardTimer;
  }

  public cutSelectedTimer(id?: string): TimerItem | null {
    const targetId = id || this.cuedTimerId || this.activeTimerId;
    if (!targetId) return null;
    const copied = this.copySelectedTimer(targetId);
    if (copied) {
      this.deleteTimer(targetId);
    }
    return copied;
  }

  public pasteTimer(): TimerItem | null {
    if (!this.clipboardTimer) return null;
    return this.duplicateTimer(this.clipboardTimer.id);
  }

  public deleteSelectedTimer(id?: string): void {
    const targetId = id || this.cuedTimerId || this.activeTimerId;
    if (!targetId) return;
    this.deleteTimer(targetId);
  }

  public hasClipboardTimer(): boolean {
    return !!this.clipboardTimer;
  }

  public reorderTimers(sourceIndex: number, destinationIndex: number): void {
    const list = this.lists.get(this.activeListId);
    if (!list) return;

    if (
      sourceIndex < 0 || 
      sourceIndex >= list.timerIds.length || 
      destinationIndex < 0 || 
      destinationIndex >= list.timerIds.length ||
      sourceIndex === destinationIndex
    ) {
      return;
    }

    this.pushHistory('Reorder Cues');
    const [movedId] = list.timerIds.splice(sourceIndex, 1);
    list.timerIds.splice(destinationIndex, 0, movedId);

    // Update order field and persist
    list.timerIds.forEach((tid, idx) => {
      const t = this.timers.get(tid);
      if (t) {
        t.order = idx;
        storageService.saveTimer(t);
      }
    });

    storageService.saveList(list);
    this.notifySubscribers();
  }

  public renameTimer(id: string, newName: string): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    if (timer.name === newName.trim()) return;
    this.pushHistory(`Rename Cue "${timer.name}"`);
    timer.name = newName.trim();
    timer.updatedAt = Date.now();
    storageService.saveTimer(timer);
    this.notifySubscribers();
  }

  /**
   * Switch between lists WITHOUT stopping any running timers.
   * Timers in all other lists continue to tick independently.
   */
  public switchList(listId: string): void {
    if (!this.lists.has(listId)) return;
    this.activeListId = listId;

    const list = this.lists.get(listId)!;
    
    // Check if any timer in the newly selected list is currently running or paused
    const runningTimerInList = list.timerIds.find(tid => this.runningTimerIds.has(tid));
    const pausedTimerInList = list.timerIds.find(tid => this.timers.get(tid)?.status === 'paused');
    const cuedTimerInList = list.timerIds.find(tid => this.timers.get(tid)?.status === 'cued');

    if (runningTimerInList) {
      this.activeTimerId = runningTimerInList;
      this.cuedTimerId = cuedTimerInList || runningTimerInList;
    } else if (pausedTimerInList) {
      this.activeTimerId = pausedTimerInList;
      this.cuedTimerId = cuedTimerInList || pausedTimerInList;
    } else if (list.timerIds.length > 0) {
      this.activeTimerId = null;
      this.cuedTimerId = cuedTimerInList || list.timerIds[0];
    } else {
      this.activeTimerId = null;
      this.cuedTimerId = null;
    }

    // Crucial: All timers in this.runningTimerIds remain active and continue ticking uninterrupted
    this.notifySubscribers();
  }

  /**
   * 1. Create a new list.
   */
  public addList(name?: string, description?: string): TimerList {
    const sortedLists = this.getAllLists();
    const listNumber = sortedLists.length + 1;
    const finalName = (name && name.trim()) ? name.trim() : `List ${listNumber}`;
    this.pushHistory(`Add Cue List "${finalName}"`);
    const id = generateId('list');
    
    const maxOrder = sortedLists.reduce((max, l) => Math.max(max, l.order ?? 0), -1);

    const newList: TimerList = {
      id,
      name: finalName,
      description: description || '',
      order: maxOrder + 1,
      timerIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.lists.set(id, newList);
    storageService.saveList(newList);
    this.switchList(id);
    return newList;
  }

  /**
   * 2. Rename list.
   */
  public renameList(listId: string, newName: string): void {
    const list = this.lists.get(listId);
    if (!list) return;
    const trimmed = newName.trim();
    if (!trimmed || list.name === trimmed) return;

    this.pushHistory(`Rename Cue List "${list.name}"`);
    list.name = trimmed;
    list.updatedAt = Date.now();
    storageService.saveList(list);
    this.notifySubscribers();
  }

  /**
   * 3. Delete list (maintains at least 1 list at all times).
   */
  public deleteList(listId: string): boolean {
    if (this.lists.size <= 1) {
      return false; // Cannot delete the sole remaining list
    }

    const listToDelete = this.lists.get(listId);
    if (!listToDelete) return false;

    this.pushHistory(`Delete Cue List "${listToDelete.name}"`);

    // If deleting the active list, switch to an adjacent list first
    if (this.activeListId === listId) {
      const allLists = this.getAllLists();
      const currentIndex = allLists.findIndex(l => l.id === listId);
      const nextIndex = currentIndex > 0 ? currentIndex - 1 : 1;
      const targetList = allLists[nextIndex];
      if (targetList) {
        this.switchList(targetList.id);
      }
    }

    // Remove all timers belonging to this list
    listToDelete.timerIds.forEach(tid => {
      this.runningTimerIds.delete(tid);
      this.timers.delete(tid);
      storageService.deleteTimer(tid);
    });

    this.lists.delete(listId);
    storageService.deleteList(listId);

    // Normalize remaining list orders
    const remainingLists = this.getAllLists();
    remainingLists.forEach((l, idx) => {
      l.order = idx;
    });
    storageService.saveListsBatch(remainingLists);

    this.checkStopTicker();
    this.notifySubscribers();
    return true;
  }

  /**
   * 4. Duplicate list (deep clones list and all timers with new unique IDs).
   */
  public duplicateList(listId: string): TimerList | null {
    const original = this.lists.get(listId);
    if (!original) return null;

    this.pushHistory(`Duplicate Cue List "${original.name}"`);
    const sortedLists = this.getAllLists();
    const originalIndex = sortedLists.findIndex(l => l.id === listId);

    const newId = generateId('list');
    const newTimerIds: string[] = [];
    const newTimers: TimerItem[] = [];

    // Clone all timers in the original list
    original.timerIds.forEach((oldTimerId, idx) => {
      const oldTimer = this.timers.get(oldTimerId);
      if (oldTimer) {
        const clonedTimerId = generateId('t');
        const clonedTimer: TimerItem = {
          ...oldTimer,
          id: clonedTimerId,
          order: idx,
          status: 'idle',
          elapsedSeconds: 0,
          remainingSeconds: oldTimer.durationSeconds,
          laps: [],
          createdAt: Date.now() + idx,
          updatedAt: Date.now() + idx,
        };
        this.timers.set(clonedTimerId, clonedTimer);
        newTimers.push(clonedTimer);
        newTimerIds.push(clonedTimerId);
      }
    });

    if (newTimers.length > 0) {
      storageService.saveTimersBatch(newTimers);
    }

    const duplicatedList: TimerList = {
      id: newId,
      name: `${original.name} (Copy)`,
      description: original.description || '',
      order: (original.order ?? originalIndex) + 1,
      timerIds: newTimerIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Insert duplicated list right after original in list array
    sortedLists.splice(originalIndex + 1, 0, duplicatedList);
    sortedLists.forEach((l, idx) => {
      l.order = idx;
      this.lists.set(l.id, l);
    });

    storageService.saveListsBatch(sortedLists);
    this.switchList(newId);
    return duplicatedList;
  }

  /**
   * 5. Rearrange lists (reorder list tabs).
   */
  public reorderLists(sourceIndex: number, destinationIndex: number): void {
    const sorted = this.getAllLists();
    if (
      sourceIndex < 0 || 
      sourceIndex >= sorted.length || 
      destinationIndex < 0 || 
      destinationIndex >= sorted.length ||
      sourceIndex === destinationIndex
    ) {
      return;
    }

    this.pushHistory('Reorder Cue Lists');
    const [moved] = sorted.splice(sourceIndex, 1);
    sorted.splice(destinationIndex, 0, moved);

    sorted.forEach((l, idx) => {
      l.order = idx;
      this.lists.set(l.id, l);
    });

    storageService.saveListsBatch(sorted);
    this.notifySubscribers();
  }

  /**
   * Move list left or right.
   */
  public moveList(listId: string, direction: 'left' | 'right'): void {
    const sorted = this.getAllLists();
    const currentIndex = sorted.findIndex(l => l.id === listId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < sorted.length) {
      this.reorderLists(currentIndex, targetIndex);
    }
  }

  /**
   * 7. Save / Export individual list to structured JSON.
   */
  public exportList(listId: string): ListExportData | null {
    const list = this.lists.get(listId);
    if (!list) return null;

    const listTimers = list.timerIds
      .map(tid => this.timers.get(tid))
      .filter((t): t is TimerItem => Boolean(t));

    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      type: 'single_list',
      list,
      timers: listTimers,
    };
  }

  /**
   * Download individual list JSON file.
   */
  public downloadListJson(listId: string): void {
    const exportData = this.exportList(listId);
    if (!exportData) return;

    const safeName = exportData.list.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'timer-list';
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protimer-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export active list to standard CSV file.
   */
  public downloadListCsv(targetListId?: string): void {
    const listId = targetListId || this.activeListId;
    const list = this.lists.get(listId);
    if (!list) return;

    const timers = list.timerIds
      .map((id) => this.timers.get(id))
      .filter((t): t is TimerItem => !!t);

    const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;

    let csvContent = 'Name,Duration,Type,End Action,Alert 1,Alert 2,Scheduled Start\r\n';

    timers.forEach((t) => {
      const durFormatted = formatSeconds(t.durationSeconds, true);
      const a1Formatted = t.alert1 ? formatSeconds(t.alert1.timeSeconds, true) : '';
      const a2Formatted = t.alert2 ? formatSeconds(t.alert2.timeSeconds, true) : '';
      const sched = t.scheduledStartTime || '';

      csvContent += [
        escapeCsv(t.name),
        escapeCsv(durFormatted),
        escapeCsv(t.type),
        escapeCsv(t.endAction),
        escapeCsv(a1Formatted),
        escapeCsv(a2Formatted),
        escapeCsv(sched),
      ].join(',') + '\r\n';
    });

    const safeName = list.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protimer-${safeName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import cues from CSV text into a list.
   */
  public async importCsv(
    csvText: string,
    targetListId?: string
  ): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const listId = targetListId || this.activeListId;
      const list = this.lists.get(listId);
      if (!list) return { success: false, count: 0, message: 'Target list not found.' };

      const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        return { success: false, count: 0, message: 'Empty CSV file.' };
      }

      this.pushHistory(`Import CSV into "${list.name}"`);

      let startIndex = 0;
      const firstLineLower = lines[0].toLowerCase();
      if (firstLineLower.includes('name') || firstLineLower.includes('duration')) {
        startIndex = 1;
      }

      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = '';
        let insideQuote = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (insideQuote && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              insideQuote = !insideQuote;
            }
          } else if (char === ',' && !insideQuote) {
            result.push(cur.trim());
            cur = '';
          } else {
            cur += char;
          }
        }
        result.push(cur.trim());
        return result;
      };

      const parseTimeToSec = (str: string): number => {
        if (!str) return 300;
        if (/^\d+$/.test(str)) return parseInt(str, 10);
        const parts = str.split(':').map((p) => parseInt(p, 10) || 0);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 300;
      };

      let count = 0;
      for (let i = startIndex; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length === 0 || !cols[0]) continue;

        const name = cols[0];
        const durSec = parseTimeToSec(cols[1]);
        const type = (cols[2] || 'countdown') as any;
        const endAction = (cols[3] || 'stop') as any;
        const a1Sec = cols[4] ? parseTimeToSec(cols[4]) : undefined;
        const a2Sec = cols[5] ? parseTimeToSec(cols[5]) : undefined;
        const scheduledStartTime = cols[6] || undefined;

        const newTimer: TimerItem = {
          id: generateId('t'),
          name,
          order: list.timerIds.length,
          durationSeconds: durSec,
          elapsedSeconds: 0,
          remainingSeconds: durSec,
          type: ['countdown', 'count_up', 'stopwatch', 'digital_clock', 'meeting_timer'].includes(type)
            ? type
            : 'countdown',
          status: 'idle',
          speed: 100,
          endAction: ['stop', 'count_up', 'next_timer', 'loop', 'blackout'].includes(endAction)
            ? endAction
            : 'stop',
          scheduledStartTime,
          alert1: a1Sec !== undefined ? {
            id: generateId('alt'),
            timeSeconds: a1Sec,
            color: '#eab308',
            flash: false,
            soundEnabled: true,
            label: 'Warning',
          } : undefined,
          alert2: a2Sec !== undefined ? {
            id: generateId('alt'),
            timeSeconds: a2Sec,
            color: '#ef4444',
            flash: true,
            soundEnabled: true,
            label: 'Danger',
          } : undefined,
          createdAt: Date.now() + count,
          updatedAt: Date.now() + count,
        };

        this.timers.set(newTimer.id, newTimer);
        list.timerIds.push(newTimer.id);
        await storageService.saveTimer(newTimer);
        count++;
      }

      await storageService.saveList(list);
      this.notifySubscribers();

      return {
        success: true,
        count,
        message: `Successfully imported ${count} cue${count === 1 ? '' : 's'}.`,
      };
    } catch (e: any) {
      return { success: false, count: 0, message: e.message || 'CSV import failed.' };
    }
  }

  /**
   * 9. Export all lists & timers (full system backup).
   */
  public exportAllLists(): AllListsBackupData {
    const allLists = this.getAllLists();
    const allTimers = Array.from(this.timers.values());

    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      type: 'all_lists',
      activeListId: this.activeListId,
      lists: allLists,
      timers: allTimers,
    };
  }

  /**
   * Download full system backup JSON file.
   */
  public downloadAllListsBackup(): void {
    const backupData = this.exportAllLists();
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protimer-all-lists-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 8. Import list from JSON string or object.
   * Supports single list export or full backup file.
   */
  public async importList(
    jsonData: string | object, 
    mode: 'add' | 'replace' = 'add'
  ): Promise<{ success: boolean; message: string; listId?: string }> {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      if (!data || typeof data !== 'object') {
        return { success: false, message: 'Invalid JSON data provided.' };
      }

      this.pushHistory('Import Cue List');

      // Check if this is an all-lists backup
      if (data.type === 'all_lists' && Array.isArray(data.lists)) {
        if (mode === 'replace') {
          // Clear current lists (except running timers are stopped safely)
          this.runningTimerIds.clear();
          this.checkStopTicker();
          this.timers.clear();
          this.lists.clear();
        }

        const importedLists: TimerList[] = [];
        const importedTimers: TimerItem[] = [];

        for (const rawList of data.lists) {
          const listId = mode === 'replace' ? rawList.id : generateId('list');
          const listTimerIds: string[] = [];

          // Map and clone associated timers
          if (Array.isArray(data.timers)) {
            const listOldTimers = data.timers.filter((t: TimerItem) => rawList.timerIds?.includes(t.id));
            listOldTimers.forEach((oldTimer: TimerItem, idx: number) => {
              const newTid = mode === 'replace' ? oldTimer.id : generateId('t');
              const newTimer: TimerItem = {
                ...oldTimer,
                id: newTid,
                order: idx,
                status: 'idle',
                elapsedSeconds: 0,
                remainingSeconds: oldTimer.durationSeconds,
                updatedAt: Date.now(),
              };
              this.timers.set(newTid, newTimer);
              importedTimers.push(newTimer);
              listTimerIds.push(newTid);
            });
          }

          const newList: TimerList = {
            ...rawList,
            id: listId,
            name: mode === 'replace' ? rawList.name : `${rawList.name} (Imported)`,
            order: importedLists.length,
            timerIds: listTimerIds,
            updatedAt: Date.now(),
          };

          this.lists.set(listId, newList);
          importedLists.push(newList);
        }

        await storageService.saveTimersBatch(importedTimers);
        await storageService.saveListsBatch(importedLists);

        if (importedLists.length > 0) {
          this.switchList(importedLists[0].id);
        }

        return { 
          success: true, 
          message: `Successfully imported ${importedLists.length} lists with ${importedTimers.length} timers.`,
          listId: importedLists[0]?.id
        };
      }

      // Single list import
      const listObj = data.list || (data.name && data.timerIds ? data : null);
      if (!listObj || !listObj.name) {
        return { success: false, message: 'Invalid list format: missing list name.' };
      }

      const sortedLists = this.getAllLists();
      const newListId = generateId('list');
      const importedTimers: TimerItem[] = [];
      const newTimerIds: string[] = [];

      const rawTimers: TimerItem[] = Array.isArray(data.timers) ? data.timers : [];

      rawTimers.forEach((rawTimer, idx) => {
        const newTid = generateId('t');
        const duration = Number(rawTimer.durationSeconds) || 300;
        const newTimer: TimerItem = {
          ...rawTimer,
          id: newTid,
          order: idx,
          durationSeconds: duration,
          elapsedSeconds: 0,
          remainingSeconds: duration,
          status: 'idle',
          speed: Math.max(1, Math.min(200, Number(rawTimer.speed) || 100)),
          createdAt: Date.now() + idx,
          updatedAt: Date.now() + idx,
        };
        this.timers.set(newTid, newTimer);
        importedTimers.push(newTimer);
        newTimerIds.push(newTid);
      });

      if (importedTimers.length > 0) {
        await storageService.saveTimersBatch(importedTimers);
      }

      const newList: TimerList = {
        id: newListId,
        name: `${listObj.name} (Imported)`,
        description: listObj.description || '',
        order: sortedLists.length,
        timerIds: newTimerIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.lists.set(newListId, newList);
      await storageService.saveList(newList);

      this.switchList(newListId);
      return {
        success: true,
        message: `Imported list "${newList.name}" with ${newTimerIds.length} timers.`,
        listId: newListId,
      };
    } catch (err) {
      console.error('Failed to import list:', err);
      return { success: false, message: `Import error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Get the number of timers currently running in a specific list.
   */
  public getRunningTimerCount(listId: string): number {
    const list = this.lists.get(listId);
    if (!list) return 0;
    return list.timerIds.filter(tid => this.runningTimerIds.has(tid)).length;
  }

  /**
   * Return all currently running timers across all lists with their parent list.
   */
  public getAllRunningTimers(): { timer: TimerItem; list: TimerList }[] {
    const results: { timer: TimerItem; list: TimerList }[] = [];
    this.runningTimerIds.forEach(tid => {
      const timer = this.timers.get(tid);
      if (timer && timer.status === 'running') {
        const parentList = Array.from(this.lists.values()).find(l => l.timerIds.includes(tid));
        if (parentList) {
          results.push({ timer, list: parentList });
        }
      }
    });
    return results;
  }

  /**
   * Automated verification test proving that:
   * 1. Timers in List 1 and List 2 run simultaneously.
   * 2. Switching between lists does NOT stop running timers.
   */
  public async runMultiListIndependenceTest(): Promise<{ success: boolean; message: string; logs: string[] }> {
    const logs: string[] = [];
    logs.push('[Test Start] Initiating Multi-List Independence and Concurrent Running Test...');

    const sortedLists = this.getAllLists();
    if (sortedLists.length < 2) {
      this.addList('Test List 2');
    }

    const list1 = this.getAllLists()[0];
    const list2 = this.getAllLists()[1];
    logs.push(`[List Setup] List 1: "${list1.name}", List 2: "${list2.name}"`);

    // Ensure both lists have at least one timer
    if (list1.timerIds.length === 0) {
      this.activeListId = list1.id;
      this.addTimer({ name: 'List 1 Test Timer', durationSeconds: 600 });
    }
    if (list2.timerIds.length === 0) {
      this.activeListId = list2.id;
      this.addTimer({ name: 'List 2 Test Timer', durationSeconds: 600 });
    }

    const timer1Id = list1.timerIds[0];
    const timer2Id = list2.timerIds[0];

    // Step 1: Switch to List 1 and start its timer
    this.switchList(list1.id);
    this.start(timer1Id);
    logs.push(`[Step 1] Started timer in List 1 (${timer1Id}). Status: ${this.timers.get(timer1Id)?.status}`);

    // Step 2: Switch to List 2 and verify timer 1 is STILL running in the background!
    this.switchList(list2.id);
    const timer1StillRunning = this.runningTimerIds.has(timer1Id);
    logs.push(`[Step 2] Switched to List 2. Is List 1 timer still running in background? ${timer1StillRunning ? 'YES (PASS)' : 'NO (FAIL)'}`);

    // Step 3: Start timer in List 2 simultaneously
    this.start(timer2Id);
    logs.push(`[Step 3] Started timer in List 2 (${timer2Id}). Status: ${this.timers.get(timer2Id)?.status}`);

    // Step 4: Verify both timers are concurrently in running set
    const bothRunning = this.runningTimerIds.has(timer1Id) && this.runningTimerIds.has(timer2Id);
    logs.push(`[Step 4] Are both timers running concurrently in different lists? ${bothRunning ? 'YES (PASS)' : 'NO (FAIL)'}`);

    // Step 5: Wait 350ms to allow tick updates
    const initialElapsed1 = this.timers.get(timer1Id)?.elapsedSeconds || 0;
    const initialElapsed2 = this.timers.get(timer2Id)?.elapsedSeconds || 0;

    await new Promise(r => setTimeout(r, 350));

    const finalElapsed1 = this.timers.get(timer1Id)?.elapsedSeconds || 0;
    const finalElapsed2 = this.timers.get(timer2Id)?.elapsedSeconds || 0;

    const timer1Advanced = finalElapsed1 > initialElapsed1;
    const timer2Advanced = finalElapsed2 > initialElapsed2;

    logs.push(`[Step 5] Wall-clock advancement verification:`);
    logs.push(`   List 1 Timer: ${initialElapsed1.toFixed(2)}s -> ${finalElapsed1.toFixed(2)}s (Advanced: ${timer1Advanced})`);
    logs.push(`   List 2 Timer: ${initialElapsed2.toFixed(2)}s -> ${finalElapsed2.toFixed(2)}s (Advanced: ${timer2Advanced})`);

    const passed = bothRunning && timer1StillRunning && timer1Advanced && timer2Advanced;

    logs.push(passed 
      ? '[Test Result] SUCCESS: Timers in separate lists run simultaneously with independent drift-free wall-clock tickers.' 
      : '[Test Result] FAILURE: Timers did not run independently.'
    );

    return {
      success: passed,
      message: passed 
        ? 'Multi-list independence verified: All timers in background and foreground lists run simultaneously and drift-free.' 
        : 'Multi-list test failed.',
      logs,
    };
  }

  public resetCompletedTimers(): void {
    const list = this.lists.get(this.activeListId);
    if (!list) return;
    list.timerIds.forEach(id => {
      const t = this.timers.get(id);
      if (t) {
        if (this.activeLogIdByTimerId.has(id)) {
          this.recordTimerStop(t, 'stopped');
        }
        t.elapsedSeconds = 0;
        t.status = 'idle';
        t.remainingSeconds = t.durationSeconds;
        storageService.saveTimer(t);
      }
    });
    this.runningTimerIds.clear();
    this.checkStopTicker();
    this.notifySubscribers();
  }

  // ===========================================================================
  // OBSERVER & SNAPSHOT
  // ===========================================================================

  public subscribe(cb: TimerManagerSubscriber): () => void {
    this.subscribers.add(cb);
    cb(this.getSnapshot(), this.getActiveListTimers());

    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers(): void {
    const snapshot = this.getSnapshot();
    const timers = this.getActiveListTimers();
    this.subscribers.forEach(cb => {
      try {
        cb(snapshot, timers);
      } catch (err) {
        console.error('Error notifying timer subscriber:', err);
      }
    });
  }

  public getSnapshot(): TimerSnapshot {
    const active = this.getActiveTimer();
    const cued = this.getCuedTimer();
    const displayTarget = active || cued;

    const dur = displayTarget?.durationSeconds || 1;
    const currentRemaining = active ? active.remainingSeconds : (cued ? cued.remainingSeconds : 0);
    const isOvertime = active ? (active.status === 'overtime' || currentRemaining < 0) : false;
    const progressPercent = active?.durationSeconds 
      ? Math.min(100, Math.max(0, (active.elapsedSeconds / active.durationSeconds) * 100))
      : 0;

    // Compute alert colors based on active timer status and threshold
    const alertInfo = computeActiveAlert(active || cued, currentRemaining, active?.status || 'idle');
    const alertColor = alertInfo.color;
    const isFlash = alertInfo.flash;
    const isOnOff = alertInfo.onOff;

    return {
      activeTimerId: active?.id || null,
      cuedTimerId: cued?.id || null,
      activeListId: this.activeListId,
      status: active?.status || 'idle',
      currentSeconds: currentRemaining,
      durationSeconds: dur,
      progressPercent,
      isOvertime,
      overtimeSeconds: isOvertime ? Math.abs(currentRemaining) : 0,
      speed: displayTarget?.speed || 100,
      alertColor,
      isFlash,
      isOnOff,
      timestamp: Date.now(),
    };
  }

  public getActiveTimer(): TimerItem | null {
    const list = this.lists.get(this.activeListId);
    if (this.activeTimerId && (!list || list.timerIds.includes(this.activeTimerId))) {
      const t = this.timers.get(this.activeTimerId);
      if (t && (t.status === 'running' || t.status === 'overtime' || t.status === 'paused')) {
        return t;
      }
    }
    if (list) {
      const runningId = list.timerIds.find((tid) => this.runningTimerIds.has(tid));
      if (runningId) return this.timers.get(runningId) || null;
      const pausedId = list.timerIds.find((tid) => this.timers.get(tid)?.status === 'paused');
      if (pausedId) return this.timers.get(pausedId) || null;
    }
    return null;
  }

  public getCuedTimer(): TimerItem | null {
    const list = this.lists.get(this.activeListId);
    if (this.cuedTimerId && (!list || list.timerIds.includes(this.cuedTimerId))) {
      return this.timers.get(this.cuedTimerId) || null;
    }
    if (list && list.timerIds.length > 0) {
      const cuedId =
        list.timerIds.find((tid) => this.timers.get(tid)?.status === 'cued') ||
        list.timerIds.find((tid) => this.timers.get(tid)?.type !== 'spacer') ||
        list.timerIds[0];
      return cuedId ? this.timers.get(cuedId) || null : null;
    }
    return null;
  }

  public getNextTimer(): TimerItem | null {
    const list = this.lists.get(this.activeListId);
    if (!list) return null;
    const active = this.getActiveTimer();
    const cued = this.getCuedTimer();
    if (cued && (!active || cued.id !== active.id)) {
      return cued;
    }
    const refId = active?.id || cued?.id;
    if (refId) {
      const idx = list.timerIds.indexOf(refId);
      if (idx !== -1) {
        for (let i = idx + 1; i < list.timerIds.length; i++) {
          const next = this.timers.get(list.timerIds[i]);
          if (next && next.type !== 'spacer') {
            return next;
          }
        }
      }
    }
    return null;
  }

  public getActiveListTimers(): TimerItem[] {
    const list = this.lists.get(this.activeListId);
    if (!list) return [];
    return list.timerIds.map(id => this.timers.get(id)!).filter(Boolean);
  }

  public getAllLists(): TimerList[] {
    return Array.from(this.lists.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  public getTimerById(id: string): TimerItem | null {
    return this.timers.get(id) || null;
  }

  /**
   * Returns the active (or cued) cue summary for every Cue List tab for Multi FS display.
   */
  public getAllListsActiveCues(): ListActiveCueSummary[] {
    const allLists = this.getAllLists();
    const prefs = storageService.getPreferences();
    return allLists.map((list) => {
      const listTimers = list.timerIds
        .map((id) => this.timers.get(id))
        .filter((t): t is TimerItem => Boolean(t));

      const nonSpacerTimers = listTimers.filter((t) => t.type !== 'spacer');

      // 1. Running / overtime timer in this list
      let activeTimer: TimerItem | null =
        listTimers.find((t) => this.runningTimerIds.has(t.id)) || null;

      // 2. If active operator list, check activeTimerId or cuedTimerId
      if (!activeTimer && this.activeListId === list.id) {
        if (this.activeTimerId && list.timerIds.includes(this.activeTimerId)) {
          activeTimer = this.timers.get(this.activeTimerId) || null;
        } else if (this.cuedTimerId && list.timerIds.includes(this.cuedTimerId)) {
          activeTimer = this.timers.get(this.cuedTimerId) || null;
        }
      }

      // 3. Paused or explicitly cued timer in this list
      if (!activeTimer) {
        activeTimer =
          nonSpacerTimers.find((t) => t.status === 'paused') ||
          nonSpacerTimers.find((t) => t.status === 'cued') ||
          nonSpacerTimers[0] ||
          null;
      }

      // Determine next cue in this list
      let nextTimer: TimerItem | null = null;
      if (activeTimer) {
        const idx = nonSpacerTimers.findIndex((t) => t.id === activeTimer!.id);
        if (idx !== -1 && idx + 1 < nonSpacerTimers.length) {
          nextTimer = nonSpacerTimers[idx + 1];
        }
      }

      const status: TimerStatus = activeTimer?.status || 'idle';
      const isCountUp =
        activeTimer?.type === 'count_up' || activeTimer?.type === 'stopwatch';
      const currentSeconds = activeTimer
        ? isCountUp
          ? activeTimer.elapsedSeconds
          : activeTimer.remainingSeconds
        : 0;
      const totalDurationSeconds = activeTimer?.durationSeconds || 0;
      const isOvertime =
        status === 'overtime' || (!isCountUp && currentSeconds < 0 && (status === 'running' || status === 'paused'));

      let formattedTime = '00:00:00';
      if (activeTimer?.type === 'digital_clock') {
        formattedTime = formatClock(new Date());
      } else if (activeTimer?.type === 'empty') {
        formattedTime = '--:--:--';
      } else {
        formattedTime = formatSeconds(currentSeconds, true, isOvertime);
      }

      const progressPercent =
        activeTimer && totalDurationSeconds > 0
          ? Math.min(100, Math.max(0, (activeTimer.elapsedSeconds / totalDurationSeconds) * 100))
          : 0;

      const alertInfo = computeActiveAlert(activeTimer, currentSeconds, status);
      const activeAlertLevel: 'none' | 'warning' | 'danger' =
        alertInfo.level === 'alert2' || alertInfo.level === 'overtime'
          ? 'danger'
          : alertInfo.level === 'alert1'
          ? 'warning'
          : 'none';

      const runningCuesCount = list.timerIds.filter((tid) => this.runningTimerIds.has(tid)).length;
      const backgroundImageUrl = resolveBackgroundImageForList(prefs, list.id);
      const logoImageUrl = resolveLogoImageForList(prefs, list.id);

      return {
        listId: list.id,
        listName: list.name,
        isCurrentOperatorList: list.id === this.activeListId,
        activeTimer,
        nextTimer,
        status,
        formattedTime,
        secondsRemaining: currentSeconds,
        totalDurationSeconds,
        progressPercent,
        isOvertime,
        activeAlertLevel,
        alertColor: alertInfo.color,
        alertFlash: alertInfo.flash,
        alertOnOff: alertInfo.onOff,
        totalCuesCount: nonSpacerTimers.length,
        runningCuesCount,
        backgroundImageUrl,
        logoImageUrl,
      };
    });
  }
}

export const timerManagerService = new TimerManagerService();
