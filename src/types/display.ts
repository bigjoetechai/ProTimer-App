/**
 * Display targets and synchronization message contracts.
 */

import { TimerItem, TimerList, TimerRunLogEntry, TimerStatus } from './timer';
import { StageMessage } from './message';
import { AppPreferences } from './settings';

export type DisplayTarget = 
  | 'presenter' 
  | 'preview' 
  | 'multi_preview'
  | 'stage' 
  | 'fullscreen' 
  | 'multi_fullscreen'
  | 'ndi' 
  | 'lan_control' 
  | 'lan_desktop'
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
  listColor?: string;
  isCurrentOperatorList: boolean;
  activeTimer: TimerItem | null;
  activeTimerId?: string | null;
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
  logoImageUrl?: string;
  cuedTimerId?: string | null;
  timerList?: Array<{
    id: string;
    name: string;
    durationFormatted: string;
    status: TimerStatus;
    isCued: boolean;
    colorTag?: string;
  }>;
}

export interface DisplaySyncPayload {
  seq?: number;
  activeListId?: string;
  activeListName?: string;
  activeListColor?: string;
  activeTimerId?: string | null;
  cuedTimerId?: string | null;
  lists?: Array<{
    id: string;
    name: string;
    color?: string;
    runningCount?: number;
  }>;
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
  dateFormatted?: string;
  isBlackout: boolean;
  isClockMode: boolean;
  speed: number;
  timestamp: number;
  backgroundImageUrl?: string;
  backgroundFit?: 'cover' | 'contain';
  backgroundImageOpacity?: number;
  logoImageUrl?: string;
  preferences?: AppPreferences;
  timerList?: Array<{
    id: string;
    name: string;
    durationFormatted: string;
    status: TimerStatus;
    isCued: boolean;
    colorTag?: string;
  }>;
  listActiveCues?: ListActiveCueSummary[];
  fullLists?: TimerList[];
  allTimers?: TimerItem[];
  runLogs?: TimerRunLogEntry[];
  isFullscreenActive?: boolean;
  activeFullscreenByList?: Record<string, boolean>;
  isMultiFullscreenActive?: boolean;
  isNdiActive?: boolean;
  isNdiMultiActive?: boolean;
  activeNdiByList?: Record<string, boolean>;
  ndiSourceNamesByList?: Record<string, string>;
  ndiSourceName?: string;
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
    listId?: string;
  }) => Promise<{ success: boolean; displayId: number | string; listId?: string; error?: string }>;
  closeFullscreenOutput: (listId?: string) => Promise<boolean>;
  isFullscreenOutputActive: (listId?: string) => Promise<boolean>;
  getActiveFullscreenLists?: () => Promise<string[]>;
  onDisplaysChanged: (callback: (displays: DetectedMonitor[]) => void) => () => void;
  onOutputClosed: (
    callback: (info?: { listId?: string | null; activeListIds?: string[] }) => void
  ) => () => void;

  // Independent Multi Fullscreen Output
  openMultiFullscreenOutput?: (options?: {
    monitorId?: string | number;
  }) => Promise<{ success: boolean; displayId: number | string; error?: string }>;
  closeMultiFullscreenOutput?: () => Promise<boolean>;
  isMultiFullscreenOutputActive?: () => Promise<boolean>;
  onMultiOutputClosed?: (callback: () => void) => () => void;

  // Singleton Frameless Always-On-Top Resizable Preview, Multi Preview & Presenter Windows
  togglePreviewWindow?: () => Promise<{ active: boolean }>;
  openPreviewWindow?: () => Promise<{ active: boolean }>;
  closePreviewWindow?: () => Promise<{ active: boolean }>;
  isPreviewWindowActive?: () => Promise<boolean>;
  onPreviewStateChanged?: (callback: (isOpen: boolean) => void) => () => void;

  toggleMultiPreviewWindow?: () => Promise<{ active: boolean }>;
  openMultiPreviewWindow?: () => Promise<{ active: boolean }>;
  closeMultiPreviewWindow?: () => Promise<{ active: boolean }>;
  isMultiPreviewWindowActive?: () => Promise<boolean>;
  onMultiPreviewStateChanged?: (callback: (isOpen: boolean) => void) => () => void;

  togglePresenterWindow?: () => Promise<{ active: boolean }>;
  openPresenterWindow?: () => Promise<{ active: boolean }>;
  closePresenterWindow?: () => Promise<{ active: boolean }>;
  isPresenterWindowActive?: () => Promise<boolean>;
  onPresenterStateChanged?: (callback: (isOpen: boolean) => void) => () => void;

  getCurrentWindowBounds?: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  setCurrentWindowBounds?: (bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => Promise<boolean>;

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
  getSystemFonts?: () => Promise<string[]>;

  // Auto-Updater (GitHub Releases via electron-updater)
  checkForUpdates?: () => Promise<{
    status: string;
    message?: string;
    version?: string | null;
    percent?: number;
  }>;
  quitAndInstallUpdate?: () => Promise<boolean>;
  getUpdateStatus?: () => Promise<{
    status: string;
    version: string | null;
    percent: number;
    error: string | null;
  }>;
  onUpdateStatus?: (
    callback: (status: {
      status: string;
      version: string | null;
      percent: number;
      error: string | null;
    }) => void
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

