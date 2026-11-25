/**
 * Application Settings and Preferences types.
 */

export interface AppPreferences {
  theme: 'dark' | 'light';
  defaultTimerType: 'count_down' | 'count_up' | 'time_of_day';
  defaultDurationSeconds: number; // e.g. 600 (00:10:00)
  defaultWarningSeconds: number; // e.g. 90 (01:30)
  defaultDangerSeconds: number;  // e.g. 30 (00:30)
  soundAlertsEnabled: boolean;
  flashAlertsEnabled: boolean;
  timeFormat24h: boolean;
  syncChannelName: string;
  autoCueNext: boolean;
  hotkeysEnabled: boolean;
  fullscreenMonitor: string;

  // Default New List Settings (Timer List preferences)
  linkCueEdit?: boolean;
  singleTimerMode?: boolean;
  autoSchedule?: boolean;

  // Default New Timer Settings (Timer List preferences)
  defaultNewTimerType?: 'countdown' | 'count_up' | 'end_time' | 'stopwatch' | 'digital_clock' | 'empty' | 'spacer';
  defaultNewTimerEndAction?: 'count_up' | 'stop' | 'next_timer' | 'loop' | 'none';
  defaultDurationEnabled?: boolean;
  defaultAlert1Enabled?: boolean;
  defaultAlert2Enabled?: boolean;

  // General Options
  hideLeadingZeros?: boolean;
  turnOffAeroShake?: boolean;

  // Countdown Options
  displayHours?: boolean;
  displaySeconds?: boolean;
  hideHoursUnderOneHour?: boolean;
  sumHoursIntoMinutes?: boolean;

  // Clock & Date Options
  clockDisplaySeconds?: boolean;
  dateFormat?: 'short' | 'long' | 'iso' | 'dmy' | 'mdy';

  // Schedule Time Zone
  useComputerTimeZone?: boolean;
  customTimeZone?: string;

  // Style Sub-Tabs (Sizes & Positions, Progress Bar, Images, Colors & Animations)
  sizesAndPositionsByTarget?: Record<SizesPositionTargetTab, Record<SizesPositionElementId, SizesPositionElementConfig>>;
  sizesAndPositionsExtrasByTarget?: Record<SizesPositionTargetTab, SizesPositionTargetExtras>;
  countdownSpacing?: number;
  countdownColonSpacing?: number;
  timerFontSizePercent?: number;
  timerNameSizePercent?: number;
  messageSizePercent?: number;
  verticalAlignment?: 'top' | 'center' | 'bottom';
  showProgressBar?: boolean;
  progressBarHeightPx?: number;
  progressBarPosition?: 'top' | 'bottom';
  backgroundImageDataUrl?: string;
  backgroundImageFileName?: string;
  listBackgroundImages?: Record<string, ListBackgroundImageConfig>;
  logoImageDataUrl?: string;
  logoImageFileName?: string;
  listLogoImages?: Record<string, ListBackgroundImageConfig>;
  backgroundImageOpacity?: number;
  backgroundFit?: 'cover' | 'contain';
  normalDigitsColor?: string;
  warningDigitsColor?: string;
  dangerDigitsColor?: string;
  overtimeDigitsColor?: string;
  smoothTransitions?: boolean;

  // NDI & Updates
  ndiResolution?: string;
  ndiSourceName?: string;
  ndiAlphaChannel?: boolean;
  ndiFrameRate?: number | string;
  ndiUseCustomGroups?: boolean;
  ndiCustomGroups?: string;
  checkForUpdatesAutomatically?: boolean;
}

export interface ListBackgroundImageConfig {
  dataUrl: string;
  fileName: string;
}

/**
 * Resolves the effective background image Data URL for a given Cue List ID.
 * Each list has its own independent background image; returns empty string ('')
 * for pure black background when no image is uploaded for that list or when removed.
 */
