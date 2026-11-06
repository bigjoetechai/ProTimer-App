/**
 * Custom React Hook connecting components to the central Timer Manager Service.
 */

import { useState, useEffect } from 'react';
import { TimerItem, TimerList, TimerSnapshot } from '../types';
import { timerManagerService } from '../services/timerManager';

export function useTimerManager() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(timerManagerService.getSnapshot());
  const [timers, setTimers] = useState<TimerItem[]>(timerManagerService.getActiveListTimers());
  const [lists, setLists] = useState<TimerList[]>(timerManagerService.getAllLists());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    timerManagerService.initialize().then(() => {
      if (isMounted) {
        setIsReady(true);
        setLists(timerManagerService.getAllLists());
      }
    });

    const unsubscribe = timerManagerService.subscribe((newSnapshot, newTimers) => {
      if (isMounted) {
        setSnapshot(newSnapshot);
        setTimers([...newTimers]);
        setLists(timerManagerService.getAllLists());
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return {
    isReady,
    snapshot,
    timers,
    lists,
    activeTimer: timerManagerService.getActiveTimer(),
    cuedTimer: timerManagerService.getCuedTimer(),
    nextTimer: timerManagerService.getNextTimer(),
    // Actions
    start: (id?: string) => timerManagerService.start(id),
    pause: (id?: string) => timerManagerService.pause(id),
    resume: (id?: string) => timerManagerService.resume(id),
    togglePlayPause: (id?: string) => timerManagerService.togglePlayPause(id),
    stop: (id?: string) => timerManagerService.stop(id),
    restart: (id?: string) => timerManagerService.restart(id),
    cue: (id: string) => timerManagerService.cue(id),
    cueNext: () => timerManagerService.cueNext(),
    cuePrev: () => timerManagerService.cuePrev(),
    moveNextCue: () => timerManagerService.moveNextCue(),
    movePrevCue: () => timerManagerService.movePrevCue(),
    skipEvent: () => timerManagerService.skipEvent(),
    moveToPrevEvent: () => timerManagerService.moveToPrevEvent(),
    adjustDuration: (deltaSec: number, id?: string) => timerManagerService.adjustDuration(deltaSec, id),
    setTimerDuration: (id: string, newSec: number) => timerManagerService.setTimerDuration(id, newSec),
    getAdjustmentIncrement: () => timerManagerService.getAdjustmentIncrement(),
    setAdjustmentIncrement: (sec: number) => timerManagerService.setAdjustmentIncrement(sec),
    setSpeed: (speedPercent: number, id?: string) => timerManagerService.setSpeed(speedPercent, id),
    setAutoAdvance: (enabled: boolean) => timerManagerService.setAutoAdvance(enabled),
    isAutoAdvanceEnabled: () => timerManagerService.isAutoAdvanceEnabled(),
    recordLap: (id?: string) => timerManagerService.recordLap(id),
    resetLaps: (id?: string) => timerManagerService.resetLaps(id),
    addTimer: (timer: Partial<TimerItem>) => timerManagerService.addTimer(timer),
    updateTimer: (id: string, updates: Partial<TimerItem>) => timerManagerService.updateTimer(id, updates),
    deleteTimer: (id: string) => timerManagerService.deleteTimer(id),
    duplicateTimer: (id: string) => timerManagerService.duplicateTimer(id),
    reorderTimers: (src: number, dest: number) => timerManagerService.reorderTimers(src, dest),
    renameTimer: (id: string, newName: string) => timerManagerService.renameTimer(id, newName),
    switchList: (listId: string) => timerManagerService.switchList(listId),
    addList: (name?: string, description?: string) => timerManagerService.addList(name, description),
    renameList: (listId: string, newName: string) => timerManagerService.renameList(listId, newName),
    deleteList: (listId: string) => timerManagerService.deleteList(listId),
    duplicateList: (listId: string) => timerManagerService.duplicateList(listId),
    reorderLists: (src: number, dest: number) => timerManagerService.reorderLists(src, dest),
    moveList: (listId: string, direction: 'left' | 'right') => timerManagerService.moveList(listId, direction),
    exportList: (listId: string) => timerManagerService.exportList(listId),
    downloadListJson: (listId: string) => timerManagerService.downloadListJson(listId),
    downloadListCsv: (listId?: string) => timerManagerService.downloadListCsv(listId),
    importCsv: (csvText: string, listId?: string) => timerManagerService.importCsv(csvText, listId),
    exportAllLists: () => timerManagerService.exportAllLists(),
    downloadAllListsBackup: () => timerManagerService.downloadAllListsBackup(),
    importList: (data: string | object, mode?: 'add' | 'replace') => timerManagerService.importList(data, mode),
    getRunningTimerCount: (listId: string) => timerManagerService.getRunningTimerCount(listId),
    getAllRunningTimers: () => timerManagerService.getAllRunningTimers(),
    runMultiListIndependenceTest: () => timerManagerService.runMultiListIndependenceTest(),
    resetCompletedTimers: () => timerManagerService.resetCompletedTimers(),
    copyTimer: (id?: string) => timerManagerService.copySelectedTimer(id),
    cutTimer: (id?: string) => timerManagerService.cutSelectedTimer(id),
    pasteTimer: () => timerManagerService.pasteTimer(),
    deleteSelectedTimer: (id?: string) => timerManagerService.deleteSelectedTimer(id),
    hasClipboard: () => timerManagerService.hasClipboardTimer(),
  };
}
