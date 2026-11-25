/**
 * Main Operator Console Page.
 * Implements the broadcast multi-timer workflow from the reference screenshot
 * with full multiple timer-list management, live concurrent execution, and independent timers.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ListOrdered, History, Keyboard, Check } from 'lucide-react';
import { MainLayout } from '../layouts';
import {
  TopMenuBar,
  ControlPanel,
  BottomBar,
  ListManagerModal,
  LanModal,
  FloatingPreviewWindow,
  FloatingMultiPreviewWindow,
  FloatingPresenterWindow,
  TimerHistoryLogView,
  KeyboardShortcutsModal,
  SaveListAsTemplateModal,
} from '../components';
import { TimerTable, TimerEditorModal } from '../timers';
import { MessageEditorModal } from '../messages';
import { SettingsModal } from '../settings';
import { FullscreenDisplay, MultiFullscreenDisplay } from '../displays';
import { useTimerManager, useDisplaySync, useGlobalShortcuts, useMonitorDetection, useWindowManager, useTheme } from '../hooks';
import { formatSeconds } from '../utilities/timeFormatters';
import { TimerItem, DisplayTarget, AppPreferences, formatListNdiSourceName } from '../types';
import { storageService } from '../services/storageService';
import { displaySyncService } from '../services/displaySyncService';
import { timerManagerService } from '../services/timerManager';
import { ndiStreamService, NdiStreamStatus } from '../services/ndiStreamService';
import { shortcutsManager, formatShortcutTokens, ShortcutBinding } from '../services/shortcutsManager';
import { ListTemplate, TemplateLoadMode } from '../services/listTemplatesService';

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
    setTimerColor,
    copyTimerToList,
    switchList,
    addList,
    renameList,
    deleteList,
    duplicateList,
    reorderLists,
    moveList,
    setListColor,
    copyListCuesToList,
    getListTimers,
    saveListAsTemplate,
    loadTemplate,
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
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isListManagerOpen, setIsListManagerOpen] = useState(false);
  const [saveTemplateListId, setSaveTemplateListId] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<{ id: number; message: string } | null>(null);
  const templateNoticeTimerRef = useRef<number | null>(null);
  const [shortcutFeedback, setShortcutFeedback] = useState<{
    id: number;
    label: string;
    combo: string;
    detail?: string;
  } | null>(null);
  const shortcutFeedbackTimerRef = useRef<number | null>(null);
  const [isLanModalOpen, setIsLanModalOpen] = useState(false);
  const [lanModalMode, setLanModalMode] = useState<'lan_control' | 'lan_display'>('lan_control');
  const [isPreviewPopoutOpen, setIsPreviewPopoutOpen] = useState(false);
  const [isMultiPreviewPopoutOpen, setIsMultiPreviewPopoutOpen] = useState(false);
  const [isPresenterPopoutOpen, setIsPresenterPopoutOpen] = useState(false);
  const [ndiStreamStatus, setNdiStreamStatus] = useState<NdiStreamStatus>(() =>
    ndiStreamService.getStatus()
  );

  useEffect(() => {
    return ndiStreamService.subscribe((status) => {
      setNdiStreamStatus(status);
    });
  }, []);

  // Keep Preview, Multi Preview & Presenter active state synced with native Electron windows when running as desktop app
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.isElectron) return;

    api.isPreviewWindowActive?.().then((active) => setIsPreviewPopoutOpen(Boolean(active)));
    api.isMultiPreviewWindowActive?.().then((active) => setIsMultiPreviewPopoutOpen(Boolean(active)));
    api.isPresenterWindowActive?.().then((active) => setIsPresenterPopoutOpen(Boolean(active)));

    const unsubPreview = api.onPreviewStateChanged?.((isOpen) => {
      setIsPreviewPopoutOpen(Boolean(isOpen));
    });
    const unsubMultiPreview = api.onMultiPreviewStateChanged?.((isOpen) => {
      setIsMultiPreviewPopoutOpen(Boolean(isOpen));
    });
    const unsubPresenter = api.onPresenterStateChanged?.((isOpen) => {
      setIsPresenterPopoutOpen(Boolean(isOpen));
    });

    return () => {
      if (unsubPreview) unsubPreview();
      if (unsubMultiPreview) unsubMultiPreview();
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
    selectedMonitorsByList,
    setSelectedMonitor,
    isFullscreenActive,
    activeFullscreenByList,
    openFullscreen,
    closeFullscreen,
    toggleFullscreen,
    isMultiFullscreenActive,
    closeMultiFullscreen,
    toggleMultiFullscreen,
  } = useMonitorDetection(snapshot.activeListId);
  const { toggleAppFullscreen } = useWindowManager();

  // Active list name
  const currentList = useMemo(() => {
    return lists.find((l) => l.id === snapshot.activeListId) || lists[0] || { id: 'list_1', name: 'List 1', timerIds: [] };
  }, [lists, snapshot.activeListId]);

  const listsSignature = useMemo(
    () => lists.map((l) => `${l.id}:${l.name}`).join('|'),
    [lists]
  );

  const activeByListSignature = useMemo(
    () =>
      Object.entries(ndiStreamStatus.activeByList || {})
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k)
        .sort()
        .join(','),
    [ndiStreamStatus.activeByList]
  );

  const activeFsByListSignature = useMemo(
    () =>
      Object.entries(activeFullscreenByList || {})
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k)
        .sort()
        .join(','),
    [activeFullscreenByList]
  );

  // Keep NDI source names and active per-list senders reconciled whenever lists are added, deleted, renamed, or switched
  useEffect(() => {
    ndiStreamService.reconcileLists();
    ndiStreamService.notifySubscribers();
    if (ndiStreamService.getStatus().active) {
      ndiStreamService.syncConfigToServer();
    }
  }, [listsSignature, snapshot.activeListId]);

  // Sync live Fullscreen, Multi Fullscreen, and per-list NDI states to LAN / Remote controllers & Presenter display
  useEffect(() => {
    const activeListNdiSourceName =
      ndiStreamStatus.sourceNamesByList?.[snapshot.activeListId] ||
      formatListNdiSourceName(currentList.name, preferences.ndiSourceName);
    displaySyncService.updateOutputStatus({
      isFullscreenActive,
      activeFullscreenByList: activeFullscreenByList || {},
      isMultiFullscreenActive,
      isNdiActive:
        Boolean(ndiStreamStatus.activeByList?.[snapshot.activeListId]) ||
        Boolean(ndiStreamStatus.multiActive),
      isNdiMultiActive: Boolean(ndiStreamStatus.multiActive),
      activeNdiByList: ndiStreamStatus.activeByList || {},
      ndiSourceNamesByList: ndiStreamStatus.sourceNamesByList || {},
      ndiSourceName: activeListNdiSourceName,
    });
  }, [
    isFullscreenActive,
    activeFsByListSignature,
    isMultiFullscreenActive,
    ndiStreamStatus.active,
    ndiStreamStatus.multiActive,
    activeByListSignature,
    listsSignature,
    snapshot.activeListId,
    currentList.name,
    preferences.ndiSourceName,
  ]);

  // Register handler so LAN / QR Remote Control can remotely activate Fullscreen and NDI per list tab
  useEffect(() => {
    return displaySyncService.registerOutputController((command, cmdPayload) => {
      const targetListId =
        (cmdPayload as { listId?: string } | undefined)?.listId || snapshot.activeListId;
      switch (command) {
        case 'TOGGLE_FULLSCREEN':
          toggleFullscreen(selectedMonitorId, targetListId);
          break;
        case 'OPEN_FULLSCREEN':
          openFullscreen(selectedMonitorId, 'fullscreen', targetListId);
          break;
        case 'CLOSE_FULLSCREEN':
          closeFullscreen(targetListId);
          break;
        case 'TOGGLE_MULTI_FULLSCREEN':
          toggleMultiFullscreen(selectedMonitorId);
          break;
        case 'TOGGLE_NDI':
          ndiStreamService.toggleStream('single', targetListId);
          break;
        case 'TOGGLE_NDI_MULTI':
          ndiStreamService.toggleStream('multi');
          break;
      }
    });
  }, [
    selectedMonitorId,
    snapshot.activeListId,
    toggleFullscreen,
    openFullscreen,
    closeFullscreen,
    toggleMultiFullscreen,
  ]);

  const showShortcutFeedback = useCallback((binding: ShortcutBinding, detail?: string) => {
    if (shortcutFeedbackTimerRef.current !== null) {
      window.clearTimeout(shortcutFeedbackTimerRef.current);
    }
    setShortcutFeedback({
      id: Date.now(),
      label: binding.label,
      combo: binding.combo,
      detail,
    });
    shortcutFeedbackTimerRef.current = window.setTimeout(() => {
      setShortcutFeedback(null);
      shortcutFeedbackTimerRef.current = null;
    }, 1150);
  }, []);

  useEffect(() => {
    return () => {
      if (shortcutFeedbackTimerRef.current !== null) {
        window.clearTimeout(shortcutFeedbackTimerRef.current);
      }
    };
  }, []);

  const switchToRelativeTab = useCallback(
    (delta: 1 | -1): boolean => {
      if (lists.length <= 1) return false;
      const currentIdx = lists.findIndex((l) => l.id === snapshot.activeListId);
      const baseIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = (baseIdx + delta + lists.length) % lists.length;
      const target = lists[nextIdx];
      if (!target) return false;
      switchList(target.id);
      setActiveConsoleTab('cues');
      return true;
    },
    [lists, snapshot.activeListId, switchList]
  );

  const switchToTabIndex = useCallback(
    (index: number): boolean => {
      const target = lists[index];
      if (!target) return false;
      switchList(target.id);
      setActiveConsoleTab('cues');
      return true;
    },
    [lists, switchList]
  );

  const showTemplateNotice = useCallback((message: string) => {
    if (templateNoticeTimerRef.current !== null) {
      window.clearTimeout(templateNoticeTimerRef.current);
    }
    setTemplateNotice({ id: Date.now(), message });
    templateNoticeTimerRef.current = window.setTimeout(() => {
      setTemplateNotice(null);
      templateNoticeTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (templateNoticeTimerRef.current !== null) {
        window.clearTimeout(templateNoticeTimerRef.current);
      }
    };
  }, []);

  const handleLoadTemplate = useCallback(
    (template: ListTemplate, mode: TemplateLoadMode) => {
      const res = loadTemplate(template, mode);
      setActiveConsoleTab('cues');
      const actionText =
        mode === 'new_tab'
          ? `Loaded "${template.name}" into new tab "${res.listName}" (${res.cueCount} cues)`
          : mode === 'replace'
          ? `Replaced "${res.listName}" with "${template.name}" (${res.cueCount} cues)`
          : `Appended "${template.name}" to "${res.listName}" (+${res.cueCount} cues)`;
      showTemplateNotice(actionText);
    },
    [loadTemplate, showTemplateNotice]
  );

  const isAnyModalOpen =
    isEditorOpen ||
    isMessageModalOpen ||
    isSettingsOpen ||
    isListManagerOpen ||
    isLanModalOpen ||
    isShortcutsModalOpen ||
    Boolean(saveTemplateListId);

  // Global Keyboard Shortcuts Manager
  useGlobalShortcuts(
    {
      'timer.togglePlayPause': () => togglePlayPause(),
      'timer.start': () => start(),
      'timer.stop': () => {
        if (isFullscreenActive) {
          closeFullscreen(snapshot.activeListId);
        } else if (isMultiFullscreenActive) {
          closeMultiFullscreen();
        } else {
          stop();
        }
      },
      'timer.reset': () => {
        const target = activeTimer || cuedTimer || timers[0];
        if (!target) return false;
        cue(target.id);
        return true;
      },
      'timer.restart': () => restart(),
      'timer.cueNext': () => cueNext(),
      'timer.cuePrev': () => cuePrev(),
      'timer.addMinute': () => adjustDuration(60),
      'timer.subMinute': () => adjustDuration(-60),
      'tabs.next': () => switchToRelativeTab(1),
      'tabs.prev': () => switchToRelativeTab(-1),
      'tabs.history': () =>
        setActiveConsoleTab((prev) => (prev === 'history' ? 'cues' : 'history')),
      'tabs.tab1': () => switchToTabIndex(0),
      'tabs.tab2': () => switchToTabIndex(1),
      'tabs.tab3': () => switchToTabIndex(2),
      'tabs.tab4': () => switchToTabIndex(3),
      'tabs.tab5': () => switchToTabIndex(4),
      'tabs.tab6': () => switchToTabIndex(5),
      'tabs.tab7': () => switchToTabIndex(6),
      'tabs.tab8': () => switchToTabIndex(7),
      'tabs.tab9': () => switchToTabIndex(8),
      'display.blackout': () => toggleBlackout(),
      'display.message': () => setIsMessageModalOpen(true),
      'display.listManager': () => setIsListManagerOpen(true),
      'display.fullscreen': () => {
        void toggleAppFullscreen();
      },
      'app.undo': () => undo(),
      'app.redo': () => redo(),
      'app.shortcuts': () => setIsShortcutsModalOpen((prev) => !prev),
    },
    {
      enabled: preferences.hotkeysEnabled,
      isModalOpen: isAnyModalOpen,
      onTriggered: (binding) => {
        if (binding.id === 'app.shortcuts') return;
        let detail: string | undefined;
        if (binding.id === 'tabs.next' || binding.id === 'tabs.prev') {
          const delta = binding.id === 'tabs.next' ? 1 : -1;
          const idx = lists.findIndex((l) => l.id === snapshot.activeListId);
          const target = lists[(Math.max(0, idx) + delta + lists.length) % lists.length];
          if (target) detail = target.name;
        } else if (binding.id.startsWith('tabs.tab')) {
          const tabIdx = Number(binding.id.replace('tabs.tab', '')) - 1;
          const target = lists[tabIdx];
          if (target) detail = target.name;
        } else if (binding.id === 'tabs.history') {
          detail = activeConsoleTab === 'history' ? 'Timer List' : 'History Log';
        }
        showShortcutFeedback(binding, detail);
      },
    }
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
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
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
        hasActiveMessage={Boolean(payload?.activeMessage?.text)}
        messageVisible={Boolean(payload?.activeMessage?.visible)}
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
        className={`h-10 px-3 flex items-center gap-2 border-b select-none transition-colors ${
          isDark ? 'bg-[#151518]/80 border-white/[0.07]' : 'bg-slate-200/70 border-slate-300'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveConsoleTab('cues')}
          style={
            currentList.color
              ? activeConsoleTab === 'cues'
                ? {
                    borderColor: `${currentList.color}bb`,
                    background: isDark
                      ? `linear-gradient(180deg, ${currentList.color}70 0%, ${currentList.color}3d 100%)`
                      : `linear-gradient(180deg, ${currentList.color}60 0%, ${currentList.color}38 100%)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 12px ${currentList.color}33`,
                  }
                : {
                    borderColor: `${currentList.color}66`,
                    background: isDark
                      ? `linear-gradient(180deg, ${currentList.color}3d 0%, ${currentList.color}20 100%)`
                      : `linear-gradient(180deg, ${currentList.color}33 0%, ${currentList.color}1a 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
                  }
              : undefined
          }
          className={`px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide flex items-center gap-1.5 transition-all cursor-pointer ${
            currentList.color
              ? `border ${isDark ? 'text-white hover:brightness-110' : 'text-slate-950 hover:brightness-105'}`
              : activeConsoleTab === 'cues'
              ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
              : 'glass-btn glass-btn-subtle'
          }`}
        >
          {currentList.color ? (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/50 shadow-2xs"
              style={{ backgroundColor: currentList.color }}
            />
          ) : (
            <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
          )}
          <span>{currentList.name}</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              isDark ? 'bg-black/35 text-neutral-200' : 'bg-white/60 text-slate-700'
            }`}
          >
            {timers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveConsoleTab('history')}
          className={`glass-btn glass-btn-subtle px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide flex items-center gap-1.5 cursor-pointer ${
            activeConsoleTab === 'history' ? 'glass-btn-cyan-active' : ''
          }`}
        >
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>History</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeConsoleTab === 'history'
                ? isDark
                  ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/35'
                  : 'bg-white/30 text-white border border-white/40'
                : isDark
                ? 'bg-black/35 text-neutral-300'
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
          lists={lists}
          activeListId={snapshot.activeListId}
          activeListColor={currentList.color}
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
          onChangeTimerColor={(id, colorTag) => setTimerColor(id, colorTag)}
          onCopyTimerToList={(timerId, targetListId) => copyTimerToList(timerId, targetListId)}
          onChangeListColor={(listId, color) => setListColor(listId, color)}
          onCopyListCuesToList={(srcId, destId, mode) => copyListCuesToList(srcId, destId, mode)}
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
        onSetListColor={(id, color) => setListColor(id, color)}
        onCopyListCuesToList={(srcId, destId, mode) => copyListCuesToList(srcId, destId, mode)}
        onSaveListAsTemplate={(id) => setSaveTemplateListId(id)}
        onOpenListManager={() => setIsListManagerOpen(true)}
        getRunningTimerCount={(id) => getRunningTimerCount(id)}
        isHistoryTabActive={activeConsoleTab === 'history'}
        onSelectHistoryTab={() =>
          setActiveConsoleTab((prev) => (prev === 'history' ? 'cues' : 'history'))
        }
        historyCount={runLogs.length}
        onOpenDisplay={(target: DisplayTarget) => {
          const isRemoteDesktop =
            typeof window !== 'undefined' &&
            new URLSearchParams(window.location.search).get('display') === 'lan_desktop';
          if (target === 'fullscreen') {
            if (isRemoteDesktop) {
              displaySyncService.sendRemoteCommand('TOGGLE_FULLSCREEN', {
                listId: snapshot.activeListId,
              });
            } else {
              toggleFullscreen(selectedMonitorId, snapshot.activeListId);
            }
          } else if (target === 'multi_fullscreen') {
            if (isRemoteDesktop) {
              displaySyncService.sendRemoteCommand('TOGGLE_MULTI_FULLSCREEN', {
                listId: snapshot.activeListId,
              });
            } else {
              toggleMultiFullscreen(selectedMonitorId);
            }
          } else if (target === 'ndi') {
            if (isRemoteDesktop) {
              displaySyncService.sendRemoteCommand('TOGGLE_NDI', {
                listId: snapshot.activeListId,
              });
            } else {
              ndiStreamService.toggleStream('single', snapshot.activeListId);
            }
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
          } else if (target === 'multi_preview') {
            if (typeof window !== 'undefined' && window.electronAPI?.isElectron && window.electronAPI.toggleMultiPreviewWindow) {
              window.electronAPI.toggleMultiPreviewWindow().then((res) => {
                setIsMultiPreviewPopoutOpen(Boolean(res?.active));
              });
            } else {
              setIsMultiPreviewPopoutOpen((prev) => !prev);
            }
          } else if (target === 'lan_control') {
            if (isLanModalOpen && lanModalMode === 'lan_control') {
              setIsLanModalOpen(false);
            } else {
              setLanModalMode('lan_control');
              setIsLanModalOpen(true);
            }
          } else if (target === 'lan_display') {
            if (isLanModalOpen && lanModalMode === 'lan_display') {
              setIsLanModalOpen(false);
            } else {
              setLanModalMode('lan_display');
              setIsLanModalOpen(true);
            }
          } else {
            openDisplayWindow(target, undefined, snapshot.activeListId);
          }
        }}
        onOpenLanModal={() => {
          setLanModalMode('lan_control');
          setIsLanModalOpen(true);
        }}
        isLanControlActive={isLanModalOpen && lanModalMode === 'lan_control'}
        isLanDisplayActive={isLanModalOpen && lanModalMode === 'lan_display'}
        fullscreenMonitor={selectedMonitorId}
        onChangeMonitor={(m) => {
          setSelectedMonitor(m, snapshot.activeListId);
          if (isFullscreenActive) {
            openFullscreen(m, 'fullscreen', snapshot.activeListId);
          }
        }}
        detectedMonitors={displays}
        isFullscreenActive={isFullscreenActive || Boolean(payload?.isFullscreenActive)}
        activeFullscreenByList={activeFullscreenByList}
        selectedMonitorsByList={selectedMonitorsByList}
        onCloseFullscreen={() => closeFullscreen(snapshot.activeListId)}
        isMultiFullscreenActive={isMultiFullscreenActive || Boolean(payload?.isMultiFullscreenActive)}
        onCloseMultiFullscreen={closeMultiFullscreen}
        isPreviewActive={isPreviewPopoutOpen}
        isMultiPreviewActive={isMultiPreviewPopoutOpen}
        isPresenterActive={isPresenterPopoutOpen}
        activeNdiByList={
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('display') === 'lan_desktop'
            ? payload?.activeNdiByList || ndiStreamStatus.activeByList
            : ndiStreamStatus.activeByList
        }
        ndiStreamStatus={
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('display') === 'lan_desktop'
            ? {
                ...ndiStreamStatus,
                active:
                  Boolean(payload?.isNdiActive) ||
                  Boolean(payload?.isNdiMultiActive) ||
                  Object.values(payload?.activeNdiByList || {}).some(Boolean),
                multiActive: Boolean(payload?.isNdiMultiActive),
                activeByList: payload?.activeNdiByList || ndiStreamStatus.activeByList,
                sourceNamesByList:
                  payload?.ndiSourceNamesByList || ndiStreamStatus.sourceNamesByList,
                mode: payload?.isNdiMultiActive ? 'multi' : 'single',
                sourceName:
                  payload?.ndiSourceNamesByList?.[snapshot.activeListId] ||
                  payload?.ndiSourceName ||
                  formatListNdiSourceName(currentList.name, preferences.ndiSourceName),
              }
            : ndiStreamStatus
        }
        onToggleNdiStream={(mode, listId) => {
          const targetListId = listId || snapshot.activeListId;
          const isRemoteDesktop =
            typeof window !== 'undefined' &&
            new URLSearchParams(window.location.search).get('display') === 'lan_desktop';
          if (isRemoteDesktop) {
            displaySyncService.sendRemoteCommand(
              mode === 'multi' ? 'TOGGLE_NDI_MULTI' : 'TOGGLE_NDI',
              { listId: targetListId }
            );
          } else {
            ndiStreamService.toggleStream(mode, targetListId);
          }
        }}
      />

      {/* ALWAYS-ON-TOP RESIZABLE PRESENTER POP-OUT SCREEN (Web mode only — Electron uses native frameless always-on-top window) */}
      {!(typeof window !== 'undefined' && window.electronAPI?.isElectron) && (
        <FloatingPresenterWindow
          isOpen={isPresenterPopoutOpen}
          onClose={() => setIsPresenterPopoutOpen(false)}
          payload={payload}
          activeFullscreenByList={activeFullscreenByList}
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
          activeMessage={payload?.activeMessage ?? null}
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
          activeMessage={payload?.activeMessage ?? null}
          onStart={() => start()}
          onPause={() => pause()}
          onStop={() => stop()}
          onNextCue={() => skipEvent()}
          onAdjustDuration={(delta) => adjustDuration(delta)}
        />
      )}

      {/* ALWAYS-ON-TOP RESIZABLE MULTI PREVIEW POP-OUT SCREEN (Web mode only — Electron uses native frameless always-on-top window) */}
      {!(typeof window !== 'undefined' && window.electronAPI?.isElectron) && (
        <FloatingMultiPreviewWindow
          isOpen={isMultiPreviewPopoutOpen}
          onClose={() => setIsMultiPreviewPopoutOpen(false)}
          listActiveCues={payload?.listActiveCues || timerManagerService.getAllListsActiveCues()}
          activeListId={snapshot.activeListId}
          isBlackout={payload?.isBlackout ?? false}
          isClockMode={payload?.isClockMode ?? false}
          clockTimeFormatted={payload?.clockTimeFormatted}
          activeMessage={payload?.activeMessage ?? null}
          onSelectList={(id) => switchList(id)}
          onStartList={(listId) => timerManagerService.start(undefined, listId)}
          onPauseList={(listId) => timerManagerService.pause(undefined, listId)}
          onStopList={(listId) => timerManagerService.stop(undefined, listId)}
          onNextCueList={(listId) => timerManagerService.moveNextCue(listId)}
          onAdjustDurationList={(listId, delta) =>
            timerManagerService.adjustDuration(delta, undefined, listId)
          }
        />
      )}

      {/* 5. MODALS */}
      <TimerEditorModal
        isOpen={isEditorOpen}
        timer={editingTimer}
        activeListName={currentList.name}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveTimer}
        onLoadTemplate={handleLoadTemplate}
        onSaveCurrentListAsTemplate={() => setSaveTemplateListId(currentList.id)}
      />

      <SaveListAsTemplateModal
        isOpen={Boolean(saveTemplateListId)}
        list={saveTemplateListId ? lists.find((l) => l.id === saveTemplateListId) || null : null}
        timers={saveTemplateListId ? getListTimers(saveTemplateListId) : []}
        onClose={() => setSaveTemplateListId(null)}
        onSave={({ listId, name, description, category }) => {
          const saved = saveListAsTemplate(listId, { name, description, category });
          if (saved) {
            showTemplateNotice(
              `Saved "${saved.name}" as template (${saved.cues.length} cue${
                saved.cues.length === 1 ? '' : 's'
              })`
            );
          }
        }}
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
        onSetListColor={(id, color) => setListColor(id, color)}
        onCopyListCuesToList={(srcId, destId, mode) => copyListCuesToList(srcId, destId, mode)}
        onSaveListAsTemplate={(id) => setSaveTemplateListId(id)}
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
          shortcutsManager.setGlobalEnabled(newPrefs.hotkeysEnabled);
          if (newPrefs.theme && newPrefs.theme !== theme) {
            setTheme(newPrefs.theme);
          }
          storageService.savePreferences(newPrefs);
          displaySyncService.notifyPreferencesUpdated();
        }}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        onGlobalToggleSync={(enabled) => {
          const updated = { ...preferences, hotkeysEnabled: enabled };
          setPreferences(updated);
          storageService.savePreferences(updated);
          displaySyncService.notifyPreferencesUpdated();
        }}
      />

      <LanModal
        isOpen={isLanModalOpen}
        onClose={() => setIsLanModalOpen(false)}
        activeListId={snapshot.activeListId}
        activeListName={currentList.name}
        mode={lanModalMode}
      />

      {/* TRANSIENT KEYBOARD SHORTCUT FEEDBACK TOAST */}
      {shortcutFeedback &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            key={shortcutFeedback.id}
            className="fixed bottom-16 right-4 z-[9200] pointer-events-none select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <div className="glass-card rounded-full px-3.5 py-2 flex items-center gap-2.5 text-xs text-slate-900 dark:text-slate-100">
              <Keyboard className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />
              <span className="font-semibold whitespace-nowrap">
                {shortcutFeedback.detail
                  ? `${shortcutFeedback.label}: ${shortcutFeedback.detail}`
                  : shortcutFeedback.label}
              </span>
              <span className="inline-flex items-center gap-1 shrink-0">
                {formatShortcutTokens(shortcutFeedback.combo).map((tok, i) => (
                  <kbd
                    key={`${tok}-${i}`}
                    className="px-1.5 py-0.5 rounded bg-slate-900/10 dark:bg-white/10 border border-slate-900/10 dark:border-white/15 font-mono text-[10px] leading-none"
                  >
                    {tok}
                  </kbd>
                ))}
              </span>
            </div>
          </div>,
          document.body
        )}

      {/* TRANSIENT TEMPLATE ACTION CONFIRMATION TOAST */}
      {templateNotice &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            key={templateNotice.id}
            className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[9210] pointer-events-none select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <div className="glass-card rounded-full px-4 py-2 flex items-center gap-2 text-xs text-slate-900 dark:text-slate-100">
              <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span className="font-semibold whitespace-nowrap">{templateNotice.message}</span>
            </div>
          </div>,
          document.body
        )}

      {/* FULLSCREEN OUTPUT WINDOW OVERLAY (Web / Preview Window) */}
      {isFullscreenActive && !(typeof window !== 'undefined' && window.electronAPI?.isElectron) && (
        <div className="fixed inset-0 z-[9998]">
          <FullscreenDisplay
            listId={snapshot.activeListId}
            isClient={false}
            onClose={() => closeFullscreen(snapshot.activeListId)}
          />
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
