/**
 * Application Settings and Preferences types.
 */

export interface AppPreferences {
  theme: 'dark' | 'light';
  defaultTimerType: 'count_down' | 'count_up' | 'time_of_day';
  defaultDurationSeconds: number; // e.g. 600 (10 mins)
  defaultWarningSeconds: number; // e.g. 120 (2 mins)
  defaultDangerSeconds: number;  // e.g. 60 (1 min)
  soundAlertsEnabled: boolean;
  flashAlertsEnabled: boolean;
  timeFormat24h: boolean;
  syncChannelName: string;
  autoCueNext: boolean;
  hotkeysEnabled: boolean;
  fullscreenMonitor: string;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  defaultTimerType: 'count_down',
  defaultDurationSeconds: 600, // 10 minutes
  defaultWarningSeconds: 120, // 2 minutes
  defaultDangerSeconds: 60,   // 1 minute
  soundAlertsEnabled: true,
  flashAlertsEnabled: true,
  timeFormat24h: true,
  syncChannelName: 'protimer_sync_v1',
  autoCueNext: true,
  hotkeysEnabled: true,
  fullscreenMonitor: 'Auto',
};
