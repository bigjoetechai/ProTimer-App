/**
 * Robust CSV / TSV Timer Importer & Exporter Utilities.
 *
 * Handles:
 * - UTF-8 BOM stripping and Excel `sep=;` / `sep=,` / `sep=\t` directives
 * - Automatic delimiter detection (comma `,`, semicolon `;`, tab `\t`, pipe `|`)
 * - Full RFC-4180 quoted field parsing (embedded commas/semicolons/newlines, escaped `""`, stray mid-field quotes)
 * - Automatic recovery when entire CSV rows are wrapped in outer quotes (e.g. `"Opening,00:05:00,Countdown,Stop"`)
 * - Header-based column mapping with typo tolerance across any column order
 * - Normalization & typo correction for Timer Type, End Action, Duration, Start/End/Scheduled Times, Alerts, Speed, Notes, and Color
 */

import { EndAction, TimerType } from '../types';

export interface ParsedCsvTimerRow {
  name: string;
  durationSeconds: number;
  type: TimerType;
  endAction: EndAction;
  startTime?: string;
  endTime?: string;
  scheduledStartTime?: string;
  autoStart?: boolean;
  alert1Seconds?: number;
  alert2Seconds?: number;
  speed: number;
  notes?: string;
  colorTag?: string;
}

export interface CsvParseResult {
  rows: ParsedCsvTimerRow[];
  delimiter: string;
  detectedHeaders: boolean;
  columnMap: Partial<Record<CanonicalColumn, number>>;
}

type CanonicalColumn =
  | 'id'
  | 'name'
  | 'startTime'
  | 'duration'
  | 'endTime'
  | 'counter'
  | 'type'
  | 'alert1'
  | 'alert2'
  | 'endAction'
  | 'speed'
  | 'scheduledStartTime'
  | 'autoStart'
  | 'notes'
  | 'colorTag';

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const;

