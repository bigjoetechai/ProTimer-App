/**
 * Display targets and synchronization message contracts.
 */

import { TimerItem, TimerStatus } from './timer';
import { StageMessage } from './message';
import { AppPreferences } from './settings';

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
  logoImageUrl?: string;
}

export interface DisplaySyncPayload {
  seq?: number;
  activeListId?: string;
  activeListName?: string;
  lists?: Array<{
    id: string;
    name: string;
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
  }>;
  listActiveCues?: ListActiveCueSummary[];
  isFullscreenActive?: boolean;
  isMultiFullscreenActive?: boolean;
  isNdiActive?: boolean;
  isNdiMultiActive?: boolean;
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

  // Singleton Frameless Always-On-Top Resizable Preview & Presenter Windows
  togglePreviewWindow?: () => Promise<{ active: boolean }>;
  openPreviewWindow?: () => Promise<{ active: boolean }>;
  closePreviewWindow?: () => Promise<{ active: boolean }>;
  isPreviewWindowActive?: () => Promise<boolean>;
  onPreviewStateChanged?: (callback: (isOpen: boolean) => void) => () => void;

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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

