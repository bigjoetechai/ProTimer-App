/**
 * Persistent storage for Presenter and Preview window position and size.
 * Handles both in-app floating overlays and standalone browser pop-out windows.
 */

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ManagedWindowKind = 'presenter' | 'preview';

const FLOATING_KEYS: Record<ManagedWindowKind, string> = {
  presenter: 'protimer_floating_presenter_bounds',
  preview: 'protimer_floating_preview_bounds',
};

const POPOUT_KEYS: Record<ManagedWindowKind, string> = {
  presenter: 'protimer_popout_presenter_bounds',
  preview: 'protimer_popout_preview_bounds',
};

function isValidBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y) &&
    typeof candidate.width === 'number' &&
    Number.isFinite(candidate.width) &&
    typeof candidate.height === 'number' &&
    Number.isFinite(candidate.height)
  );
}

/**
 * Clamp floating overlay bounds so the window always stays reachable
 * inside the current browser viewport.
 */
export function clampFloatingBounds(
  bounds: WindowBounds,
  minWidth = 150,
  minHeight = 90
): WindowBounds {
  if (typeof window === 'undefined') {
    return {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(minWidth, Math.round(bounds.width)),
      height: Math.max(minHeight, Math.round(bounds.height)),
    };
  }

  const maxW = Math.max(minWidth, window.innerWidth - 16);
  const maxH = Math.max(minHeight, window.innerHeight - 16);
  const width = Math.min(maxW, Math.max(minWidth, Math.round(bounds.width)));
  const height = Math.min(maxH, Math.max(minHeight, Math.round(bounds.height)));

  const maxX = Math.max(0, window.innerWidth - Math.min(width, 80));
  const maxY = Math.max(0, window.innerHeight - Math.min(height, 40));
  const x = Math.min(maxX, Math.max(0, Math.round(bounds.x)));
  const y = Math.min(maxY, Math.max(0, Math.round(bounds.y)));

  return { x, y, width, height };
}

export function loadFloatingWindowBounds(
  kind: ManagedWindowKind,
  defaultBounds: WindowBounds,
  minWidth = 150,
  minHeight = 90
): WindowBounds {
  if (typeof window === 'undefined') return defaultBounds;
  try {
    const raw = window.localStorage.getItem(FLOATING_KEYS[kind]);
    if (!raw) return clampFloatingBounds(defaultBounds, minWidth, minHeight);
    const parsed: unknown = JSON.parse(raw);
    if (!isValidBounds(parsed)) {
      return clampFloatingBounds(defaultBounds, minWidth, minHeight);
    }
    return clampFloatingBounds(parsed, minWidth, minHeight);
  } catch {
    return clampFloatingBounds(defaultBounds, minWidth, minHeight);
  }
}

export function saveFloatingWindowBounds(kind: ManagedWindowKind, bounds: WindowBounds): void {
  if (typeof window === 'undefined' || !isValidBounds(bounds)) return;
  try {
    const payload: WindowBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
    window.localStorage.setItem(FLOATING_KEYS[kind], JSON.stringify(payload));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function loadPopoutWindowBounds(
  kind: ManagedWindowKind,
  defaultBounds: WindowBounds,
  minWidth = 150,
  minHeight = 90
): WindowBounds {
  if (typeof window === 'undefined') return defaultBounds;
  try {
    const raw = window.localStorage.getItem(POPOUT_KEYS[kind]);
    if (!raw) return defaultBounds;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidBounds(parsed)) return defaultBounds;
    const width = Math.max(minWidth, Math.round(parsed.width));
    const height = Math.max(minHeight, Math.round(parsed.height));
    return {
      x: Math.round(parsed.x),
      y: Math.round(parsed.y),
      width,
      height,
    };
  } catch {
    return defaultBounds;
  }
}

export function savePopoutWindowBounds(kind: ManagedWindowKind, bounds: WindowBounds): void {
  if (typeof window === 'undefined' || !isValidBounds(bounds)) return;
  try {
    const payload: WindowBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(150, Math.round(bounds.width)),
      height: Math.max(90, Math.round(bounds.height)),
    };
    window.localStorage.setItem(POPOUT_KEYS[kind], JSON.stringify(payload));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}