const NAMED_COLORS: Record<string, string> = {
  red: '#ef4444',
  rose: '#f43f5e',
  pink: '#ec4899',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  gray: '#64748b',
  grey: '#64748b',
  slate: '#64748b',
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function normalizeHeaderToken(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[%#]/g, (ch) => (ch === '#' ? ' # ' : ' '))
    .replace(/[_./\\-]+/g, ' ')
    .replace(/[^a-z0-9# ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  id: ['id', '#', 'no', 'num', 'number', 'index', 'order', 'cue', 'cue #', 'cue no', 'cue number', 'seq', 'sl', 'sr'],
  name: [
    'name',
    'timer name',
    'cue name',
    'title',
    'cue title',
    'item',
    'item name',
    'segment',
    'program',
    'event',
    'event name',
    'label',
    'activity',
    'session',
    'speaker',
    'topic',
    'service item',
    'description',
  ],
  startTime: ['start', 'start time', 'starttime', 'begin', 'begin time', 'starts at', 'start at'],
  duration: [
    'duration',
    'dur',
    'length',
    'time',
    'target duration',
    'countdown',
    'timer',
    'period',
    'minutes',
    'mins',
    'min',
    'seconds',
    'secs',
    'allocated',
    'allotted',
  ],
  endTime: ['end', 'end time', 'endtime', 'finish', 'finish time', 'ends at', 'stop time'],
  counter: ['counter', 'live counter', 'remaining', 'remaining time', 'elapsed'],
  type: ['type', 'timer type', 'timertype', 'mode', 'timer mode', 'kind', 'style'],
  alert1: [
    'alert 1',
    'alert1',
    'warning',
    'warning time',
    'warning alert',
    'warn',
    'yellow alert',
    'amber alert',
    'first alert',
  ],
  alert2: [
    'alert 2',
    'alert2',
    'danger',
    'danger time',
    'critical',
    'critical alert',
    'red alert',
    'second alert',
    'final alert',
  ],
  endAction: [
    'end action',
    'endaction',
    'on zero',
    'on end',
    'action',
    'after',
    'when done',
    'finish action',
    'end behavior',
    'end behaviour',
    'overtime action',
  ],
  speed: ['speed', 'rate', 'pace', 'playback speed', 'tempo'],
  scheduledStartTime: [
    'scheduled start',
    'scheduled start time',
    'schedule',
    'scheduled',
    'scheduled time',
    'auto start time',
    'start schedule',
  ],
  autoStart: ['auto start', 'autostart', 'auto', 'scheduled auto'],
  notes: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments', 'message', 'details', 'memo'],
  colorTag: ['color', 'colour', 'color tag', 'tag color', 'highlight', 'swatch'],
};

function matchHeaderColumn(rawHeader: string): CanonicalColumn | null {
  const norm = normalizeHeaderToken(rawHeader);
  if (!norm) return null;

  // 1. Exact alias match
  for (const [col, aliases] of Object.entries(HEADER_ALIASES) as [CanonicalColumn, string[]][]) {
    if (aliases.includes(norm)) return col;
  }

  // 2. Fuzzy typo match (Levenshtein distance <= 1 for 4-5 char words, <= 2 for 6+ char words)
  let bestCol: CanonicalColumn | null = null;
  let bestDist = Infinity;
  for (const [col, aliases] of Object.entries(HEADER_ALIASES) as [CanonicalColumn, string[]][]) {
    for (const alias of aliases) {
      if (alias.length < 4 || norm.length < 4) continue;
      // Don't confuse alert 1 vs alert 2
      if ((alias.includes('1') && norm.includes('2')) || (alias.includes('2') && norm.includes('1'))) {
        continue;
      }
      const maxAllowed = alias.length >= 6 ? 2 : 1;
      const dist = levenshtein(norm, alias);
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist;
        bestCol = col;
      }
    }
  }
  return bestCol;
}

/**
 * RFC-4180 compliant character-level parser that also tolerates stray quotes
 * inside unquoted fields (e.g. `5" Monitor,00:05:00`) so a stray quote never
 * swallows subsequent columns into the Name field.
 */
function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let atFieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && atFieldStart) {
      // Only treat `"` as a field opener if the field so far is purely whitespace
      if (field.trim().length === 0) {
        field = '';
        inQuotes = true;
        atFieldStart = false;
        continue;
      }
    }

    if (ch === delimiter) {
      row.push(field.trim());
      field = '';
      atFieldStart = true;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      atFieldStart = true;
      continue;
    }

    field += ch;
    if (ch !== ' ' && ch !== '\t') {
      atFieldStart = false;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function countUnquotedDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  let atStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"' && atStart) {
      inQuotes = true;
      atStart = false;
      continue;
    }
    if (ch === delimiter) {
      count++;
      atStart = true;
    } else if (ch !== ' ' && ch !== '\t') {
      atStart = false;
    }
  }
  return count;
}

