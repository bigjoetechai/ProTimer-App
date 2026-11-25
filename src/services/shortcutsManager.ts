export type ShortcutCategory = 'transport' | 'tabs' | 'display';

export type ShortcutActionId =
  | 'timer.togglePlayPause'
  | 'timer.start'
  | 'timer.stop'
  | 'timer.reset'
  | 'timer.restart'
  | 'timer.cueNext'
  | 'timer.cuePrev'
  | 'timer.addMinute'
  | 'timer.subMinute'
  | 'tabs.next'
  | 'tabs.prev'
  | 'tabs.history'
  | 'tabs.tab1'
  | 'tabs.tab2'
  | 'tabs.tab3'
  | 'tabs.tab4'
  | 'tabs.tab5'
  | 'tabs.tab6'
  | 'tabs.tab7'
  | 'tabs.tab8'
  | 'tabs.tab9'
  | 'display.blackout'
  | 'display.message'
  | 'display.listManager'
  | 'display.fullscreen'
  | 'app.undo'
  | 'app.redo'
  | 'app.shortcuts';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  description: string;
  category: ShortcutCategory;
  defaultCombo: string;
  allowRepeat?: boolean;
  /** Runs even when a non-recording modal is open (e.g. Ctrl+K) */
  allowInModals?: boolean;
}

export interface ShortcutBinding extends ShortcutDefinition {
  combo: string;
  enabled: boolean;
  isCustomized: boolean;
}

export interface ShortcutsState {
  globalEnabled: boolean;
  bindings: Record<ShortcutActionId, ShortcutBinding>;
}

interface StoredShortcutOverride {
  combo?: string;
  enabled?: boolean;
}

interface PersistedShortcutsPayload {
  globalEnabled?: boolean;
  overrides?: Partial<Record<ShortcutActionId, StoredShortcutOverride>>;
}

const STORAGE_KEY = 'protimer_keyboard_shortcuts_v1';

