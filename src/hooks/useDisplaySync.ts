/**
 * Display Sync Hook for Presenter, Stage, and Preview displays.
 */

import { useState, useEffect } from 'react';
import { DisplaySyncPayload } from '../types';
import { displaySyncService } from '../services/displaySyncService';

export function useDisplaySync(asClient: boolean = false) {
  const [payload, setPayload] = useState<DisplaySyncPayload | null>(null);

  useEffect(() => {
    if (asClient) {
      displaySyncService.initAsClient();
    }

    const unsubscribe = displaySyncService.subscribe((data) => {
      setPayload(data);
    });

    return () => {
      unsubscribe();
    };
  }, [asClient]);

  return {
    payload,
    sendRemoteCommand: (cmd: string, data?: unknown) => displaySyncService.sendRemoteCommand(cmd, data),
    toggleBlackout: () => displaySyncService.toggleBlackout(),
    toggleClock: () => displaySyncService.toggleClockMode(),
    setMessage: (msg: Parameters<typeof displaySyncService.setMessage>[0]) => displaySyncService.setMessage(msg),
    clearMessage: () => displaySyncService.clearMessage(),
    toggleMessageVisibility: () => displaySyncService.toggleMessageVisibility(),
    openDisplayWindow: (target: Parameters<typeof displaySyncService.openDisplayWindow>[0]) =>
      displaySyncService.openDisplayWindow(target),
  };
}