function detectBestDelimiter(text: string): string {
  const sampleLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 12);

  if (sampleLines.length === 0) return ',';

  let bestDelim: string = ',';
  let bestScore = -1;

  for (const delim of CANDIDATE_DELIMITERS) {
    const counts = sampleLines.map((line) => countUnquotedDelimiter(line, delim));
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;

    // Mode / consistency bonus: real CSV delimiters produce identical column counts per row
    const freq = new Map<number, number>();
    for (const c of nonZero) {
      freq.set(c, (freq.get(c) || 0) + 1);
    }
    const maxConsistency = Math.max(...freq.values());
    const consistencyRatio = maxConsistency / sampleLines.length;

    // Header bonus: splitting line 0 by this delimiter yields recognized column headers
    const firstRowCells = parseDelimitedText(sampleLines[0], delim)[0] || [];
    let headerMatches = 0;
    for (const cell of firstRowCells) {
      if (matchHeaderColumn(cell)) headerMatches++;
    }

    const avgCount = nonZero.reduce((sum, c) => sum + c, 0) / sampleLines.length;
    const score =
      headerMatches * 25 +
      consistencyRatio * 40 +
      Math.min(avgCount, 12) * 3 +
      (delim === ',' ? 0.5 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  return bestDelim;
}

function isEmptyPlaceholder(val?: string): boolean {
  if (!val) return true;
  const norm = val.trim().toLowerCase();
  return (
    norm === '' ||
    norm === '-' ||
    norm === '--' ||
    norm === '—' ||
    norm === '--:--' ||
    norm === '--:--:--' ||
    norm === 'none' ||
    norm === 'null' ||
    norm === 'n/a' ||
    norm === 'na' ||
    norm === 'off'
  );
}

/**
 * Parses duration strings into seconds:
 * - `HH:MM:SS` / `MM:SS` / `HH:MM:SS.ms`
 * - `1h 30m 15s`, `15 min`, `10m`, `45s`, `1.5m`, `1.5h`
 * - Plain numbers (seconds by default, or minutes when `treatPlainNumberAsMinutes` is true)
 */
export function parseDurationToSeconds(
  raw: string | undefined,
  options?: { treatPlainNumberAsMinutes?: boolean }
): number | undefined {
  if (isEmptyPlaceholder(raw)) return undefined;
  const cleaned = raw!.trim();

  // HH:MM:SS or MM:SS (also allows fractional seconds like 00:05:00.000)
  const colonMatch = cleaned.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?$/);
  if (colonMatch) {
    if (colonMatch[3] !== undefined) {
      const h = parseInt(colonMatch[1], 10);
      const m = parseInt(colonMatch[2], 10);
      const s = parseInt(colonMatch[3], 10);
      return Math.max(0, h * 3600 + m * 60 + s);
    }
    const m = parseInt(colonMatch[1], 10);
    const s = parseInt(colonMatch[2], 10);
    return Math.max(0, m * 60 + s);
  }

  // Human-readable duration e.g. "1h 15m 30s", "10 mins", "5 minutes", "45 sec", "1.5m"
  const unitRegex = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  let total = 0;
  let matchedUnit = false;
  let match: RegExpExecArray | null;
  while ((match = unitRegex.exec(cleaned)) !== null) {
    matchedUnit = true;
    const val = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('h')) total += val * 3600;
    else if (unit.startsWith('m')) total += val * 60;
    else total += val;
  }
  if (matchedUnit) {
    return Math.max(0, Math.round(total));
  }

  // Plain numeric string
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    const num = parseFloat(cleaned);
    return Math.max(0, Math.round(options?.treatPlainNumberAsMinutes ? num * 60 : num));
  }

  return undefined;
}

export function normalizeClockTime(raw: string | undefined): string | undefined {
  if (isEmptyPlaceholder(raw)) return undefined;
  const cleaned = raw!.trim();

  // 12-hour format with AM/PM: e.g. "9:30 AM", "02:15:30 pm", "12:00 PM"
  const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = Math.min(59, parseInt(ampmMatch[2], 10));
    const s = Math.min(59, ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0);
    const meridiem = ampmMatch[4].toLowerCase();
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    h = Math.max(0, Math.min(23, h));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // 24-hour format: e.g. "9:00", "14:30", "09:05:30"
  const h24Match = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (h24Match) {
    const h = Math.max(0, Math.min(23, parseInt(h24Match[1], 10)));
    const m = Math.max(0, Math.min(59, parseInt(h24Match[2], 10)));
    const s = Math.max(0, Math.min(59, h24Match[3] ? parseInt(h24Match[3], 10) : 0));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return undefined;
}

const TIMER_TYPE_ALIASES: Record<TimerType, string[]> = {
  countdown: ['countdown', 'count down', 'cd', 'timer', 'down', 'coundown', 'coutdown', 'countdwon'],
  count_down: [],
  count_up: ['count up', 'countup', 'cu', 'up', 'elapsed', 'coutup', 'countp'],
  stopwatch: ['stopwatch', 'stop watch', 'sw', 'stopwtach', 'stopwach', 'lap timer'],
  digital_clock: ['digital clock', 'clock', 'time of day', 'tod', 'wall clock', 'digtal clock', 'clok', 'time'],
  meeting_timer: ['meeting timer', 'meeting', 'end time', 'endtime', 'until', 'meting', 'meeting time'],
  empty: ['empty', 'blank', 'header', 'section'],
  spacer: ['spacer', 'separator', 'divider', 'break'],
};

export function normalizeTimerType(raw: string | undefined): TimerType {
  if (isEmptyPlaceholder(raw)) return 'countdown';
  const norm = raw!
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  for (const [canonical, aliases] of Object.entries(TIMER_TYPE_ALIASES) as [TimerType, string[]][]) {
    if (canonical === 'count_down') continue;
    if (aliases.includes(norm)) return canonical;
  }

  // Fuzzy fallback for typos
  let bestType: TimerType = 'countdown';
  let bestDist = Infinity;
  for (const [canonical, aliases] of Object.entries(TIMER_TYPE_ALIASES) as [TimerType, string[]][]) {
    if (canonical === 'count_down') continue;
    for (const alias of aliases) {
      if (alias.length < 4) continue;
      const dist = levenshtein(norm, alias);
      const maxAllowed = alias.length >= 7 ? 2 : 1;
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist;
        bestType = canonical;
      }
    }
  }

  return bestType;
}