export const SHORTCUT_CATEGORIES: { id: ShortcutCategory; label: string }[] = [
  { id: 'transport', label: 'Timer Transport' },
  { id: 'tabs', label: 'Tab Navigation' },
  { id: 'display', label: 'Display & Workspace' },
];

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // Timer Transport
  {
    id: 'timer.togglePlayPause',
    label: 'Start / Pause Timer',
    description: 'Toggle the active timer between running and paused.',
    category: 'transport',
    defaultCombo: 'Space',
  },
  {
    id: 'timer.start',
    label: 'Start Timer',
    description: 'Start or resume the active or cued timer immediately.',
    category: 'transport',
    defaultCombo: 'S',
  },
  {
    id: 'timer.stop',
    label: 'Stop Timer',
    description: 'Stop the active timer (or exit full-screen display if active).',
    category: 'transport',
    defaultCombo: 'Escape',
  },
  {
    id: 'timer.reset',
    label: 'Reset / Cue Timer',
    description: 'Reset the active timer back to its configured starting duration.',
    category: 'transport',
    defaultCombo: 'R',
  },
  {
    id: 'timer.restart',
    label: 'Restart Timer',
    description: 'Reset the active timer to its start time and immediately begin running.',
    category: 'transport',
    defaultCombo: 'Shift+R',
  },
  {
    id: 'timer.cueNext',
    label: 'Next Cue',
    description: 'Cue the next timer in the active list.',
    category: 'transport',
    defaultCombo: 'C',
  },
  {
    id: 'timer.cuePrev',
    label: 'Previous Cue',
    description: 'Cue the previous timer in the active list.',
    category: 'transport',
    defaultCombo: 'Shift+C',
  },
  {
    id: 'timer.addMinute',
    label: 'Add +1 Minute',
    description: 'Add one minute to the active timer duration.',
    category: 'transport',
    defaultCombo: 'Equal',
    allowRepeat: true,
  },
  {
    id: 'timer.subMinute',
    label: 'Subtract -1 Minute',
    description: 'Subtract one minute from the active timer duration.',
    category: 'transport',
    defaultCombo: 'Minus',
    allowRepeat: true,
  },

  // Tab Navigation
  {
    id: 'tabs.next',
    label: 'Next List Tab',
    description: 'Switch to the next timer list tab on the bottom bar.',
    category: 'tabs',
    defaultCombo: 'Alt+ArrowRight',
  },
  {
    id: 'tabs.prev',
    label: 'Previous List Tab',
    description: 'Switch to the previous timer list tab on the bottom bar.',
    category: 'tabs',
    defaultCombo: 'Alt+ArrowLeft',
  },
  {
    id: 'tabs.history',
    label: 'Toggle History Tab',
    description: 'Switch between the active cues list and the timer history log.',
    category: 'tabs',
    defaultCombo: 'Alt+H',
  },
  {
    id: 'tabs.tab1',
    label: 'Switch to Tab 1',
    description: 'Jump directly to the 1st timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+1',
  },
  {
    id: 'tabs.tab2',
    label: 'Switch to Tab 2',
    description: 'Jump directly to the 2nd timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+2',
  },
  {
    id: 'tabs.tab3',
    label: 'Switch to Tab 3',
    description: 'Jump directly to the 3rd timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+3',
  },
  {
    id: 'tabs.tab4',
    label: 'Switch to Tab 4',
    description: 'Jump directly to the 4th timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+4',
  },
  {
    id: 'tabs.tab5',
    label: 'Switch to Tab 5',
    description: 'Jump directly to the 5th timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+5',
  },
  {
    id: 'tabs.tab6',
    label: 'Switch to Tab 6',
    description: 'Jump directly to the 6th timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+6',
  },
  {
    id: 'tabs.tab7',
    label: 'Switch to Tab 7',
    description: 'Jump directly to the 7th timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+7',
  },
  {
    id: 'tabs.tab8',
    label: 'Switch to Tab 8',
    description: 'Jump directly to the 8th timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+8',
  },
  {
    id: 'tabs.tab9',
    label: 'Switch to Tab 9',
    description: 'Jump directly to the 9th timer list tab.',
    category: 'tabs',
    defaultCombo: 'Alt+9',
  },

  // Display & Workspace
  {
    id: 'display.blackout',
    label: 'Toggle Blackout',
    description: 'Black out or restore all presenter output displays.',
    category: 'display',
    defaultCombo: 'H',
  },
  {
    id: 'display.message',
    label: 'Stage Message',
    description: 'Open the live stage message composer.',
    category: 'display',
    defaultCombo: 'M',
  },
  {
    id: 'display.listManager',
    label: 'Manage Lists',
    description: 'Open the timer lists manager modal.',
    category: 'display',
    defaultCombo: 'L',
  },
  {
    id: 'display.fullscreen',
    label: 'App Fullscreen',
    description: 'Toggle application full-screen mode.',
    category: 'display',
    defaultCombo: 'F11',
  },
  {
    id: 'app.undo',
    label: 'Undo',
    description: 'Undo the last cue list change.',
    category: 'display',
    defaultCombo: 'Ctrl+Z',
  },
  {
    id: 'app.redo',
    label: 'Redo',
    description: 'Redo the previously undone cue list change.',
    category: 'display',
    defaultCombo: 'Ctrl+Y',
  },
  {
    id: 'app.shortcuts',
    label: 'Keyboard Shortcuts Manager',
    description: 'Open or close the keyboard shortcuts manager.',
    category: 'display',
    defaultCombo: 'Ctrl+K',
    allowInModals: true,
  },
];

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'OS']);

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
}

/**
 * Normalizes a DOM KeyboardEvent into a canonical, cross-platform combo string
 * such as "Space", "Shift+R", "Alt+ArrowRight", "Alt+1", "Ctrl+K".
 * Uses e.code so macOS Option/Alt dead keys (e.g. Alt+1 -> ¡) match reliably.
 */
