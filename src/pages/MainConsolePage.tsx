/**
 * Main Operator Console Page.
 * Implements the broadcast multi-timer workflow from the reference screenshot
 * with full multiple timer-list management, live concurrent execution, and independent timers.
 */

import React, { useState, useMemo } from 'react';
import { MainLayout } from '../layouts';
import { TopMenuBar, ControlPanel, BottomBar, ListManagerModal, LanModal } from '../components';
import { TimerTable, TimerEditorModal } from '../timers';
import { MessageEditorModal } from '../messages';
import { SettingsModal } from '../settings';
import { useTimerManager, useDisplaySync, useHotkeys, useMonitorDetection, useWindowManager, useTheme } from '../hooks';
import { formatSeconds } from '../utilities/timeFormatters';
import { TimerItem, DisplayTarget, AppPreferences } from '../types';
import { storageService } from '../services/storageService';

export const MainConsolePage: React.FC = () => {
  const {
    snapshot,
    timers,
    lists,
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

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTimer, setEditingTimer] = useState<TimerItem | null>(null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isListManagerOpen, setIsListManagerOpen] = useState(false);
  const [isLanModalOpen, setIsLanModalOpen] = useState(false);

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
  } = useMonitorDetection();
  const { toggleAppFullscreen } = useWindowManager();

  // Active list name
  const currentList = useMemo(() => {
    return lists.find((l) => l.id === snapshot.activeListId) || lists[0] || { id: 'list_1', name: 'List 1: Sunday Service', timerIds: [] };
  }, [lists, snapshot.activeListId]);

  // Keyboard Hotkeys
  useHotkeys(
    {
      Space: () => togglePlayPause(),
      Escape: () => stop(),
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
  };

  const handleAddTimerType = (
    type: 'countdown' | 'count_up' | 'end_time' | 'stopwatch' | 'clock' | 'empty' | 'spacer'
  ) => {
    switch (type) {
      case 'countdown':
        addTimer({
          name: 'Countdown',
          durationSeconds: 600,
          remainingSeconds: 600,
          type: 'countdown',
          endAction: 'count_up',
          speed: 100,
          alert1: {
            id: 'alt1',
            timeSeconds: 120,
            color: '#eab308',
            flash: false,
            soundEnabled: false,
            label: 'Alert 1 (Warning)',
          },
          alert2: {
            id: 'alt2',
            timeSeconds: 60,
            color: '#ef4444',
            flash: true,
            soundEnabled: false,
            label: 'Alert 2 (Danger)',
          },
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
          durationSeconds: 1800,
          remainingSeconds: 1800,
          type: 'countdown',
          endAction: 'count_up',
          speed: 100,
          alert1: {
            id: 'alt1',
            timeSeconds: 300,
            color: '#eab308',
            flash: false,
            soundEnabled: false,
            label: 'Alert 1 (Warning)',
          },
          alert2: {
            id: 'alt2',
            timeSeconds: 60,
            color: '#ef4444',
            flash: true,
            soundEnabled: false,
            label: 'Alert 2 (Danger)',
          },
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
        onUndo={() => {
          adjustDuration(-60);
        }}
        onRedo={() => {
          adjustDuration(60);
        }}
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
        timeStr={formatSeconds(snapshot.currentSeconds, true, snapshot.isOvertime)}
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

      {/* 3. TIMER LIST TABLE */}
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

      {/* 4. BOTTOM BAR */}
      <BottomBar
        lists={lists}
        activeListId={snapshot.activeListId}
        onSelectList={(id) => switchList(id)}
        onAddList={handleAddList}
        onRenameList={(id, newName) => renameList(id, newName)}
        onDuplicateList={(id) => duplicateList(id)}
        onDeleteList={(id) => deleteList(id)}
        onMoveList={(id, dir) => moveList(id, dir)}
        onExportList={(id) => downloadListJson(id)}
        onOpenListManager={() => setIsListManagerOpen(true)}
        getRunningTimerCount={(id) => getRunningTimerCount(id)}
        onOpenDisplay={(target: DisplayTarget) => {
          if (target === 'fullscreen') {
            openFullscreen(selectedMonitorId, 'fullscreen');
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
      />

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
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newPrefs) => {
          setPreferences(newPrefs);
          if (newPrefs.theme && newPrefs.theme !== theme) {
            setTheme(newPrefs.theme);
          }
          storageService.savePreferences(newPrefs);
        }}
      />

      <LanModal
        isOpen={isLanModalOpen}
        onClose={() => setIsLanModalOpen(false)}
      />
    </MainLayout>
  );
};