const END_ACTION_ALIASES: Record<EndAction, string[]> = {
  count_up: [
    'count up',
    'countup',
    'overtime',
    'over time',
    'ot',
    'ovetime',
    'ovretime',
    'continue',
    'keep counting',
    'keep going',
    'negative',
  ],
  next_timer: [
    'next timer',
    'nexttimer',
    'next',
    'next cue',
    'auto next',
    'autonext',
    'advance',
    'nxt',
    'next timr',
    'next time',
  ],
  stop: ['stop', 'halt', 'hold', 'pause', 'end', 'stp', 'stop at zero', 'stay at zero'],
  loop: ['loop', 'repeat', 'restart', 'cycle', 'lop'],
  blackout: ['blackout', 'black out', 'blakout', 'blank', 'black', 'dark', 'clear'],
  none: ['none', 'nothing', 'no action', 'idle'],
};

export function normalizeEndAction(raw: string | undefined): EndAction {
  if (isEmptyPlaceholder(raw)) return 'stop';
  const norm = raw!
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  for (const [canonical, aliases] of Object.entries(END_ACTION_ALIASES) as [EndAction, string[]][]) {
    if (aliases.includes(norm)) return canonical;
  }

  // Fuzzy fallback for typos
  let bestAction: EndAction = 'stop';
  let bestDist = Infinity;
  for (const [canonical, aliases] of Object.entries(END_ACTION_ALIASES) as [EndAction, string[]][]) {
    for (const alias of aliases) {
      if (alias.length < 4) continue;
      const dist = levenshtein(norm, alias);
      const maxAllowed = alias.length >= 7 ? 2 : 1;
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist;
        bestAction = canonical;
      }
    }
  }

  return bestAction;
}

export function normalizeSpeed(raw: string | undefined): number {
  if (isEmptyPlaceholder(raw)) return 100;
  const cleaned = raw!.trim().toLowerCase();

  // Multiplier form e.g. "1.5x", "0.5x", "2x"
  const multMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*x$/);
  if (multMatch) {
    const pct = Math.round(parseFloat(multMatch[1]) * 100);
    return Math.max(1, Math.min(200, pct));
  }

  // Percentage or plain integer e.g. "100%", "125"
  const pctMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (pctMatch) {
    const pct = Math.round(parseFloat(pctMatch[1]));
    if (pct > 0) return Math.max(1, Math.min(200, pct));
  }

  return 100;
}

function normalizeBoolean(raw: string | undefined): boolean | undefined {
  if (isEmptyPlaceholder(raw)) return undefined;
  const norm = raw!.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'on', 'enabled', 'auto'].includes(norm)) return true;
  if (['false', 'no', 'n', '0', 'off', 'disabled'].includes(norm)) return false;
  return undefined;
}

function normalizeColor(raw: string | undefined): string | undefined {
  if (isEmptyPlaceholder(raw)) return undefined;
  const cleaned = raw!.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cleaned)) return cleaned;
  return NAMED_COLORS[cleaned];
}

function looksLikeTimeOrDuration(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim();
  return (
    /^\d{1,3}:\d{2}(?::\d{2})?(\s*(am|pm))?$/i.test(s) ||
    /^\d+(?:\.\d+)?\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)$/i.test(s)
  );
}

/**
 * Parse a full CSV/TSV string into normalized ProTimer cue rows.
 */