export function normalizeKeyboardEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code) || MODIFIER_KEYS.has(e.key)) {
    return null;
  }

  let keyToken = '';

  if (e.code) {
    if (/^Key[A-Z]$/.test(e.code)) {
      keyToken = e.code.slice(3);
    } else if (/^Digit[0-9]$/.test(e.code)) {
      keyToken = e.code.slice(5);
    } else if (/^Numpad[0-9]$/.test(e.code)) {
      keyToken = e.code.slice(6);
    } else if (/^F([1-9]|1[0-2])$/.test(e.code)) {
      keyToken = e.code;
    } else {
      switch (e.code) {
        case 'Space':
          keyToken = 'Space';
          break;
        case 'Escape':
          keyToken = 'Escape';
          break;
        case 'Enter':
        case 'NumpadEnter':
          keyToken = 'Enter';
          break;
        case 'Tab':
          keyToken = 'Tab';
          break;
        case 'Backspace':
          keyToken = 'Backspace';
          break;
        case 'Delete':
          keyToken = 'Delete';
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'Home':
        case 'End':
        case 'PageUp':
        case 'PageDown':
          keyToken = e.code;
          break;
        case 'Equal':
        case 'NumpadAdd':
          keyToken = 'Equal';
          break;
        case 'Minus':
        case 'NumpadSubtract':
          keyToken = 'Minus';
          break;
        case 'BracketLeft':
          keyToken = '[';
          break;
        case 'BracketRight':
          keyToken = ']';
          break;
        case 'Slash':
          keyToken = '/';
          break;
        case 'Backslash':
          keyToken = '\\';
          break;
        case 'Comma':
          keyToken = ',';
          break;
        case 'Period':
          keyToken = '.';
          break;
        case 'Semicolon':
          keyToken = ';';
          break;
        case 'Quote':
          keyToken = "'";
          break;
        case 'Backquote':
          keyToken = '`';
          break;
        default:
          break;
      }
    }
  }

  if (!keyToken && e.key) {
    if (e.key === ' ') keyToken = 'Space';
    else if (e.key === '+' || e.key === '=') keyToken = 'Equal';
    else if (e.key === '-' || e.key === '_') keyToken = 'Minus';
    else if (e.key.length === 1) keyToken = e.key.toUpperCase();
    else keyToken = e.key;
  }

  if (!keyToken) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Avoid adding Shift for Equal when user hits Shift+= (+) on US keyboard if no other modifiers
  const isPlusKey = e.code === 'Equal' && e.key === '+';
  if (e.shiftKey && !isPlusKey) parts.push('Shift');

  parts.push(keyToken);
  return parts.join('+');
}

export function formatShortcutTokens(combo: string): string[] {
  if (!combo) return [];
  const mac = isMacPlatform();
  return combo.split('+').map((token) => {
    switch (token) {
      case 'Ctrl':
        return mac ? '⌘' : 'Ctrl';
      case 'Alt':
        return mac ? '⌥' : 'Alt';
      case 'Shift':
        return mac ? '⇧' : 'Shift';
      case 'Space':
        return 'Space';
      case 'Escape':
        return 'Esc';
      case 'Enter':
        return '↵';
      case 'ArrowRight':
        return '→';
      case 'ArrowLeft':
        return '←';
      case 'ArrowUp':
        return '↑';
      case 'ArrowDown':
        return '↓';
      case 'Equal':
        return '+';
      case 'Minus':
        return '-';
      default:
        return token;
    }
  });
}

export function formatShortcutLabel(combo: string): string {
  const tokens = formatShortcutTokens(combo);
  if (tokens.length === 0) return 'Unbound';
  return tokens.join(isMacPlatform() ? ' ' : '+');
}

