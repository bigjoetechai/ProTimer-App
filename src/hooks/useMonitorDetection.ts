/**
 * React hook for native Windows multiple-monitor detection and fullscreen output.
 */

import { useState, useEffect, useCallback } from 'react';
import { DetectedMonitor, DisplayTarget } from '../types';
import { monitorDetectionService } from '../services';

export function useMonitorDetection() {
  const [displays, setDisplays] = useState<DetectedMonitor[]>(() =>
    monitorDetectionService.getDisplays()
  );
  const [selectedMonitorId, setSelectedMonitorIdState] = useState<string>(() =>
    monitorDetectionService.getSelectedMonitorId()
  );
  const [isFullscreenActive, setIsFullscreenActive] = useState<boolean>(() =>
    monitorDetectionService.isOutputActive()
  );

  useEffect(() => {
    const unsubMonitors = monitorDetectionService.subscribeMonitors((newDisplays) => {
      setDisplays([...newDisplays]);
      setSelectedMonitorIdState(monitorDetectionService.getSelectedMonitorId());
    });

    const unsubOutput = monitorDetectionService.subscribeOutputState((isActive) => {
      setIsFullscreenActive(isActive);
    });

    return () => {
      unsubMonitors();
      unsubOutput();
    };
  }, []);

  const setSelectedMonitor = useCallback((id: string) => {
    setSelectedMonitorIdState(id);
    monitorDetectionService.setSelectedMonitorId(id);
  }, []);

  const openFullscreen = useCallback(
    async (monitorId?: string, target: DisplayTarget = 'fullscreen') => {
      return monitorDetectionService.openFullscreen(monitorId || selectedMonitorId, target);
    },
    [selectedMonitorId]
  );

  const closeFullscreen = useCallback(async () => {
    return monitorDetectionService.closeFullscreen();
  }, []);

  const toggleFullscreen = useCallback(
    async (monitorId?: string) => {
      return monitorDetectionService.toggleFullscreen(monitorId || selectedMonitorId);
    },
    [selectedMonitorId]
  );

  return {
    displays,
    selectedMonitorId,
    setSelectedMonitor,
    isFullscreenActive,
    openFullscreen,
    closeFullscreen,
    toggleFullscreen,
    isElectron: typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron),
  };
}
