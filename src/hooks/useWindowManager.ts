/**
 * React hook connecting UI components to Window Manager Service.
 * Provides window state, manual resize awareness, maximize/minimize/restore actions,
 * and independent Application Fullscreen mode.
 */

import { useState, useEffect, useCallback } from 'react';
import { windowManagerService } from '../services/windowManagerService';
import { WindowStateInfo } from '../types';

export function useWindowManager() {
  const [windowState, setWindowState] = useState<WindowStateInfo>(() =>
    windowManagerService.getState()
  );

  useEffect(() => {
    const unsubscribe = windowManagerService.subscribe((newState) => {
      setWindowState({ ...newState });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const minimize = useCallback(() => windowManagerService.minimize(), []);
  const maximize = useCallback(() => windowManagerService.maximize(), []);
  const restore = useCallback(() => windowManagerService.restore(), []);
  const toggleMaximize = useCallback(() => windowManagerService.toggleMaximize(), []);
  const close = useCallback(() => windowManagerService.close(), []);
  const toggleAppFullscreen = useCallback(
    (monitorId?: string | number) => windowManagerService.toggleAppFullscreen(monitorId),
    []
  );
  const resetToDefaultSize = useCallback(
    () => windowManagerService.resetToDefaultSize(),
    []
  );

  return {
    isElectron: windowManagerService.isElectronAvailable(),
    isMaximized: windowState.isMaximized,
    isAppFullscreen: windowState.isFullScreen,
    width: windowState.width,
    height: windowState.height,
    minimize,
    maximize,
    restore,
    toggleMaximize,
    close,
    toggleAppFullscreen,
    resetToDefaultSize,
  };
}