class ShortcutsManagerService {
  private globalEnabled = true;
  private overrides: Partial<Record<ShortcutActionId, StoredShortcutOverride>> = {};
  private recordingMode = false;
  private listeners = new Set<() => void>();
  private cachedState: ShortcutsState | null = null;

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
          this.loadFromStorage();
          this.emit();
        }
      });
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) {
        this.globalEnabled = true;
        this.overrides = {};
        this.cachedState = null;
        return;
      }
      const parsed = JSON.parse(raw) as PersistedShortcutsPayload;
      this.globalEnabled = typeof parsed.globalEnabled === 'boolean' ? parsed.globalEnabled : true;
      this.overrides = parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {};
      this.cachedState = null;
    } catch {
      this.globalEnabled = true;
      this.overrides = {};
      this.cachedState = null;
    }
  }

  private persist(): void {
    this.cachedState = null;
    try {
      if (typeof window !== 'undefined') {
        const payload: PersistedShortcutsPayload = {
          globalEnabled: this.globalEnabled,
          overrides: this.overrides,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // Ignore storage quota errors
    }
    this.emit();
  }

  private emit(): void {
    this.cachedState = null;
    this.listeners.forEach((listener) => listener());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): ShortcutsState {
    if (this.cachedState) return this.cachedState;

    const bindings = {} as Record<ShortcutActionId, ShortcutBinding>;
    for (const def of DEFAULT_SHORTCUTS) {
      const override = this.overrides[def.id];
      const combo = override && typeof override.combo === 'string' ? override.combo : def.defaultCombo;
      const enabled = override && typeof override.enabled === 'boolean' ? override.enabled : true;
      const isCustomized = combo !== def.defaultCombo || !enabled;
      bindings[def.id] = {
        ...def,
        combo,
        enabled,
        isCustomized,
      };
    }

    this.cachedState = {
      globalEnabled: this.globalEnabled,
      bindings,
    };
    return this.cachedState;
  }

  public getBinding(id: ShortcutActionId): ShortcutBinding {
    return this.getState().bindings[id];
  }

  public setGlobalEnabled(enabled: boolean): void {
    if (this.globalEnabled === enabled) return;
    this.globalEnabled = enabled;
    this.persist();
  }

  public setRecordingMode(isRecording: boolean): void {
    this.recordingMode = isRecording;
  }

  public isRecording(): boolean {
    return this.recordingMode;
  }

  public findConflict(actionId: ShortcutActionId, combo: string): ShortcutBinding | null {
    if (!combo) return null;
    const { bindings } = this.getState();
    for (const def of DEFAULT_SHORTCUTS) {
      if (def.id === actionId) continue;
      const binding = bindings[def.id];
      if (binding.combo && binding.combo === combo) {
        return binding;
      }
    }
    return null;
  }

  public setShortcutCombo(actionId: ShortcutActionId, combo: string, stealFromConflict = false): void {
    if (stealFromConflict && combo) {
      const conflict = this.findConflict(actionId, combo);
      if (conflict) {
        this.overrides[conflict.id] = {
          ...this.overrides[conflict.id],
          combo: '',
        };
      }
    }

    const def = DEFAULT_SHORTCUTS.find((d) => d.id === actionId);
    const current = this.overrides[actionId] || {};
    const nextOverride: StoredShortcutOverride = {
      ...current,
      combo,
    };

    if (def && nextOverride.combo === def.defaultCombo && (nextOverride.enabled === undefined || nextOverride.enabled === true)) {
      delete this.overrides[actionId];
    } else {
      this.overrides[actionId] = nextOverride;
    }

    this.persist();
  }

  public setShortcutEnabled(actionId: ShortcutActionId, enabled: boolean): void {
    const def = DEFAULT_SHORTCUTS.find((d) => d.id === actionId);
    const current = this.overrides[actionId] || {};
    const nextOverride: StoredShortcutOverride = {
      ...current,
      enabled,
    };

    if (def && (nextOverride.combo === undefined || nextOverride.combo === def.defaultCombo) && nextOverride.enabled === true) {
      delete this.overrides[actionId];
    } else {
      this.overrides[actionId] = nextOverride;
    }

    this.persist();
  }

  public resetShortcut(actionId: ShortcutActionId): void {
    if (this.overrides[actionId]) {
      delete this.overrides[actionId];
      this.persist();
    }
  }

  public resetAll(): void {
    this.globalEnabled = true;
    this.overrides = {};
    this.persist();
  }

  public matchEvent(e: KeyboardEvent, allowModalOnly = false): ShortcutBinding | null {
    const state = this.getState();
    if (!state.globalEnabled) return null;

    const combo = normalizeKeyboardEvent(e);
    if (!combo) return null;

    for (const def of DEFAULT_SHORTCUTS) {
      const binding = state.bindings[def.id];
      if (!binding.enabled || !binding.combo) continue;
      if (allowModalOnly && !binding.allowInModals) continue;
      if (binding.combo === combo) {
        return binding;
      }
    }
    return null;
  }
}

export const shortcutsManager = new ShortcutsManagerService();