export function resolveBackgroundImageForList(
  prefs: AppPreferences | null | undefined,
  listId?: string | null
): string {
  if (!prefs || !listId || !prefs.listBackgroundImages) return '';
  const entry = prefs.listBackgroundImages[listId];
  if (entry && typeof entry.dataUrl === 'string' && entry.dataUrl.trim().length > 0) {
    return entry.dataUrl;
  }
  return '';
}

/**
 * Resolves the effective logo image Data URL for a given Cue List ID.
 * Each list has its own independent logo image; returns empty string ('')
 * when no logo is uploaded for that list or when removed.
 */
export function resolveLogoImageForList(
  prefs: AppPreferences | null | undefined,
  listId?: string | null
): string {
  if (!prefs || !listId || !prefs.listLogoImages) return '';
  const entry = prefs.listLogoImages[listId];
  if (entry && typeof entry.dataUrl === 'string' && entry.dataUrl.trim().length > 0) {
    return entry.dataUrl;
  }
  return '';
}

/**
 * Extracts the editable base prefix from an NDI source name template
 * (e.g. `StudioTimer (List 1)` -> `StudioTimer`, `ProTimer (List 1)` -> `ProTimer`).
 */
export function extractNdiSourcePrefix(baseTemplate?: string | null): string {
  const raw = (baseTemplate || '').trim();
  if (!raw) return 'ProTimer';
  const stripped = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || 'ProTimer';
}

/**
 * Formats the NDI source name for a specific Cue List tab so the list tab name
 * always appears inside the brackets, e.g. `ProTimer (List 1)` or `ProTimer (Session A)`.
 * If the operator customized the prefix in Preferences -> NDI (e.g. `StudioTimer`),
 * that custom prefix is preserved while placing the list tab name in brackets.
 */
export function formatListNdiSourceName(
  listName?: string | null,
  baseTemplate?: string | null
): string {
  const cleanList = (listName || '').trim() || 'List 1';
  const prefix = extractNdiSourcePrefix(baseTemplate);
  return `${prefix} (${cleanList})`;
}

export type SizesPositionTargetTab =
  | 'fullscreen_ndi_preview'
  | 'presenter_window'
  | 'multitimer'
  | 'web_display_lan';

export type SizesPositionElementId =
  | 'timer_list'
  | 'message'
  | 'countdown'
  | 'colon'
  | 'name'
  | 'clock'
  | 'date'
  | 'progress_bar'
  | 'border'
  | 'background'
  | 'logo'
  | 'slide_text'
  | 'slide_progress';

export interface SizesPositionElementConfig {
  visible?: boolean;
  location?: string;
  vert?: number;
  horiz?: number;
  sizePercent?: number;
  spacing?: number;
  font?: string;
  fontStyle?: string;
}

export interface SizesPositionTargetExtras {
  // SHADOW
  enableShadow: boolean;
  shadowXOffset: number;
  shadowYOffset: number;
  shadowBlur: number;
  shadowColor: string;
  shadowColorTransparent?: boolean;

  // CROP & SCALE
  enableCrop: boolean;
  cropLeftPercent: number;
  cropRightPercent: number;
  cropTopPercent: number;
  cropBottomPercent: number;
  cornerRadius: number;
  bgKeyColor: string;
  scaleZoomPercent: number;
  positionOffsetX: number;
  positionOffsetY: number;
}

export const DEFAULT_TARGET_EXTRAS_CONFIG: SizesPositionTargetExtras = {
  enableShadow: true,
  shadowXOffset: 5,
  shadowYOffset: -5,
  shadowBlur: 0,
  shadowColor: '#000000',
  shadowColorTransparent: false,

  enableCrop: false,
  cropLeftPercent: 0,
  cropRightPercent: 0,
  cropTopPercent: 0,
  cropBottomPercent: 0,
  cornerRadius: 0,
  bgKeyColor: '#000000',
  scaleZoomPercent: 100,
  positionOffsetX: 0,
  positionOffsetY: 0,
};

