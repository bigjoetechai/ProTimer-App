/**
 * Core Timer domain models and type definitions.
 */

export type TimerType = 
  | 'countdown' 
  | 'count_up' 
  | 'stopwatch' 
  | 'digital_clock' 
  | 'meeting_timer'
  | 'empty'
  | 'spacer'
  | 'count_down'; // backwards-compatible alias for countdown

export type TimerStatus = 
  | 'idle' 
  | 'cued' 
  | 'running' 
  | 'paused' 
  | 'completed' 
  | 'overtime';

export type EndAction = 
  | 'stop' 
  | 'count_up' 
  | 'next_timer' 
  | 'loop' 
  | 'blackout' 
  | 'none';

export type AlertSoundType = 
  | 'beep' 
  | 'chime' 
  | 'pulse' 
  | 'alarm' 
  | 'bell';

export interface TimerAlert {
  id: string;
  timeSeconds: number; // Remaining time threshold in seconds
  color: string;       // E.g. '#eab308' (yellow), '#ef4444' (red)
  flash: boolean;
  onOff?: boolean;
  soundEnabled: boolean;
  soundType?: AlertSoundType;
  label?: string;
}

export interface StopwatchLap {
  lapNumber: number;
  lapTimeSeconds: number;
  overallTimeSeconds: number;
  timestamp: number;
}

export interface TimerItem {
  id: string;
  name: string;
  order: number;
  durationSeconds: number; // Total duration in seconds
  elapsedSeconds: number;  // Current elapsed seconds
  remainingSeconds: number; // Current remaining seconds
  type: TimerType;
  status?: TimerStatus;     // Individual timer running status for multi-timer operation
  startTime?: string;      // Optional designated start time (HH:MM:SS)
  endTime?: string;        // Optional designated end time (HH:MM:SS)
  startingValueSeconds?: number; // Configured starting value (e.g. 0 for count up, or custom)
  speed: number;           // Multiplier from 1 to 200 (100 = 1.0x, 50 = 0.5x, 200 = 2.0x)
  alert1?: TimerAlert;
  alert2?: TimerAlert;
  endAction: EndAction;
  scheduledStartTime?: string; // Optional wall-clock auto-start time (HH:MM:SS)
  autoStart?: boolean;          // Whether to auto-start when scheduled time arrives
  triggeredAlertIds?: string[];
  notes?: string;
  colorTag?: string;
  laps?: StopwatchLap[];    // Laps for stopwatch timers
  createdAt: number;
  updatedAt: number;
}

export interface TimerList {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  order?: number;
  timerIds: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface ListExportData {
  version: string;
  exportedAt: number;
  type: 'single_list';
  list: TimerList;
  timers: TimerItem[];
}

export interface AllListsBackupData {
  version: string;
  exportedAt: number;
  type: 'all_lists';
  activeListId: string;
  lists: TimerList[];
  timers: TimerItem[];
}

export interface TimerRunLogEntry {
  id: string;
  timerId: string;
  timerName: string;
  timerType: TimerType;
  listId: string;
  listName: string;
  plannedDurationSeconds: number;
  startTimestamp: number;
  stopTimestamp: number | null;
  elapsedSeconds: number;
  status: 'running' | 'paused' | 'stopped' | 'completed';
}

export interface TimerSnapshot {
  activeTimerId: string | null;
  cuedTimerId: string | null;
  activeListId: string;
  status: TimerStatus;
  currentSeconds: number; // Current display value
  durationSeconds: number;
  progressPercent: number; // 0 to 100
  isOvertime: boolean;
  overtimeSeconds: number;
  speed: number;
  alertColor?: string;
  isFlash?: boolean;
  isOnOff?: boolean;
  timestamp: number;
}

