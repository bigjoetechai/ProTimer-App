/**
 * React hook for native Windows multiple-monitor detection and independent per-list Fullscreen / Multi FS outputs.
 */

import { useState, useEffect, useCallback } from 'react';
import { DetectedMonitor, DisplayTarget } from '../types';
import { monitorDetectionService } from '../services';

export function useMonitorDetection(activeListId?: string) {
  const [displays, setDisplays] = useState<DetectedMonitor[]>(() =>
    monitorDetectionService.getDisplays()
  );
  const [selectedMonitorsByList, setSelectedMonitorsByList] = useState<Record<string, string>>(
    () => monitorDetectionService.getSelectedMonitorsByList()
  );
  const [activeFullscreenByList, setActiveFullscreenByList] = useState<Record<string, boolean>>(
    () => monitorDetectionService.getActiveFullscreenByList()
  );
  const [isAnyFullscreenActive, setIsAnyFullscreenActive] = useState<boolean>(() =>
    monitorDetectionService.isOutputActive()
  );
  const [isMultiFullscreenActive, setIsMultiFullscreenActive] = useState<boolean>(() =>
    monitorDetectionService.isMultiOutputActive()
  );

  useEffect(() => {
    const unsubMonitors = monitorDetectionService.subscribeMonitors((newDisplays) => {
      setDisplays([...newDisplays]);
      setSelectedMonitorsByList(monitorDetectionService.getSelectedMonitorsByList());
    });

    const unsubOutput = monitorDetectionService.subscribeOutputState(
      (isActive, activeByList, monitorsByList) => {
        setIsAnyFullscreenActive(isActive);
        setActiveFullscreenByList({ ...activeByList });
        setSelectedMonitorsByList({ ...monitorsByList });
      }
    );

    const unsubMultiOutput = monitorDetectionService.subscribeMultiOutputState((isActive) => {
      setIsMultiFullscreenActive(isActive);
    });

    return () => {
      unsubMonitors();
      unsubOutput();
      unsubMultiOutput();
    };
  }, []);

  const currentListKey = activeListId || 'default';
  const selectedMonitorId = selectedMonitorsByList[currentListKey] || 'Auto';
  const isFullscreenActive = Boolean(activeFullscreenByList[currentListKey]);

  const setSelectedMonitor = useCallback(
    (monitorId: string, listId?: string) => {
      const targetList = listId || currentListKey;
      monitorDetectionService.setSelectedMonitorId(monitorId, targetList);
    },
    [currentListKey]
  );

  const isListFullscreenActive = useCallback(
    (listId: string) => Boolean(activeFullscreenByList[listId]),
    [activeFullscreenByList]
  );

  const getSelectedMonitorForList = useCallback(
    (listId: string) => selectedMonitorsByList[listId] || 'Auto',
    [selectedMonitorsByList]
  );

  const openFullscreen = useCallback(
    async (monitorId?: string, target: DisplayTarget = 'fullscreen', listId?: string) => {
      const targetList = listId || currentListKey;
      const targetMon = monitorId || selectedMonitorsByList[targetList] || 'Auto';
      return monitorDetectionService.openFullscreen(targetMon, target, targetList);
    },
    [currentListKey, selectedMonitorsByList]
  );

  const closeFullscreen = useCallback(
    async (listId?: string) => {
      const targetList = listId || currentListKey;
      return monitorDetectionService.closeFullscreen(targetList);
    },
    [currentListKey]
  );

  const toggleFullscreen = useCallback(
    async (monitorId?: string, listId?: string) => {
      const targetList = listId || currentListKey;
      const targetMon = monitorId || selectedMonitorsByList[targetList] || 'Auto';
      return monitorDetectionService.toggleFullscreen(targetMon, targetList);
    },
    [currentListKey, selectedMonitorsByList]
  );

  const openMultiFullscreen = useCallback(
    async (monitorId?: string) => {
      return monitorDetectionService.openMultiFullscreen(monitorId || selectedMonitorId);
    },
    [selectedMonitorId]
  );

  const closeMultiFullscreen = useCallback(async () => {
    return monitorDetectionService.closeMultiFullscreen();
  }, []);

  const toggleMultiFullscreen = useCallback(
    async (monitorId?: string) => {
      return monitorDetectionService.toggleMultiFullscreen(monitorId || selectedMonitorId);
    },
    [selectedMonitorId]
  );

  return {
    displays,
    selectedMonitorId,
    selectedMonitorsByList,
    setSelectedMonitor,
    getSelectedMonitorForList,
    isFullscreenActive,
    isAnyFullscreenActive,
    activeFullscreenByList,
    isListFullscreenActive,
    openFullscreen,
    closeFullscreen,
    toggleFullscreen,
    isMultiFullscreenActive,
    openMultiFullscreen,
    closeMultiFullscreen,
    toggleMultiFullscreen,
    isElectron: typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron),
  };
}
