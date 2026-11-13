/**
 * Main Operator Console Page.
 * Implements the broadcast multi-timer workflow from the reference screenshot
 * with full multiple timer-list management, live concurrent execution, and independent timers.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ListOrdered, History } from 'lucide-react';
import { MainLayout } from '../layouts';
import {
  TopMenuBar,
  ControlPanel,
  BottomBar,
  ListManagerModal,
  LanModal,
  FloatingPreviewWindow,
  FloatingPresenterWindow,
  TimerHistoryLogView,
} from '../components';
import { TimerTable, TimerEditorModal } from '../timers';
import { MessageEditorModal } from '../messages';
import { SettingsModal } from '../settings';
import { FullscreenDisplay, MultiFullscreenDisplay } from '../displays';
import { useTimerManager, useDisplaySync, useHotkeys, useMonitorDetection, useWindowManager, useTheme } from '../hooks';
import { formatSeconds } from '../utilities/timeFormatters';
import { TimerItem, DisplayTarget, AppPreferences } from '../types';
import { storageService } from '../services/storageService';
import { displaySyncService } from '../services/displaySyncService';
import { ndiStreamService, NdiStreamStatus } from '../services/ndiStreamService';

export const MainConsolePage: React.FC = () => {
  const {
    snapshot,
    timers,
    lists,
    runLogs,
    activeTimer,
    cuedTimer,
    start,
    pause,
    stop,
    restart,
    cue,
    cueNext,
    cuePrev,
    skipEvent,
    moveToPrevEvent,
    adjustDuration,
    setTimerDuration,
    setSpeed,
    recordLap,
    addTimer,
    updateTimer,
    deleteTimer,
    duplicateTimer,
    reorderTimers,
    renameTimer,
    switchList,
    addList,
    renameList,
    deleteList,
    duplicateList,
    reorderLists,
    moveList,
    downloadListJson,
    downloadListCsv,
    importCsv,
    downloadAllListsBackup,
    importList,
    getRunningTimerCount,
    getAllRunningTimers,
    runMultiListIndependenceTest,
    resetCompletedTimers,
    togglePlayPause,
    copyTimer,
    cutTimer,
    pasteTimer,
    deleteSelectedTimer,
    hasClipboard,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    deleteRunLog,
    clearRunLogs,
    exportRunLogsCsv,
  } = useTimerManager();

  const {
    payload,
    toggleBlackout,
    toggleClock,
    setMessage,
    clearMessage,
    toggleMessageVisibility,
    openDisplayWindow,
  } = useDisplaySync(false);

  // Main Console active workspace tab ('cues' vs 'history')
  const [activeConsoleTab, setActiveConsoleTab] = useState<'cues' | 'history'>('cues');

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTimer, setEditingTimer] = useState<TimerItem | null>(null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isListManagerOpen, setIsListManagerOpen] = useState(false);
  const [isLanModalOpen, setIsLanModalOpen] = useState(false);
  const [isPreviewPopoutOpen, setIsPreviewPopoutOpen] = useState(false);
  const [isPresenterPopoutOpen, setIsPresenterPopoutOpen] = useState(false);
  const [ndiStreamStatus, setNdiStreamStatus] = useState<NdiStreamStatus>(() =>
    ndiStreamService.getStatus()
  );

  useEffect(() => {
    return ndiStreamService.subscribe((status) => {
      setNdiStreamStatus(status);
    });
  }, []);

  // Keep Preview & Presenter active state synced with native Electron windows when running as desktop app
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.isElectron) return;

    api.isPreviewWindowActive?.().then((active) => setIsPreviewPopoutOpen(Boolean(active)));
    api.isPresenterWindowActive?.().then((active) => setIsPresenterPopoutOpen(Boolean(active)));

    const unsubPreview = api.onPreviewStateChanged?.((isOpen) => {
      setIsPreviewPopoutOpen(Boolean(isOpen));
    });
    const unsubPresenter = api.onPresenterStateChanged?.((isOpen) => {
      setIsPresenterPopoutOpen(Boolean(isOpen));
    });

    return () => {
      if (unsubPreview) unsubPreview();
      if (unsubPresenter) unsubPresenter();
    };
  }, []);

  // UI preferences & Theme
  const { theme, isDark, toggleTheme, setTheme } = useTheme();
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    const p = storageService.getPreferences();
    return { ...p, theme };
  });
  const {
    displays,
    selectedMonitorId,
    setSelectedMonitor,
    isFullscreenActive,
    openFullscreen,
    closeFullscreen,
    toggleFullscreen,
    isMultiFullscreenActive,
    closeMultiFullscreen,
    toggleMultiFullscreen,
  } = useMonitorDetection();
  const { toggleAppFullscreen } = useWindowManager();

  // Sync live Fullscreen, Multi Fullscreen, and NDI states to LAN / Remote controllers
  useEffect(() => {
    displaySyncService.updateOutputStatus({
      isFullscreenActive,
      isMultiFullscreenActive,
      isNdiActive: ndiStreamStatus.active,
      isNdiMultiActive: ndiStreamStatus.active && ndiStreamStatus.mode === 'multi',
      ndiSourceName: ndiStreamStatus.sourceName,
    });
  }, [isFullscreenActive, isMultiFullscreenActive, ndiStreamStatus]);

  // Register handler so LAN / QR Remote Control can remotely activate Fullscreen and NDI
  useEffect(() => {
    return displaySyncService.registerOutputController((command) => {
      switch (command) {
        case 'TOGGLE_FULLSCREEN':
          toggleFullscreen(selectedMonitorId);
          break;
        case 'OPEN_FULLSCREEN':
          openFullscreen(selectedMonitorId, 'fullscreen');
          break;
        case 'CLOSE_FULLSCREEN':
          closeFullscreen();
          break;
        case 'TOGGLE_MULTI_FULLSCREEN':
          toggleMultiFullscreen(selectedMonitorId);
          break;
        case 'TOGGLE_NDI':
          ndiStreamService.toggleStream('single');
          break;
        case 'TOGGLE_NDI_MULTI':
          ndiStreamService.toggleStream('multi');
          break;
      }
    });
  }, [
    selectedMonitorId,
    toggleFullscreen,
    openFullscreen,
    closeFullscreen,
    toggleMultiFullscreen,
  ]);

  // Active list name
  const currentList = useMemo(() => {
    return lists.find((l) => l.id === snapshot.activeListId) || lists[0] || { id: 'list_1', name: 'List 1: Sunday Service', timerIds: [] };
  }, [lists, snapshot.activeListId]);

  // Keyboard Hotkeys
  useHotkeys(
    {
      Space: () => togglePlayPause(),
      Escape: () => {
        if (isFullscreenActive) {
          closeFullscreen();
        } else if (isMultiFullscreenActive) {
          closeMultiFullscreen();
        } else {
          stop();
        }
      },
      r: () => restart(),
      c: () => cueNext(),
      'Shift+C': () => cuePrev(),
      '+': () => adjustDuration(60),
      '=': () => adjustDuration(60),
      '-': () => adjustDuration(-60),
      h: () => toggleBlackout(),
      m: () => setIsMessageModalOpen(true),
      l: () => setIsListManagerOpen(true),
      F11: () => toggleAppFullscreen(),
      'Ctrl+z': () => undo(),
      'Ctrl+y': () => redo(),
      'Ctrl+Shift+z': () => redo(),
    },
    preferences.hotkeysEnabled
  );

  const handleSaveTimer = (data: Partial<TimerItem>) => {
    if (editingTimer) {
      updateTimer(editingTimer.id, data);
    } else {
      addTimer(data);
    }
  };

  const handleAddNewTimer = () => {
    setEditingTimer(null);
    setIsEditorOpen(true);
  };

  const handleQuickAdd = (durationSec: number, name: string) => {
    addTimer({
      name,
      durationSeconds: durationSec,
      remainingSeconds: durationSec,
      type: 'count_down',
      endAction: 'stop',
      speed: 100,
      alert1: {
        id: 'a1',
        timeSeconds: 120,
        color: '#eab308',
        label: 'Warning',
        flash: true,
        soundEnabled: false,
      },
      alert2: {
        id: 'a2',
        timeSeconds: 60,
        color: '#ef4444',
        label: 'Danger',
        flash: true,
        soundEnabled: false,
      },
    });
  };

  const handleEditTimer = (timer: TimerItem) => {
    setEditingTimer(timer);
    setIsEditorOpen(true);
  };

  const handleAddList = () => {
    const listNum = lists.length + 1;
    addList(`List ${listNum}`);
    setActiveConsoleTab('cues');
  };

  const handleAddTimerType = (
    type: 'countdown' | 'count_up' | 'end_time' | 'stopwatch' | 'clock' | 'empty' | 'spacer'
  ) => {
    const defaultDur =
      preferences.defaultDurationEnabled !== false
        ? preferences.defaultDurationSeconds ?? 600
        : 600;
    const defaultEndAction = preferences.defaultNewTimerEndAction || 'count_up';
    const warnSec = preferences.defaultWarningSeconds ?? 90;
    const dangerSec = preferences.defaultDangerSeconds ?? 30;
    const warnColor = preferences.warningDigitsColor || '#eab308';
    const dangerColor = preferences.dangerDigitsColor || '#ef4444';
    const flashEnabled = preferences.flashAlertsEnabled ?? true;

    const defaultAlert1 =
      preferences.defaultAlert1Enabled !== false
        ? {
            id: 'alt1',
            timeSeconds: warnSec,
            color: warnColor,
            flash: false,
            soundEnabled: false,
            label: 'Alert 1 (Warning)',
          }
        : undefined;

    const defaultAlert2 = preferences.defaultAlert2Enabled
      ? {
          id: 'alt2',
          timeSeconds: dangerSec,
          color: dangerColor,
          flash: flashEnabled,
          soundEnabled: false,
          label: 'Alert 2 (Danger)',
        }
      : undefined;

    switch (type) {
      case 'countdown':
        addTimer({
          name: 'Countdown',
          durationSeconds: defaultDur,
          remainingSeconds: defaultDur,
          type: 'countdown',
          endAction: defaultEndAction,
          speed: 100,
          alert1: defaultAlert1,
          alert2: defaultAlert2,
        });
        break;
      case 'count_up':
        addTimer({
          name: 'Count Up',
          durationSeconds: 0,
          remainingSeconds: 0,
          type: 'count_up',
          endAction: 'stop',
          speed: 100,
        });
        break;
      case 'end_time':
        addTimer({
          name: 'End Time',
          durationSeconds: defaultDur,
          remainingSeconds: defaultDur,
          type: 'countdown',
          endAction: defaultEndAction,
          speed: 100,
          alert1: defaultAlert1,
          alert2: defaultAlert2,
        });
        break;
      case 'stopwatch':
        addTimer({
          name: 'Stopwatch',
          durationSeconds: 0,
          remainingSeconds: 0,
          type: 'stopwatch',
          endAction: 'none',
          speed: 100,
        });
        break;
      case 'clock':
        addTimer({
          name: 'Clock',
          durationSeconds: 0,
          remainingSeconds: 0,
          type: 'digital_clock',
          endAction: 'none',
          speed: 100,
        });
        break;
      case 'empty':
        addTimer({
          name: '',
          durationSeconds: 0,
          remainingSeconds: 0,
          type: 'empty',
          endAction: 'none',
          speed: 0,
        });
        break;
      case 'spacer':
        addTimer({
          name: '',
          durationSeconds: 0,
          remainingSeconds: 0,
          type: 'spacer',
          endAction: 'none',
          speed: 0,
        });
        break;
    }
  };

  return (
    <MainLayout>
      {/* 1. TOP MENU BAR */}
      <TopMenuBar
        currentListName={currentList.name}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLanModal={() => setIsLanModalOpen(true)}
        onNewTimer={handleAddNewTimer}
        onAddTimerType={handleAddTimerType}
        onQuickAddDuration={handleQuickAdd}
        onUndo={() => undo()}
        onRedo={() => redo()}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onCopy={() => copyTimer()}
        onCut={() => cutTimer()}
        onPaste={() => pasteTimer()}
        onDelete={() => deleteSelectedTimer()}
        canPaste={hasClipboard()}
        onClearCompleted={() => resetCompletedTimers()}
        onRenameList={(newName) => renameList(currentList.id, newName)}
        onOpenListManager={() => setIsListManagerOpen(true)}
        onNewList={handleAddList}
        onExportActiveList={() => downloadListJson(currentList.id)}
        onExportAllLists={downloadAllListsBackup}
        onImportList={(content) => {
          if (content) {
            importList(content);
          } else {
            setIsListManagerOpen(true);
          }
        }}
        onExportCsv={() => downloadListCsv(currentList.id)}
        onImportCsv={(csvText) => importCsv(csvText, currentList.id)}
        onRunIndependenceTest={() => setIsListManagerOpen(true)}
      />

      {/* 2. OPERATOR CONTROL PANEL */}
      <ControlPanel
        timeStr={formatSeconds(snapshot.currentSeconds, true, snapshot.isOvertime, preferences)}
        status={snapshot.status}
        speed={snapshot.speed}
        alertColor={snapshot.alertColor}
        isFlash={snapshot.isFlash}
        isOnOff={snapshot.isOnOff}
        isOvertime={snapshot.isOvertime}
        activeTimer={activeTimer || cuedTimer}
        isBlackout={payload?.isBlackout ?? false}
        isClockMode={payload?.isClockMode ?? false}
        hasActiveMessage={!!payload?.activeMessage}
        messageVisible={payload?.activeMessage?.visible ?? false}
        onStart={() => start()}
        onStop={() => stop()}
        onMove={() => skipEvent()}
        onMovePrev={() => moveToPrevEvent()}
        onPause={() => pause()}
        onRestart={() => restart()}
        onAdjustDuration={(delta) => adjustDuration(delta)}
        onSetDuration={(newSec) => {
          if (snapshot.activeTimerId) {
            setTimerDuration(snapshot.activeTimerId, newSec);
          }
        }}
        onSpeedChange={(spd) => setSpeed(spd)}
        onRecordLap={() => recordLap()}
        onToggleBlackout={() => toggleBlackout()}
        onToggleClock={() => toggleClock()}
        onEditMessage={() => setIsMessageModalOpen(true)}
        onToggleMessageShow={() => toggleMessageVisibility()}
      />

      {/* 3. MAIN CONSOLE VIEW TABS (Cue List | History) */}
      <div
        className={`h-8 px-3 flex items-center gap-1 border-b select-none transition-colors ${
          isDark ? 'bg-[#090c13] border-[#1b2333]' : 'bg-slate-200/70 border-slate-300'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveConsoleTab('cues')}
          className={`px-3 py-1 rounded-t text-xs font-semibold tracking-wide flex items-center gap-1.5 transition-all cursor-pointer ${
            activeConsoleTab === 'cues'
              ? isDark
                ? 'bg-[#0c1017] text-white border-b-2 border-cyan-400'
                : 'bg-slate-100 text-slate-900 border-b-2 border-cyan-600'
              : isDark
              ? 'text-neutral-400 hover:text-neutral-200 hover:bg-[#111622]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5 text-cyan-500" />
          <span>{currentList.name}</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              isDark ? 'bg-[#172030] text-neutral-300' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {timers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveConsoleTab('history')}
          className={`px-3 py-1 rounded-t text-xs font-semibold tracking-wide flex items-center gap-1.5 transition-all cursor-pointer ${
            activeConsoleTab === 'history'
              ? isDark
                ? 'bg-[#0c1017] text-cyan-300 border-b-2 border-cyan-400'
                : 'bg-slate-100 text-cyan-800 border-b-2 border-cyan-600'
              : isDark
              ? 'text-neutral-400 hover:text-neutral-200 hover:bg-[#111622]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5 text-cyan-500" />
          <span>History</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeConsoleTab === 'history'
                ? isDark
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                : isDark
                ? 'bg-[#172030] text-neutral-300'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {runLogs.length}
          </span>
        </button>
      </div>

      {/* 4. ACTIVE WORKSPACE: TIMER LIST TABLE OR HISTORY LOG VIEW */}
      {activeConsoleTab === 'history' ? (
        <TimerHistoryLogView
          logs={runLogs}
          lists={lists}
          onDeleteLog={(id) => deleteRunLog(id)}
          onClearLogs={() => clearRunLogs()}
          onExportCsv={() => exportRunLogsCsv()}
        />
      ) : (
        <TimerTable
          timers={timers}
          activeTimerId={snapshot.activeTimerId}
          cuedTimerId={snapshot.cuedTimerId}
          status={snapshot.status}
          currentSeconds={snapshot.currentSeconds}
          onCue={(id) => cue(id)}
          onStart={(id) => start(id)}
          onPause={(id) => pause(id)}
          onStop={(id) => stop(id)}
          onRestart={(id) => restart(id)}
          onEdit={handleEditTimer}
          onDuplicate={(id) => duplicateTimer(id)}
          onDelete={(id) => deleteTimer(id)}
          onRename={(id, newName) => renameTimer(id, newName)}
          onChangeType={(id, type) => updateTimer(id, { type })}
          onChangeEndAction={(id, endAction) => updateTimer(id, { endAction })}
          onReorder={(src, dest) => reorderTimers(src, dest)}
          onAddNew={handleAddNewTimer}
        />
      )}

      {/* 5. BOTTOM BAR */}
      <BottomBar
        lists={lists}
        activeListId={snapshot.activeListId}
        onSelectList={(id) => {
          switchList(id);
          setActiveConsoleTab('cues');
        }}
        onAddList={handleAddList}
        onRenameList={(id, newName) => renameList(id, newName)}
        onDuplicateList={(id) => duplicateList(id)}
        onDeleteList={(id) => deleteList(id)}
        onMoveList={(id, dir) => moveList(id, dir)}
        onExportList={(id) => downloadListJson(id)}
        onOpenListManager={() => setIsListManagerOpen(true)}
        getRunningTimerCount={(id) => getRunningTimerCount(id)}
        isHistoryTabActive={activeConsoleTab === 'history'}
        onSelectHistoryTab={() =>
          setActiveConsoleTab((prev) => (prev === 'history' ? 'cues' : 'history'))
        }
        historyCount={runLogs.length}
        onOpenDisplay={(target: DisplayTarget) => {
          if (target === 'fullscreen') {
            toggleFullscreen(selectedMonitorId);
          } else if (target === 'multi_fullscreen') {
            toggleMultiFullscreen(selectedMonitorId);
          } else if (target === 'ndi') {
            ndiStreamService.toggleStream('single');
          } else if (target === 'presenter') {
            if (typeof window !== 'undefined' && window.electronAPI?.isElectron && window.electronAPI.togglePresenterWindow) {
              window.electronAPI.togglePresenterWindow().then((res) => {
                setIsPresenterPopoutOpen(Boolean(res?.active));
              });
            } else {
              setIsPresenterPopoutOpen((prev) => !prev);
            }
          } else if (target === 'preview') {
            if (typeof window !== 'undefined' && window.electronAPI?.isElectron && window.electronAPI.togglePreviewWindow) {
              window.electronAPI.togglePreviewWindow().then((res) => {
                setIsPreviewPopoutOpen(Boolean(res?.active));
              });
            } else {
              setIsPreviewPopoutOpen((prev) => !prev);
            }
          } else if (target === 'lan_control' || target === 'lan_display') {
            setIsLanModalOpen(true);
            openDisplayWindow(target);
          } else {
            openDisplayWindow(target);
          }
        }}
        onOpenLanModal={() => setIsLanModalOpen(true)}
        fullscreenMonitor={selectedMonitorId}
        onChangeMonitor={(m) => {
          setSelectedMonitor(m);
          if (isFullscreenActive) {
            openFullscreen(m, 'fullscreen');
          }
        }}
        detectedMonitors={displays}
        isFullscreenActive={isFullscreenActive}
        onCloseFullscreen={closeFullscreen}
        isMultiFullscreenActive={isMultiFullscreenActive}
        onCloseMultiFullscreen={closeMultiFullscreen}
        isPreviewActive={isPreviewPopoutOpen}
        isPresenterActive={isPresenterPopoutOpen}
        ndiStreamStatus={ndiStreamStatus}
        onToggleNdiStream={(mode) => ndiStreamService.toggleStream(mode)}
      />

      {/* ALWAYS-ON-TOP RESIZABLE PRESENTER POP-OUT SCREEN (Web mode only — Electron uses native frameless always-on-top window) */}
      {!(typeof window !== 'undefined' && window.electronAPI?.isElectron) && (
        <FloatingPresenterWindow
          isOpen={isPresenterPopoutOpen}
          onClose={() => setIsPresenterPopoutOpen(false)}
          timeStr={formatSeconds(snapshot.currentSeconds, true, snapshot.isOvertime, preferences)}
          currentSeconds={snapshot.currentSeconds}
          activeListId={snapshot.activeListId}
          activeAlertLevel={payload?.activeAlertLevel}
          status={snapshot.status}
          isOvertime={snapshot.isOvertime}
          alertColor={snapshot.alertColor}
          isFlash={snapshot.isFlash}
          isOnOff={snapshot.isOnOff}
          activeTimer={activeTimer || cuedTimer}
          nextTimerName={payload?.nextTimer?.name}
          progressPercent={payload?.progressPercent ?? 0}
          isBlackout={payload?.isBlackout ?? false}
          isClockMode={payload?.isClockMode ?? false}
          clockTimeFormatted={payload?.clockTimeFormatted}
        />
      )}

      {/* ALWAYS-ON-TOP RESIZABLE PREVIEW POP-OUT SCREEN (Web mode only — Electron uses native frameless always-on-top window) */}
      {!(typeof window !== 'undefined' && window.electronAPI?.isElectron) && (
        <FloatingPreviewWindow
          isOpen={isPreviewPopoutOpen}
          onClose={() => setIsPreviewPopoutOpen(false)}
          timeStr={formatSeconds(snapshot.currentSeconds, true, snapshot.isOvertime, preferences)}
          currentSeconds={snapshot.currentSeconds}
          activeListId={snapshot.activeListId}
          activeAlertLevel={payload?.activeAlertLevel}
          status={snapshot.status}
          isOvertime={snapshot.isOvertime}
          alertColor={snapshot.alertColor}
          isFlash={snapshot.isFlash}
          isOnOff={snapshot.isOnOff}
          activeTimer={activeTimer || cuedTimer}
          nextTimerName={payload?.nextTimer?.name}
          progressPercent={payload?.progressPercent ?? 0}
          isBlackout={payload?.isBlackout ?? false}
          isClockMode={payload?.isClockMode ?? false}
          clockTimeFormatted={payload?.clockTimeFormatted}
          onStart={() => start()}
          onPause={() => pause()}
          onStop={() => stop()}
          onNextCue={() => skipEvent()}
          onAdjustDuration={(delta) => adjustDuration(delta)}
        />
      )}

      {/* 5. MODALS */}
      <TimerEditorModal
        isOpen={isEditorOpen}
        timer={editingTimer}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveTimer}
      />

      <ListManagerModal
        isOpen={isListManagerOpen}
        onClose={() => setIsListManagerOpen(false)}
        lists={lists}
        activeListId={snapshot.activeListId}
        onSelectList={(id) => switchList(id)}
        onAddList={(name, desc) => addList(name, desc)}
        onRenameList={(id, newName) => renameList(id, newName)}
        onDeleteList={(id) => deleteList(id)}
        onDuplicateList={(id) => duplicateList(id)}
        onReorderLists={(src, dest) => reorderLists(src, dest)}
        onExportList={(id) => downloadListJson(id)}
        onExportAll={downloadAllListsBackup}
        onImportList={importList}
        getRunningTimerCount={getRunningTimerCount}
        getAllRunningTimers={getAllRunningTimers}
        onRunIndependenceTest={runMultiListIndependenceTest}
        onUndo={() => undo()}
        onRedo={() => redo()}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
      />

      <MessageEditorModal
        isOpen={isMessageModalOpen}
        currentMessage={payload?.activeMessage ?? null}
        onClose={() => setIsMessageModalOpen(false)}
        onSave={(msg) => setMessage(msg)}
        onClear={() => clearMessage()}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        preferences={preferences}
        lists={lists}
        activeListId={snapshot.activeListId}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newPrefs) => {
          setPreferences(newPrefs);
          if (newPrefs.theme && newPrefs.theme !== theme) {
            setTheme(newPrefs.theme);
          }
          storageService.savePreferences(newPrefs);
          displaySyncService.notifyPreferencesUpdated();
        }}
      />

      <LanModal
        isOpen={isLanModalOpen}
        onClose={() => setIsLanModalOpen(false)}
      />

      {/* FULLSCREEN OUTPUT WINDOW OVERLAY (Web / Preview Window) */}
      {isFullscreenActive && !(typeof window !== 'undefined' && window.electronAPI?.isElectron) && (
        <div className="fixed inset-0 z-[9998]">
          <FullscreenDisplay isClient={false} onClose={() => closeFullscreen()} />
        </div>
      )}

      {/* MULTI FS OUTPUT WINDOW OVERLAY (Web / Preview Window) */}
      {isMultiFullscreenActive && !(typeof window !== 'undefined' && window.electronAPI?.isElectron) && (
        <div className="fixed inset-0 z-[9997]">
          <MultiFullscreenDisplay isClient={false} onClose={() => closeMultiFullscreen()} />
        </div>
      )}
    </MainLayout>
  );
};
