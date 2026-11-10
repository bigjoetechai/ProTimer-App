/**
 * Display targets and synchronization message contracts.
 */

import { TimerItem, TimerStatus } from './timer';
import { StageMessage } from './message';

export type DisplayTarget = 
  | 'presenter' 
  | 'preview' 
  | 'stage' 
  | 'fullscreen' 
  | 'multi_fullscreen'
  | 'ndi' 
  | 'lan_control' 
  | 'lan_display';

export interface DisplayConfig {
  target: DisplayTarget;
  title: string;
  theme: 'dark' | 'light' | 'high_contrast' | 'blackout';
  showClock: boolean;
  showProgress: boolean;
  showTimerName: boolean;
  showNextTimer: boolean;
  fontSize: 'standard' | 'large' | 'massive';
  mirrorMode: boolean; // For teleprompter / mirror monitor setups
  backgroundColor?: string;
  textColor?: string;
}

export interface ListActiveCueSummary {
  listId: string;
  listName: string;
  isCurrentOperatorList: boolean;
  activeTimer: TimerItem | null;
  nextTimer: TimerItem | null;
  status: TimerStatus;
  formattedTime: string;
  secondsRemaining: number;
  totalDurationSeconds: number;
  progressPercent: number;
  isOvertime: boolean;
  activeAlertLevel: 'none' | 'warning' | 'danger';
  alertColor?: string;
  alertFlash: boolean;
  alertOnOff?: boolean;
  totalCuesCount: number;
  runningCuesCount: number;
  backgroundImageUrl?: string;
}

export interface DisplaySyncPayload {
  activeListId?: string;
  activeTimer: TimerItem | null;
  nextTimer: TimerItem | null;
  status: TimerStatus;
  formattedTime: string;
  secondsRemaining: number;
  totalDurationSeconds: number;
  progressPercent: number;
  isOvertime: boolean;
  overtimeFormatted: string;
  activeAlertLevel: 'none' | 'warning' | 'danger';
  alertColor?: string;
  alertFlash: boolean;
  alertOnOff?: boolean;
  activeMessage: StageMessage | null;
  clockTimeFormatted: string;
  isBlackout: boolean;
  isClockMode: boolean;
  speed: number;
  timestamp: number;
  backgroundImageUrl?: string;
  backgroundFit?: 'cover' | 'contain';
  backgroundImageOpacity?: number;
  logoImageUrl?: string;
  timerList?: Array<{
    id: string;
    name: string;
    durationFormatted: string;
    status: TimerStatus;
    isCued: boolean;
  }>;
  listActiveCues?: ListActiveCueSummary[];
}

export interface DetectedMonitor {
  id: number | string;
  displayIndex: number;
  name: string;
  isPrimary: boolean;
  resolution: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  workArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
  rotation?: number;
  touchSupport?: string;
  internal?: boolean;
}

export interface WindowStateInfo {
  isMaximized: boolean;
  isFullScreen: boolean;
  width: number;
  height: number;
}

export interface ElectronAPI {
  isElectron: boolean;
  getDisplays: () => Promise<DetectedMonitor[]>;
  openFullscreenOutput: (options: {
    monitorId: string | number;
    displayTarget?: DisplayTarget;
  }) => Promise<{ success: boolean; displayId: number | string; error?: string }>;
  closeFullscreenOutput: () => Promise<boolean>;
  isFullscreenOutputActive: () => Promise<boolean>;
  onDisplaysChanged: (callback: (displays: DetectedMonitor[]) => void) => () => void;
  onOutputClosed: (callback: () => void) => () => void;

  // Independent Multi Fullscreen Output
  openMultiFullscreenOutput?: (options?: {
    monitorId?: string | number;
  }) => Promise<{ success: boolean; displayId: number | string; error?: string }>;
  closeMultiFullscreenOutput?: () => Promise<boolean>;
  isMultiFullscreenOutputActive?: () => Promise<boolean>;
  onMultiOutputClosed?: (callback: () => void) => () => void;
  
  // Window Size & Resolution Management
  minimizeWindow: () => Promise<boolean>;
  maximizeWindow: () => Promise<boolean>;
  restoreWindow: () => Promise<boolean>;
  toggleMaximize: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  closeWindow: () => Promise<boolean>;
  toggleAppFullscreen: (monitorId?: string | number) => Promise<boolean>;
  isAppFullscreen: () => Promise<boolean>;
  resetWindowSize: () => Promise<boolean>;
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  onWindowStateChanged: (callback: (state: WindowStateInfo) => void) => () => void;

  // Persistent User Application Data (%APPDATA%\ProTimer)
  readUserData: () => Promise<{
    timers?: TimerItem[];
    lists?: unknown[];
    preferences?: unknown;
    runLogs?: unknown[];
    updatedAt?: number;
  } | null>;
  writeUserData: (data: {
    timers?: TimerItem[];
    lists?: unknown[];
    preferences?: unknown;
    runLogs?: unknown[];
    updatedAt?: number;
  }) => Promise<boolean>;
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    appId: string;
    userDataPath: string;
    lanPort: number;
  }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