export function createDefaultSizesAndPositionsExtras(): Record<
  SizesPositionTargetTab,
  SizesPositionTargetExtras
> {
  const cloneExtras = (): SizesPositionTargetExtras => ({ ...DEFAULT_TARGET_EXTRAS_CONFIG });
  return {
    fullscreen_ndi_preview: cloneExtras(),
    presenter_window: cloneExtras(),
    multitimer: cloneExtras(),
    web_display_lan: cloneExtras(),
  };
}

export const DEFAULT_TARGET_ELEMENTS_CONFIG: Record<SizesPositionElementId, SizesPositionElementConfig> = {
  timer_list: {
    visible: false,
    location: 'Top',
    vert: 0,
    horiz: 0,
    sizePercent: 33,
    font: 'Verdana',
    fontStyle: 'Normal',
  },
  message: {
    visible: true,
    location: 'Top',
    vert: 0,
    horiz: 0,
    sizePercent: 33,
    font: 'Verdana',
    fontStyle: 'Normal',
  },
  countdown: {
    visible: true,
    location: 'Middle',
    vert: 2,
    horiz: 0,
    sizePercent: 113,
    spacing: 0,
    font: 'Bebas Neue',
    fontStyle: 'Bold',
  },
  colon: {
    vert: 0,
    horiz: 0,
  },
  name: {
    visible: true,
    location: 'Bottom',
    vert: 11,
    horiz: 0,
    sizePercent: 33,
    font: 'Verdana',
    fontStyle: 'Normal',
  },
  clock: {
    visible: false,
    location: 'Top',
    vert: 0,
    horiz: 0,
    sizePercent: 33,
    font: 'Verdana',
    fontStyle: 'Normal',
  },
  date: {
    visible: false,
    location: 'Top',
    vert: 0,
    horiz: -34,
    sizePercent: 33,
    font: 'Verdana',
    fontStyle: 'Normal',
  },
  progress_bar: {
    visible: false,
    location: 'Bottom',
    vert: -2,
    horiz: 0,
    sizePercent: 100,
  },
  border: {
    visible: false,
  },
  background: {
    visible: true,
  },
  logo: {
    visible: true,
    location: 'TopRight',
    vert: -1,
    horiz: -5,
    sizePercent: 20,
  },
  slide_text: {
    visible: false,
    location: 'Top',
    vert: -1,
    horiz: 0,
    sizePercent: 33,
    font: 'Verdana',
    fontStyle: 'Normal',
  },
  slide_progress: {
    visible: false,
    location: 'High',
    vert: 6,
    horiz: 0,
    sizePercent: 100,
  },
};

export function createDefaultSizesAndPositions(): Record<
  SizesPositionTargetTab,
  Record<SizesPositionElementId, SizesPositionElementConfig>
> {
  const cloneTarget = (): Record<SizesPositionElementId, SizesPositionElementConfig> =>
    JSON.parse(JSON.stringify(DEFAULT_TARGET_ELEMENTS_CONFIG));

  return {
    fullscreen_ndi_preview: cloneTarget(),
    presenter_window: cloneTarget(),
    multitimer: cloneTarget(),
    web_display_lan: cloneTarget(),
  };
}

/**
 * Ensures the Countdown element defaults to 'Bebas Neue' across all display targets
 * (including migrating legacy saved preferences that still had 'Verdana' as the uncustomized default).
 */
