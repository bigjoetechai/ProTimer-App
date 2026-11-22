/**
 * Unique identifier generator for timers, messages, and lists.
 */

export function generateId(prefix = 'tm'): string {
  const rand = Math.random().toString(36).substring(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}_${rand}`;
}
