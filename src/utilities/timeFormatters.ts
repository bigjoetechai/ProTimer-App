/**
 * Formatting and parsing utilities for production timers and clock displays.
 */

import { DEFAULT_PREFERENCES, AppPreferences } from '../types/settings';

function getActiveFormattingPrefs(): AppPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem('protimer_preferences');
    if (raw) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore storage read error
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Formats seconds into HH:MM:SS or MM:SS respecting user Countdown & General Preferences.
 */
export function formatSeconds(
  seconds: number,
  forceHours = true,
  forceOvertimePlus = false,
  prefsOverride?: AppPreferences
): string {
  const prefs = prefsOverride || getActiveFormattingPrefs();
  const isOvertime = seconds < 0 || forceOvertimePlus;
  const absSeconds = Math.abs(Math.round(seconds));

  const hideZeros = prefs.hideLeadingZeros ?? false;
  const displayHours = prefs.displayHours ?? true;
  const displaySeconds = prefs.displaySeconds ?? true;
  const hideHoursUnderOneHour = prefs.hideHoursUnderOneHour ?? false;
  const sumHoursIntoMinutes = prefs.sumHoursIntoMinutes ?? false;

  const hours = Math.floor(absSeconds / 3600);
  const minutes = sumHoursIntoMinutes
    ? Math.floor(absSeconds / 60)
    : Math.floor((absSeconds % 3600) / 60);
  const remainingSecs = absSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatLead = (n: number) => (hideZeros ? n.toString() : pad(n));

  const showHoursField =
    !sumHoursIntoMinutes &&
    displayHours &&
    (hours > 0 || (forceHours && !hideHoursUnderOneHour));

  const parts: string[] = [];

  if (showHoursField) {
    parts.push(formatLead(hours));
    parts.push(pad(minutes));
  } else {
    parts.push(formatLead(minutes));
  }

  if (displaySeconds) {
    parts.push(pad(remainingSecs));
  }

  const result = parts.join(':');
  return isOvertime ? `+${result}` : result;
}

/**
 * Parses HH:MM:SS or MM:SS into total seconds
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0] * 60;
  }
  return 0;
}

/**
 * Formats current Date into HH:MM:SS or HH:MM respecting Clock Options in Preferences.
 */
export function formatClock(
  date: Date = new Date(),
  is24hOverride?: boolean,
  prefsOverride?: AppPreferences
): string {
  const prefs = prefsOverride || getActiveFormattingPrefs();
  const is24h = is24hOverride !== undefined ? is24hOverride : (prefs.timeFormat24h ?? true);
  const showSeconds = prefs.clockDisplaySeconds ?? false;
  const hideZeros = prefs.hideLeadingZeros ?? false;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatLead = (n: number) => (hideZeros ? n.toString() : pad(n));

  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  if (!is24h) {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return showSeconds
      ? `${formatLead(hours)}:${minutes}:${seconds} ${ampm}`
      : `${formatLead(hours)}:${minutes} ${ampm}`;
  }

  return showSeconds
    ? `${formatLead(hours)}:${minutes}:${seconds}`
    : `${formatLead(hours)}:${minutes}`;
}

/**
 * Formats current Date according to Date Options in Preferences ('short', 'long', 'iso', 'dmy', 'mdy').
 */
export function formatDate(date: Date = new Date(), prefsOverride?: AppPreferences): string {
  const prefs = prefsOverride || getActiveFormattingPrefs();
  const format = prefs.dateFormat || 'short';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  switch (format) {
    case 'iso':
      return `${y}-${m}-${d}`;
    case 'dmy':
      return `${d}/${m}/${y}`;
    case 'mdy':
      return `${m}/${d}/${y}`;
    case 'long':
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'short':
    default:
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
  }
}

/**
 * Calculates projected End Time given duration and start time or now
 */
export function calculateEndTime(durationSeconds: number, fromDate: Date = new Date()): string {
  const endDate = new Date(fromDate.getTime() + durationSeconds * 1000);
  return formatClock(endDate);
}
