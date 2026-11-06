/**
 * Formatting and parsing utilities for production timers and clock displays.
 */

/**
 * Formats seconds into HH:MM:SS or MM:SS
 */
export function formatSeconds(seconds: number, forceHours = true, forceOvertimePlus = false): string {
  const isOvertime = seconds < 0 || forceOvertimePlus;
  const absSeconds = Math.abs(Math.round(seconds));

  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const remainingSecs = absSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  let result = '';
  if (hours > 0 || forceHours) {
    result = `${pad(hours)}:${pad(minutes)}:${pad(remainingSecs)}`;
  } else {
    result = `${pad(minutes)}:${pad(remainingSecs)}`;
  }

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
    // SS or Minutes? Usually minutes in production inputs if single number
    return parts[0] * 60;
  }
  return 0;
}

/**
 * Formats current Date into HH:MM:SS
 */
export function formatClock(date: Date = new Date(), is24h = true): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  if (!is24h) {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${pad(hours)}:${minutes}:${seconds} ${ampm}`;
  }

  return `${pad(hours)}:${minutes}:${seconds}`;
}

/**
 * Calculates projected End Time given duration and start time or now
 */
export function calculateEndTime(durationSeconds: number, fromDate: Date = new Date()): string {
  const endDate = new Date(fromDate.getTime() + durationSeconds * 1000);
  return formatClock(endDate, true);
}