export function ensureBebasCountdownDefault(prefs: AppPreferences): AppPreferences {
  const raw = prefs as AppPreferences & { __bebasCountdownDefaultV2?: boolean };
  const baseTargets = raw.sizesAndPositionsByTarget || createDefaultSizesAndPositions();
  const needsMigration = !raw.__bebasCountdownDefaultV2;

  const targetKeys: SizesPositionTargetTab[] = [
    'fullscreen_ndi_preview',
    'presenter_window',
    'multitimer',
    'web_display_lan',
  ];

  const nextTargets = { ...baseTargets };
  let modified = false;

  for (const key of targetKeys) {
    const existingTarget = nextTargets[key] || JSON.parse(JSON.stringify(DEFAULT_TARGET_ELEMENTS_CONFIG));
    const existingCountdown = existingTarget.countdown || { ...DEFAULT_TARGET_ELEMENTS_CONFIG.countdown };
    const currentFont = existingCountdown.font;

    if (!currentFont || (needsMigration && currentFont === 'Verdana')) {
      nextTargets[key] = {
        ...existingTarget,
        countdown: {
          ...DEFAULT_TARGET_ELEMENTS_CONFIG.countdown,
          ...existingCountdown,
          font: 'Bebas Neue',
        },
      };
      modified = true;
    }
  }

  if (needsMigration || modified) {
    return {
      ...raw,
      sizesAndPositionsByTarget: nextTargets,
      __bebasCountdownDefaultV2: true,
    } as AppPreferences;
  }

  return prefs;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  defaultTimerType: 'count_down',
  defaultDurationSeconds: 600, // 00:10:00
  defaultWarningSeconds: 90,   // 01:30
  defaultDangerSeconds: 30,    // 00:30
  soundAlertsEnabled: false,
  flashAlertsEnabled: true,
  timeFormat24h: true,
  syncChannelName: 'protimer_sync_v1',
  autoCueNext: true,
  hotkeysEnabled: true,
  fullscreenMonitor: 'Auto',

  // Default New List Settings (matching Timer List reference screenshot)
  linkCueEdit: false,
  singleTimerMode: false,
  autoSchedule: false,

  // Default New Timer Settings (matching Timer List reference screenshot)
  defaultNewTimerType: 'countdown',
  defaultNewTimerEndAction: 'count_up', // Overtime
  defaultDurationEnabled: true,
  defaultAlert1Enabled: true,
  defaultAlert2Enabled: false,

  // General Options (matching reference screenshot defaults)
  hideLeadingZeros: false,
  turnOffAeroShake: true,

  // Countdown Options
  displayHours: true,
  displaySeconds: true,
  hideHoursUnderOneHour: false,
  sumHoursIntoMinutes: false,

  // Clock & Date Options
  clockDisplaySeconds: false,
  dateFormat: 'short',

  // Schedule Time Zone
  useComputerTimeZone: true,
  customTimeZone: 'UTC — UTC+00:00',

  // Style Sub-Tabs
  sizesAndPositionsByTarget: createDefaultSizesAndPositions(),
  sizesAndPositionsExtrasByTarget: createDefaultSizesAndPositionsExtras(),
  countdownSpacing: 0,
  countdownColonSpacing: 0,
  timerFontSizePercent: 113,
  timerNameSizePercent: 33,
  messageSizePercent: 33,
  verticalAlignment: 'center',
  showProgressBar: false,
  progressBarHeightPx: 12,
  progressBarPosition: 'bottom',
  backgroundImageDataUrl: '',
  backgroundImageFileName: '',
  listBackgroundImages: {},
  logoImageDataUrl: '',
  logoImageFileName: '',
  listLogoImages: {},
  backgroundImageOpacity: 100,
  backgroundFit: 'cover',
  normalDigitsColor: '#ffffff',
  warningDigitsColor: '#eab308',
  dangerDigitsColor: '#ef4444',
  overtimeDigitsColor: '#ef4444',
  smoothTransitions: true,

  // NDI & Updates (matching NDI reference screenshot defaults)
  ndiResolution: 'HD - 1920 x 1080',
  ndiSourceName: 'ProTimer (List 1)',
  ndiAlphaChannel: false,
  ndiFrameRate: 30,
  ndiUseCustomGroups: false,
  ndiCustomGroups: 'Public',
  checkForUpdatesAutomatically: true,
};

