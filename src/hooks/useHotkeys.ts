/**
 * Production keyboard shortcuts hook for broadcast directors and AV operators.
 */

import { useEffect } from 'react';

interface HotkeyMap {
  [key: string]: () => void;
}

export function useHotkeys(keyMap: HotkeyMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing inside an input/textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      let keyIdentifier = e.key;
      if (e.code === 'Space') keyIdentifier = 'Space';

      const modifiers: string[] = [];
      if (e.ctrlKey || e.metaKey) {
        modifiers.push('Ctrl');
      }
      if (e.shiftKey && keyIdentifier !== 'Shift') {
        modifiers.push('Shift');
      }

      if (
        modifiers.length > 0 &&
        keyIdentifier !== 'Control' &&
        keyIdentifier !== 'Meta' &&
        keyIdentifier !== 'Shift'
      ) {
        keyIdentifier = `${modifiers.join('+')}+${keyIdentifier}`;
      }

      const handler =
        keyMap[keyIdentifier] ||
        keyMap[keyIdentifier.toLowerCase()] ||
        (modifiers.length > 0
          ? keyMap[`${modifiers.join('+')}+${e.key.toLowerCase()}`] ||
            keyMap[`${modifiers.join('+')}+${e.key.toUpperCase()}`]
          : undefined);

      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyMap, enabled]);
}
