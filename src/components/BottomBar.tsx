/**
 * Bottom Navigation & Output Toolbar with Full Multiple List Management & Context Actions.
 * Matches the reference screenshot with two clean production rows:
 * Row 1: Timer List Tabs (List 1, List 2, List 3, +, Manage) with live running indicators
 * Row 2: Output Toolbar (Presenter, Preview, Fullscreen, NDI, NDI Multi, Multi Preview, Multi FS, LAN Control, LAN Display) + Fullscreen Monitor Dropdown
 * Full Dark & Light theme responsive styling.
 */

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  ChevronDown, 
  FolderEdit, 
  Copy, 
  Edit3, 
  Trash2, 
  Download, 
  ArrowLeft, 
  ArrowRight,
  Check,
  X,
  Wifi,
  History,
  Palette,
  FolderInput,
  BookmarkPlus,
} from 'lucide-react';
import { TimerList, DisplayTarget, DetectedMonitor, formatListNdiSourceName } from '../types';
import { NdiStreamStatus } from '../services/ndiStreamService';
import { useTheme } from '../hooks';
import { CUE_COLOR_SWATCHES } from '../timers/ContextMenu';

interface BottomBarProps {
  lists: TimerList[];
  activeListId: string;
  onSelectList: (id: string) => void;
  onAddList: () => void;
  onRenameList?: (id: string, newName: string) => void;
  onDuplicateList?: (id: string) => void;
  onDeleteList?: (id: string) => void;
  onMoveList?: (id: string, direction: 'left' | 'right') => void;
  onExportList?: (id: string) => void;
  onSetListColor?: (id: string, color?: string) => void;
  onCopyListCuesToList?: (sourceListId: string, targetListId: string, mode?: 'append' | 'replace') => number;
  onSaveListAsTemplate?: (listId: string) => void;
  onOpenListManager?: () => void;
  getRunningTimerCount?: (id: string) => number;
  onOpenDisplay: (target: DisplayTarget) => void;
  onOpenLanModal?: () => void;
  fullscreenMonitor: string;
  onChangeMonitor: (monitor: string) => void;
  detectedMonitors?: DetectedMonitor[];
  isFullscreenActive?: boolean;
  activeFullscreenByList?: Record<string, boolean>;
  selectedMonitorsByList?: Record<string, string>;
  onCloseFullscreen?: () => void;
  isMultiFullscreenActive?: boolean;
  onCloseMultiFullscreen?: () => void;
  isPreviewActive?: boolean;
  isMultiPreviewActive?: boolean;
  isPresenterActive?: boolean;
  isLanControlActive?: boolean;
  isLanDisplayActive?: boolean;
  activeNdiByList?: Record<string, boolean>;
  ndiStreamStatus?: NdiStreamStatus;
  onToggleNdiStream?: (mode: 'single' | 'multi', listId?: string) => void;
  isHistoryTabActive?: boolean;
  onSelectHistoryTab?: () => void;
  historyCount?: number;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  lists,
  activeListId,
  onSelectList,
  onAddList,
  onRenameList,
  onDuplicateList,
  onDeleteList,
  onMoveList,
  onExportList,
  onSetListColor,
  onCopyListCuesToList,
  onSaveListAsTemplate,
  onOpenListManager,
  getRunningTimerCount,
  onOpenDisplay,
  onOpenLanModal,
  fullscreenMonitor,
  onChangeMonitor,
  detectedMonitors = [],
  isFullscreenActive = false,
  activeFullscreenByList = {},
  selectedMonitorsByList = {},
  onCloseFullscreen,
  isMultiFullscreenActive = false,
  onCloseMultiFullscreen,
  isPreviewActive = false,
  isMultiPreviewActive = false,
  isPresenterActive = false,
  isLanControlActive = false,
  isLanDisplayActive = false,
  activeNdiByList = {},
  ndiStreamStatus,
  onToggleNdiStream,
  isHistoryTabActive = false,
  onSelectHistoryTab,
  historyCount = 0,
}) => {
  const { isDark } = useTheme();
  const activeListObj = lists.find((l) => l.id === activeListId) || lists[0];
  const activeListName = activeListObj?.name || 'List 1';
  const effectiveActiveNdiByList: Record<string, boolean> = {
    ...(ndiStreamStatus?.activeByList || {}),
    ...activeNdiByList,
  };
  const activeListNdiSourceName =
    ndiStreamStatus?.sourceNamesByList?.[activeListId] ||
    formatListNdiSourceName(activeListName, ndiStreamStatus?.sourceName);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    anchorX: number;
    anchorY: number;
    listId: string;
    listName: string;
  } | null>(null);
  const [copyMode, setCopyMode] = useState<'append' | 'replace'>('append');
  const [tabCopyFeedback, setTabCopyFeedback] = useState<string | null>(null);

  // Inline rename state
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 10;
    const clampedX = Math.max(
      pad,
      Math.min(contextMenu.anchorX, window.innerWidth - rect.width - pad)
    );
    const preferredTop = contextMenu.anchorY - rect.height - 6;
    const clampedY = Math.max(
      pad,
      Math.min(preferredTop, window.innerHeight - rect.height - pad)
    );
    if (Math.abs(clampedX - contextMenu.x) > 1 || Math.abs(clampedY - contextMenu.y) > 1) {
      setContextMenu((prev) => (prev ? { ...prev, x: clampedX, y: clampedY } : null));
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, list: TimerList) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const estimatedHeight = 360;
    setContextMenu({
      visible: true,
      anchorX: e.clientX,
      anchorY: e.clientY,
      x: Math.max(10, Math.min(e.clientX, window.innerWidth - menuWidth - 10)),
      y: Math.max(10, e.clientY - estimatedHeight),
      listId: list.id,
      listName: list.name,
    });
  };

  const handleStartInlineRename = (list: TimerList) => {
    setInlineEditingId(list.id);
    setInlineName(list.name);
    setContextMenu(null);
  };

  const handleSaveInlineRename = (listId: string) => {
    if (inlineName.trim() && onRenameList) {
      onRenameList(listId, inlineName.trim());
    }
    setInlineEditingId(null);
  };

  return (
    <footer className={`glass-surface border-t select-none text-xs relative z-40 transition-colors duration-150 ${
      isDark ? 'border-white/[0.08] text-neutral-300' : 'border-slate-300/80 text-slate-700'
    }`}>
      {/* =========================================================================
          ROW 1: TIMER LIST TABS & HISTORY TAB
          List 1 | List 2 | List 3 | + | History | [Manage Lists]
         ========================================================================= */}
      <div className={`h-9 px-2.5 flex items-center justify-between border-b transition-colors ${
        isDark ? 'border-white/[0.07] bg-black/25' : 'border-slate-300/70 bg-white/30'
      }`}>
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {lists.map((list) => {
            const isActive = !isHistoryTabActive && list.id === activeListId;
            const runningCount = getRunningTimerCount ? getRunningTimerCount(list.id) : 0;
            const isListFsActive = Boolean(activeFullscreenByList[list.id]);
            const isListNdiActive = Boolean(
              effectiveActiveNdiByList[list.id] || ndiStreamStatus?.multiActive
            );
            const listNdiSourceName =
              ndiStreamStatus?.sourceNamesByList?.[list.id] ||
              formatListNdiSourceName(list.name, ndiStreamStatus?.sourceName);
            const isEditing = inlineEditingId === list.id;

            if (isEditing) {
              return (
                <div key={list.id} className={`flex items-center gap-1 px-2 py-0.5 rounded border border-cyan-500 ${
                  isDark ? 'bg-[#151c28]' : 'bg-white shadow-xs'
                }`}>
                  <input
                    type="text"
                    autoFocus
                    value={inlineName}
                    onChange={(e) => setInlineName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveInlineRename(list.id);
                      if (e.key === 'Escape') setInlineEditingId(null);
                    }}
                    className={`bg-transparent text-xs focus:outline-hidden w-28 ${isDark ? 'text-white' : 'text-slate-900'}`}
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveInlineRename(list.id)}
                    className="text-emerald-500 hover:text-emerald-400 p-0.5 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setInlineEditingId(null)}
                    className={`p-0.5 cursor-pointer ${isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            }

            const tabColor = list.color;
            const tabInlineStyle: React.CSSProperties | undefined = tabColor
              ? isActive
                ? {
                    borderColor: `${tabColor}bb`,
                    background: isDark
                      ? `linear-gradient(180deg, ${tabColor}70 0%, ${tabColor}3d 100%)`
                      : `linear-gradient(180deg, ${tabColor}66 0%, ${tabColor}3d 100%)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 12px ${tabColor}33`,
                  }
                : {
                    borderColor: `${tabColor}66`,
                    background: isDark
                      ? `linear-gradient(180deg, ${tabColor}42 0%, ${tabColor}22 100%)`
                      : `linear-gradient(180deg, ${tabColor}38 0%, ${tabColor}1c 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
                  }
              : undefined;

            return (
              <button
                key={list.id}
                type="button"
                onClick={() => onSelectList(list.id)}
                onContextMenu={(e) => handleContextMenu(e, list)}
                onDoubleClick={() => handleStartInlineRename(list)}
                title={`${list.name} (${list.timerIds.length} cues) — NDI Source: ${listNdiSourceName} (Right-click to edit, rename, change color, or delete tab; Double-click to rename)`}
                style={tabInlineStyle}
                className={`group px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 relative cursor-pointer ${
                  tabColor
                    ? `border ${isDark ? 'text-white hover:brightness-110' : 'text-slate-950 hover:brightness-105'}`
                    : isActive
                    ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                    : 'glass-btn glass-btn-subtle'
                }`}
              >
                {tabColor && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/50 shadow-2xs"
                    style={{ backgroundColor: tabColor }}
                  />
                )}
                <span>{list.name}</span>

                {/* Live Running Timer Badge on Tab */}
                {runningCount > 0 && (
                  <span 
                    title={`${runningCount} timer${runningCount > 1 ? 's' : ''} currently running in this list`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>{runningCount}</span>
                  </span>
                )}

                {/* Independent Fullscreen Active Badge on Tab */}
                {isListFsActive && (
                  <span
                    title={`Fullscreen output is active for ${list.name}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>FS</span>
                  </span>
                )}

                {/* Independent Per-List NDI Active Badge on Tab */}
                {isListNdiActive && (
                  <span
                    title={`NDI output is active for ${list.name}: ${listNdiSourceName}`}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono border ${
                      ndiStreamStatus?.multiActive && !effectiveActiveNdiByList[list.id]
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        ndiStreamStatus?.multiActive && !effectiveActiveNdiByList[list.id]
                          ? 'bg-amber-400'
                          : 'bg-purple-400'
                      }`}
                    />
                    <span>NDI</span>
                  </span>
                )}
              </button>
            );
          })}

          {/* Quick Add List (+) */}
          <button
            type="button"
            onClick={onAddList}
            title="Add New List (+)"
            className="glass-btn glass-btn-subtle w-6 h-6 rounded-full flex items-center justify-center cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* History Tab */}
          {onSelectHistoryTab && (
            <>
              <div className={`h-4 w-px mx-1 ${isDark ? 'bg-white/10' : 'bg-slate-300'}`} />
              <button
                type="button"
                onClick={onSelectHistoryTab}
                title="Timer Run History (Start & Stop Timestamps)"
                className={`glass-btn glass-btn-subtle px-3 py-1 rounded-full text-xs font-semibold tracking-wide flex items-center gap-1.5 cursor-pointer ${
                  isHistoryTabActive ? 'glass-btn-cyan-active' : ''
                }`}
              >
                <History className="w-3.5 h-3.5 text-cyan-400" />
                <span>History</span>
                {historyCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isDark
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                    }`}
                  >
                    {historyCount}
                  </span>
                )}
              </button>
            </>
          )}
        </div>

        {/* Manage Lists Button & Copy Feedback */}
        <div className="flex items-center gap-2">
          {tabCopyFeedback && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-medium flex items-center gap-1 border animate-in fade-in ${
                isDark
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}
            >
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{tabCopyFeedback}</span>
            </span>
          )}
          {onOpenListManager && (
            <button
              type="button"
              onClick={onOpenListManager}
              title="Open Lists Manager"
              className="glass-btn glass-btn-subtle px-3 py-1 text-[11px] rounded-full flex items-center gap-1.5 cursor-pointer"
            >
              <FolderEdit className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Manage Lists</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          ROW 2: OUTPUT TOOLBAR & MONITOR SELECTION
          Presenter | Preview | Fullscreen | NDI | NDI Multi | Multi Preview | Multi FS | LAN Control | LAN Display
          Fullscreen monitor: [ Auto v ]
         ========================================================================= */}
      <div className={`h-11 px-3 flex items-center justify-between gap-3 overflow-x-auto transition-colors ${
        isDark ? 'bg-transparent' : 'bg-white/25'
      }`}>
        {/* Output Action Buttons */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {[
            { label: 'Presenter', target: 'presenter' as DisplayTarget, tooltip: 'Open Speaker Confidence Display' },
            { label: 'Preview', target: 'preview' as DisplayTarget, tooltip: 'Open Control Room Preview Window' },
            {
              label: 'Fullscreen',
              target: 'fullscreen' as DisplayTarget,
              tooltip: `Toggle Independent Fullscreen Output for ${activeListName} on its Selected Monitor`,
            },
            {
              label: 'NDI',
              target: 'ndi' as DisplayTarget,
              ndiMode: 'single' as const,
              tooltip: `Activate Independent NDI Broadcast Stream for ${activeListName}: ${activeListNdiSourceName}`,
            },
            {
              label: 'NDI Multi',
              target: 'ndi' as DisplayTarget,
              ndiMode: 'multi' as const,
              tooltip: `Activate Multi-List NDI Broadcast Stream (Broadcasts all ${lists.length} list NDI feeds simultaneously)`,
            },
            {
              label: 'Multi Preview',
              target: 'multi_preview' as DisplayTarget,
              tooltip: 'Open Multi Preview Pop-Out Window (Active Cues Across All List Tabs)',
            },
            { label: 'Multi FS', target: 'multi_fullscreen' as DisplayTarget, tooltip: 'Multi Fullscreen: Display Active Cue of All List Tabs' },
            {
              label: 'LAN Control',
              target: 'lan_control' as DisplayTarget,
              tooltip: `Open LAN Control QR & Access PIN Security for ${activeListName}`,
            },
            {
              label: 'LAN Display',
              target: 'lan_display' as DisplayTarget,
              tooltip: `Open LAN Display QR & Link for ${activeListName}`,
            },
          ].map((item) => {
            const isNdiSingleActive =
              item.label === 'NDI' && Boolean(effectiveActiveNdiByList[activeListId]);
            const isNdiMultiActive =
              item.label === 'NDI Multi' &&
              Boolean(
                ndiStreamStatus?.multiActive !== undefined
                  ? ndiStreamStatus.multiActive
                  : ndiStreamStatus?.active && ndiStreamStatus.mode === 'multi'
              );
            const isActive =
              (item.label === 'Presenter' && isPresenterActive) ||
              (item.label === 'Preview' && isPreviewActive) ||
              (item.label === 'Multi Preview' && isMultiPreviewActive) ||
              (item.label === 'Fullscreen' && isFullscreenActive) ||
              (item.label === 'Multi FS' && isMultiFullscreenActive) ||
              (item.label === 'LAN Control' && isLanControlActive) ||
              (item.label === 'LAN Display' && isLanDisplayActive) ||
              isNdiSingleActive ||
              isNdiMultiActive;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.ndiMode && onToggleNdiStream) {
                    onToggleNdiStream(
                      item.ndiMode,
                      item.ndiMode === 'single' ? activeListId : undefined
                    );
                  } else {
                    onOpenDisplay(item.target);
                  }
                }}
                title={
                  item.label === 'NDI' && isActive && ndiStreamStatus
                    ? `NDI Stream Active for ${activeListName}: ${activeListNdiSourceName} (${ndiStreamStatus.width}x${ndiStreamStatus.height} @ ${ndiStreamStatus.frameRate} FPS${
                        ndiStreamStatus.alphaChannel ? ', Alpha ON' : ''
                      }) — Click to Stop ${activeListName} NDI`
                    : item.label === 'NDI Multi' && isActive && ndiStreamStatus
                    ? `NDI Multi Active — Broadcasting All Lists: ${
                        (ndiStreamStatus.activeSourceNames || []).join(' • ') ||
                        lists.map((l) => formatListNdiSourceName(l.name)).join(' • ')
                      } — Click to Stop NDI Multi`
                    : item.label === 'Fullscreen' && isActive
                    ? `Fullscreen Active for ${activeListName} (Click to Close ${activeListName} Fullscreen)`
                    : isActive
                    ? `${item.label} Active (Click to Toggle)`
                    : item.tooltip
                }
                className={`glass-btn glass-btn-subtle px-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 cursor-pointer ${
                  isNdiSingleActive
                    ? 'glass-btn-purple-active'
                    : isNdiMultiActive
                    ? 'glass-btn-amber-active'
                    : isActive
                    ? 'glass-btn-cyan-active'
                    : ''
                }`}
              >
                {isActive && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      isNdiSingleActive
                        ? 'bg-purple-200'
                        : isNdiMultiActive
                        ? 'bg-amber-200'
                        : 'bg-cyan-300'
                    }`}
                  />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Fullscreen Monitor Selector Dropdown (Independent per List Tab) */}
        <div
          title={`Select dedicated Fullscreen monitor for ${activeListName}`}
          className={`flex items-center gap-2 whitespace-nowrap pl-4 border-l shrink-0 ${
            isDark ? 'border-white/[0.08]' : 'border-slate-300'
          }`}
        >
          <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
            Fullscreen monitor ({activeListName})
          </span>
          <div className="relative">
            <select
              value={fullscreenMonitor}
              onChange={(e) => onChangeMonitor(e.target.value)}
              className="glass-input appearance-none rounded-full px-3.5 py-1 pr-7 text-xs focus:outline-hidden focus:border-cyan-400 cursor-pointer"
            >
              <option value="Auto" className={isDark ? 'bg-[#1c1c20] text-white' : ''}>
                {detectedMonitors.some((m) => !m.isPrimary)
                  ? 'Auto (External Monitor)'
                  : 'Auto (Primary Monitor)'}
              </option>
              {detectedMonitors.map((m) => {
                const displayName = m.name?.startsWith('Display') ? m.name : `Display ${m.displayIndex}`;
                const assignedOtherLists = lists
                  .filter(
                    (l) =>
                      l.id !== activeListId &&
                      String(selectedMonitorsByList[l.id]) === String(m.id)
                  )
                  .map((l) => l.name);
                const suffix =
                  assignedOtherLists.length > 0
                    ? ` [${assignedOtherLists.join(', ')}]`
                    : '';
                return (
                  <option key={String(m.id)} value={String(m.id)} className={isDark ? 'bg-[#1c1c20] text-white' : ''}>
                    {displayName} – {m.resolution}{m.isPrimary ? ' (Primary)' : ' (External)'}{suffix}
                  </option>
                );
              })}
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
          </div>
        </div>
      </div>

      {/* Tab Right-Click Context Menu (portaled to document.body so footer backdrop-filter never clips or offsets fixed positioning) */}
      {contextMenu && typeof document !== 'undefined' && createPortal((() => {
        const currentMenuList = lists.find((l) => l.id === contextMenu.listId);
        const otherMenuLists = lists.filter((l) => l.id !== contextMenu.listId);
        const canDeleteList = Boolean(onDeleteList) && lists.length > 1;
        return (
          <div
            ref={menuRef}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className={`glass-card fixed z-[9999] w-60 max-h-[calc(100vh-20px)] overflow-y-auto rounded-2xl py-1.5 text-xs select-none animate-in fade-in duration-100 ${
              isDark ? 'text-neutral-200' : 'text-slate-800'
            }`}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b flex items-center justify-between ${
              isDark ? 'text-neutral-400 border-white/[0.08]' : 'text-slate-500 border-slate-200'
            }`}>
              <span className="truncate">{contextMenu.listName}</span>
              {currentMenuList && (
                <span className="font-mono text-[10px]">
                  {currentMenuList.timerIds.length} cues
                </span>
              )}
            </div>

            {/* Tab & Cue List Color Picker */}
            {onSetListColor && (
              <div className={`px-3 py-2 border-b ${isDark ? 'border-[#1b2330]' : 'border-slate-200'}`}>
                <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${
                  isDark ? 'text-neutral-400' : 'text-slate-500'
                }`}>
                  <Palette className="w-3 h-3 text-cyan-500" />
                  <span>Cue List & Tab Color</span>
                </div>
                <div className="flex items-center flex-wrap gap-1.5">
                  {CUE_COLOR_SWATCHES.map((swatch) => {
                    const isSelected =
                      (!swatch.value && !currentMenuList?.color) ||
                      swatch.value === currentMenuList?.color;
                    return (
                      <button
                        key={swatch.label}
                        type="button"
                        title={swatch.label}
                        onClick={() => {
                          onSetListColor(contextMenu.listId, swatch.value);
                          setContextMenu(null);
                        }}
                        className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-cyan-400 border-white scale-110'
                            : isDark
                            ? 'border-neutral-700'
                            : 'border-slate-300'
                        }`}
                        style={{
                          backgroundColor: swatch.value || (isDark ? '#1a2232' : '#e2e8f0'),
                        }}
                      >
                        {!swatch.value && (
                          <span className="text-[9px] font-bold text-neutral-400">×</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Copy Cue List to Another List Tab */}
            {onCopyListCuesToList && otherMenuLists.length > 0 && (
              <div className={`py-1.5 border-b ${isDark ? 'border-[#1b2330]' : 'border-slate-200'}`}>
                <div className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-neutral-400' : 'text-slate-500'
                }`}>
                  <FolderInput className="w-3 h-3 text-cyan-500" />
                  <span>Copy Cue List to Tab</span>
                </div>

                <div className="px-3 mb-1.5">
                  <div className={`flex items-center p-0.5 rounded border text-[10px] ${
                    isDark ? 'bg-[#090c12] border-[#1e2736]' : 'bg-slate-100 border-slate-300'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setCopyMode('append')}
                      className={`flex-1 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                        copyMode === 'append'
                          ? 'bg-cyan-600 text-white'
                          : isDark
                          ? 'text-neutral-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Append
                    </button>
                    <button
                      type="button"
                      onClick={() => setCopyMode('replace')}
                      className={`flex-1 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                        copyMode === 'replace'
                          ? 'bg-amber-600 text-white'
                          : isDark
                          ? 'text-neutral-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Replace
                    </button>
                  </div>
                </div>

                <div className="max-h-32 overflow-y-auto">
                  {otherMenuLists.map((targetList) => (
                    <button
                      key={targetList.id}
                      type="button"
                      onClick={() => {
                        const count = onCopyListCuesToList(
                          contextMenu.listId,
                          targetList.id,
                          copyMode
                        );
                        setContextMenu(null);
                        setTabCopyFeedback(
                          `${copyMode === 'replace' ? 'Replaced' : 'Copied'} ${count} cue${
                            count === 1 ? '' : 's'
                          }: ${contextMenu.listName} → ${targetList.name}`
                        );
                        setTimeout(() => setTabCopyFeedback(null), 3000);
                      }}
                      className={`w-full text-left px-3 py-1 flex items-center justify-between gap-2 cursor-pointer ${
                        isDark
                          ? 'hover:bg-[#1b2434] hover:text-white text-neutral-300'
                          : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: targetList.color || '#06b6d4' }}
                        />
                        <span className="truncate">{targetList.name}</span>
                      </div>
                      <span className={`text-[10px] font-mono shrink-0 ${
                        isDark ? 'text-neutral-500' : 'text-slate-400'
                      }`}>
                        {targetList.timerIds.length} cues
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const list = lists.find(l => l.id === contextMenu.listId);
                if (list) handleStartInlineRename(list);
              }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                isDark ? 'hover:bg-[#1b2434] hover:text-white text-neutral-300' : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 text-neutral-400" />
              <span>Rename Tab</span>
            </button>

            {onOpenListManager && (
              <button
                type="button"
                onClick={() => {
                  onSelectList(contextMenu.listId);
                  onOpenListManager();
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                  isDark ? 'hover:bg-[#1b2434] hover:text-white text-neutral-300' : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                }`}
              >
                <FolderEdit className="w-3.5 h-3.5 text-cyan-400" />
                <span>Edit / Manage Tabs</span>
              </button>
            )}

            {onDuplicateList && (
              <button
                type="button"
                onClick={() => {
                  onDuplicateList(contextMenu.listId);
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                  isDark ? 'hover:bg-[#1b2434] hover:text-white text-neutral-300' : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                }`}
              >
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
                <span>Duplicate List</span>
              </button>
            )}

            {onSaveListAsTemplate && (
              <button
                type="button"
                onClick={() => {
                  onSaveListAsTemplate(contextMenu.listId);
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                  isDark ? 'hover:bg-[#1b2434] hover:text-cyan-300 text-neutral-300' : 'hover:bg-slate-100 hover:text-cyan-700 text-slate-700'
                }`}
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
                <span>Save Tab as Template...</span>
              </button>
            )}

            {onExportList && (
              <button
                type="button"
                onClick={() => {
                  onExportList(contextMenu.listId);
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                  isDark ? 'hover:bg-[#1b2434] hover:text-cyan-400 text-neutral-300' : 'hover:bg-slate-100 hover:text-cyan-700 text-slate-700'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-cyan-500" />
                <span>Export List (.json)</span>
              </button>
            )}

            {onMoveList && (
              <>
                <div className={`border-t my-1 ${isDark ? 'border-[#1b2330]' : 'border-slate-200'}`} />
                <button
                  type="button"
                  onClick={() => {
                    onMoveList(contextMenu.listId, 'left');
                    setContextMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                    isDark ? 'hover:bg-[#1b2434] hover:text-white text-neutral-300' : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Move Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMoveList(contextMenu.listId, 'right');
                    setContextMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                    isDark ? 'hover:bg-[#1b2434] hover:text-white text-neutral-300' : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Move Right</span>
                </button>
              </>
            )}

            {onDeleteList && (
              <>
                <div className={`border-t my-1 ${isDark ? 'border-[#1b2330]' : 'border-slate-200'}`} />
                <button
                  type="button"
                  disabled={!canDeleteList}
                  title={canDeleteList ? `Delete "${contextMenu.listName}"` : 'At least one list tab must remain'}
                  onClick={() => {
                    if (!canDeleteList) return;
                    onDeleteList(contextMenu.listId);
                    setContextMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                    canDeleteList
                      ? isDark
                        ? 'cursor-pointer hover:bg-red-950/60 text-red-400 hover:text-red-300'
                        : 'cursor-pointer hover:bg-red-50 text-red-600 hover:text-red-700'
                      : 'cursor-not-allowed opacity-40 text-neutral-500'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Tab</span>
                </button>
              </>
            )}
          </div>
        );
      })(), document.body)}
    </footer>
  );
};