export function parseTimersCsv(rawCsvText: string): CsvParseResult {
  // 1. Strip UTF-8 BOM & normalize leading/trailing whitespace
  let text = rawCsvText.replace(/^\uFEFF/, '').replace(/\0/g, '');

  // 2. Check for Excel `sep=X` directive on the very first non-empty line
  let explicitDelimiter: string | null = null;
  const sepMatch = text.match(/^\s*sep\s*=\s*(.)\s*\r?\n/i);
  if (sepMatch) {
    explicitDelimiter = sepMatch[1];
    text = text.slice(sepMatch[0].length);
  }

  // 3. Detect best delimiter and parse into 2D grid
  let delimiter = explicitDelimiter || detectBestDelimiter(text);
  let grid = parseDelimitedText(text, delimiter);

  // 4. Recovery: if nearly every row collapsed into 1 single column (e.g. entire rows wrapped in outer quotes `"Name,Duration,Type"`),
  //    unwrap the single column and re-detect the inner delimiter!
  if (grid.length > 0) {
    const singleColCount = grid.filter((r) => r.length === 1).length;
    if (singleColCount / grid.length >= 0.8) {
      const unwrappedText = grid.map((r) => r[0]).join('\n');
      const innerDelim = detectBestDelimiter(unwrappedText);
      const reparsed = parseDelimitedText(unwrappedText, innerDelim);
      const multiColCount = reparsed.filter((r) => r.length > 1).length;
      if (multiColCount / reparsed.length >= 0.5) {
        delimiter = innerDelim;
        grid = reparsed;
      }
    }
  }

  if (grid.length === 0) {
    return { rows: [], delimiter, detectedHeaders: false, columnMap: {} };
  }

  // 5. Detect header row & map columns by normalized / typo-tolerant header names
  const firstRow = grid[0];
  const headerMap: Partial<Record<CanonicalColumn, number>> = {};
  let headerHits = 0;
  let durationHeaderMentionsMinutes = false;

  firstRow.forEach((cell, idx) => {
    const matched = matchHeaderColumn(cell);
    if (matched) {
      headerHits++;
      if (headerMap[matched] === undefined) {
        headerMap[matched] = idx;
      }
      if (matched === 'duration' && /\b(min|mins|minutes?)\b/i.test(cell)) {
        durationHeaderMentionsMinutes = true;
      }
    }
  });

  const isHeaderRow =
    headerHits >= 2 ||
    (firstRow.length <= 2 && headerHits >= 1 && !looksLikeTimeOrDuration(firstRow[1]));

  let columnMap: Partial<Record<CanonicalColumn, number>> = {};
  let dataStartIndex = 0;

  if (isHeaderRow) {
    columnMap = headerMap;
    dataStartIndex = 1;
  } else {
    // Headerless CSV: infer positional layout cleanly
    const sampleRows = grid.slice(0, Math.min(5, grid.length));
    const col0LooksLikeId =
      sampleRows.length > 0 &&
      sampleRows.every((r) => r.length >= 3 && /^\d+$/.test(r[0]) && !/^\d+$/.test(r[1]));
    const offset = col0LooksLikeId ? 1 : 0;

    // Check if column `offset + 1` is a Start Time (followed by Duration in `offset + 2`)
    const looksLikeTableLayout =
      sampleRows.some(
        (r) =>
          r.length >= offset + 7 &&
          (isEmptyPlaceholder(r[offset + 1]) || looksLikeTimeOrDuration(r[offset + 1])) &&
          looksLikeTimeOrDuration(r[offset + 2])
      );

    if (looksLikeTableLayout) {
      columnMap = {
        name: offset,
        startTime: offset + 1,
        duration: offset + 2,
        endTime: offset + 3,
        type: offset + 4,
        alert1: offset + 5,
        alert2: offset + 6,
        endAction: offset + 7,
        speed: offset + 8,
        scheduledStartTime: offset + 9,
        notes: offset + 10,
      };
    } else {
      // Classic ProTimer CSV layout: Name, Duration, Type, End Action, Alert 1, Alert 2, Scheduled Start, Notes
      columnMap = {
        name: offset,
        duration: offset + 1,
        type: offset + 2,
        endAction: offset + 3,
        alert1: offset + 4,
        alert2: offset + 5,
        scheduledStartTime: offset + 6,
        notes: offset + 7,
      };
    }
  }

  // Fallback if header row was detected but somehow had no Name column matched
  if (columnMap.name === undefined) {
    const usedIndices = new Set(Object.values(columnMap));
    for (let i = 0; i < firstRow.length; i++) {
      if (!usedIndices.has(i)) {
        columnMap.name = i;
        break;
      }
    }
    if (columnMap.name === undefined) {
      columnMap.name = columnMap.id === 0 ? 1 : 0;
    }
  }

  const getCell = (row: string[], col: CanonicalColumn): string | undefined => {
    const idx = columnMap[col];
    if (idx === undefined || idx < 0 || idx >= row.length) return undefined;
    return row[idx];
  };

  // 6. Convert each data row into a clean, normalized timer record
  const parsedRows: ParsedCsvTimerRow[] = [];

  for (let i = dataStartIndex; i < grid.length; i++) {
    const row = grid[i];
    if (!row || row.every((c) => c.trim().length === 0)) continue;

    const rawName = (getCell(row, 'name') || '').replace(/\s*\r?\n\s*/g, ' ').trim();
    const rawDuration = getCell(row, 'duration');
    const rawType = getCell(row, 'type');
    const rawEndAction = getCell(row, 'endAction');
    const rawAlert1 = getCell(row, 'alert1');
    const rawAlert2 = getCell(row, 'alert2');
    const rawStartTime = getCell(row, 'startTime');
    const rawEndTime = getCell(row, 'endTime');
    const rawScheduledStart = getCell(row, 'scheduledStartTime');
    const rawAutoStart = getCell(row, 'autoStart');
    const rawSpeed = getCell(row, 'speed');
    const rawNotes = getCell(row, 'notes');
    const rawColor = getCell(row, 'colorTag');

    // Skip rows that have neither a name nor a duration
    if (!rawName && isEmptyPlaceholder(rawDuration)) continue;

    const type = normalizeTimerType(rawType);
    const endAction = normalizeEndAction(rawEndAction);

    const parsedDur = parseDurationToSeconds(rawDuration, {
      treatPlainNumberAsMinutes: durationHeaderMentionsMinutes,
    });
    const isZeroDefaultType =
      type === 'empty' || type === 'spacer' || type === 'stopwatch' || type === 'digital_clock' || type === 'count_up';
    const durationSeconds = parsedDur !== undefined ? parsedDur : isZeroDefaultType ? 0 : 300;

    const alert1RawSec = parseDurationToSeconds(rawAlert1);
    const alert2RawSec = parseDurationToSeconds(rawAlert2);
    const alert1Seconds = alert1RawSec !== undefined && alert1RawSec > 0 ? alert1RawSec : undefined;
    const alert2Seconds = alert2RawSec !== undefined && alert2RawSec > 0 ? alert2RawSec : undefined;

    const normalizedStart = normalizeClockTime(rawStartTime);
    const normalizedEnd = normalizeClockTime(rawEndTime);
    const normalizedScheduled = normalizeClockTime(rawScheduledStart);
    const autoStartFlag = normalizeBoolean(rawAutoStart);

    const startTime = normalizedStart || normalizedScheduled;
    const scheduledStartTime = normalizedScheduled || (autoStartFlag ? normalizedStart : undefined);
    const autoStart = autoStartFlag !== undefined ? autoStartFlag : Boolean(normalizedScheduled);

    parsedRows.push({
      name: rawName || `Cue ${parsedRows.length + 1}`,
      durationSeconds,
      type,
      endAction,
      startTime,
      endTime: normalizedEnd,
      scheduledStartTime,
      autoStart: scheduledStartTime ? autoStart : false,
      alert1Seconds,
      alert2Seconds,
      speed: normalizeSpeed(rawSpeed),
      notes: rawNotes && !isEmptyPlaceholder(rawNotes) ? rawNotes.trim() : undefined,
      colorTag: normalizeColor(rawColor),
    });
  }

  return {
    rows: parsedRows,
    delimiter,
    detectedHeaders: isHeaderRow,
    columnMap,
  };
}
