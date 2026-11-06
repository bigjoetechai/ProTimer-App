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
      if (e.shiftKey && keyIdentifier !== 'Shift') {
        keyIdentifier = `Shift+${keyIdentifier}`;
      }

      if (keyMap[keyIdentifier] || keyMap[keyIdentifier.toLowerCase()]) {
        e.preventDefault();
        const handler = keyMap[keyIdentifier] || keyMap[keyIdentifier.toLowerCase()];
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyMap, enabled]);
}
