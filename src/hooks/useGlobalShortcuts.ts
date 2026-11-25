import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  shortcutsManager,
  ShortcutActionId,
  ShortcutBinding,
  ShortcutsState,
} from '../services/shortcutsManager';

export type ShortcutHandlerMap = Partial<
  Record<ShortcutActionId, (e: KeyboardEvent) => boolean | void>
>;

export interface UseGlobalShortcutsOptions {
  /** Master external enable flag (e.g. from user preferences) */
  enabled?: boolean;
  /** When true, only shortcuts marked `allowInModals` (such as Ctrl+K) will fire */
  isModalOpen?: boolean;
  /** Optional callback fired whenever a shortcut executes (great for subtle visual feedback) */
  onTriggered?: (binding: ShortcutBinding) => void;
}

const subscribe = (listener: () => void) => shortcutsManager.subscribe(listener);
const getSnapshot = (): ShortcutsState => shortcutsManager.getState();

/**
 * Subscribe to the current global shortcuts state reactively.
 */
export function useShortcutsState(): ShortcutsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Registers global keyboard shortcut handlers managed by `shortcutsManager`.
 * Automatically ignores events when typing in inputs/textareas/selects/contentEditable
 * or while recording a new shortcut binding.
 */
export function useGlobalShortcuts(
  handlers: ShortcutHandlerMap,
  options: UseGlobalShortcutsOptions = {}
): ShortcutsState {
  const { enabled = true, isModalOpen = false, onTriggered } = options;
  const state = useShortcutsState();

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const onTriggeredRef = useRef(onTriggered);
  onTriggeredRef.current = onTriggered;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (shortcutsManager.isRecording()) return;

      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isEditable) return;

      const matched = shortcutsManager.matchEvent(e, isModalOpen);
      if (!matched) return;

      if (e.repeat && !matched.allowRepeat) {
        return;
      }

      const handler = handlersRef.current[matched.id];
      if (!handler) return;

      const result = handler(e);
      if (result === false) return;

      e.preventDefault();
      onTriggeredRef.current?.(matched);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isModalOpen]);

  return state;
}
