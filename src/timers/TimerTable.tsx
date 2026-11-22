/**
 * Timer Management Table.
 * Features:
 * - Search bar with live filtering
 * - Column sorting (ID, Name, Start, Duration, End, Counter, Timer Type, Speed)
 * - Drag-and-drop row reordering
 * - Right-click context menu (Start, Pause, Stop, Restart, Edit, Duplicate, Delete)
 * - Double-click row to open configuration
 * - Inline rename & quick actions
 * - Click-to-add footer row
 * - Full Dark & Light theme responsive styling
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  X,
  Palette,
  FolderInput,
  Check
} from 'lucide-react';
import { TimerItem, TimerList, TimerStatus, EndAction, TimerType } from '../types';
import { TimerRow } from './TimerRow';
import { ContextMenu, CUE_COLOR_SWATCHES } from './ContextMenu';
import { useTheme } from '../hooks';

interface TimerTableProps {
  timers: TimerItem[];
  lists?: TimerList[];
  activeListId?: string;
  activeListColor?: string;
  activeTimerId: string | null;
  cuedTimerId: string | null;
  status: TimerStatus;
  currentSeconds: number;
  onCue: (id: string) => void;
  onStart: (id: string) => void;
  onPause: (id?: string) => void;
  onStop: (id?: string) => void;
  onRestart: (id?: string) => void;
  onEdit: (timer: TimerItem) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onChangeType?: (id: string, type: TimerType) => void;
  onChangeEndAction?: (id: string, endAction: EndAction) => void;
  onChangeTimerColor?: (id: string, colorTag?: string) => void;
  onCopyTimerToList?: (timerId: string, targetListId: string) => void;
  onChangeListColor?: (listId: string, color?: string) => void;
  onCopyListCuesToList?: (sourceListId: string, targetListId: string, mode?: 'append' | 'replace') => number;
  onReorder: (sourceIndex: number, destinationIndex: number) => void;
  onAddNew: () => void;
}

type SortField = 'order' | 'name' | 'startTime' | 'durationSeconds' | 'remainingSeconds' | 'type' | 'speed';
type SortOrder = 'asc' | 'desc';

export const TimerTable: React.FC<TimerTableProps> = ({
  timers,
  lists = [],
  activeListId,
  activeListColor,
  activeTimerId,
  cuedTimerId,
  status,
  currentSeconds,
  onCue,
  onStart,
  onPause,
  onStop,
  onRestart,
  onEdit,
  onDuplicate,
  onDelete,
  onRename,
  onChangeType,
  onChangeEndAction,
  onChangeTimerColor,
  onCopyTimerToList,
  onChangeListColor,
  onCopyListCuesToList,
  onReorder,
  onAddNew,
}) => {
  const { isDark } = useTheme();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sort state
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Cue List Color & Copy Cue List popover state
  const [isListColorOpen, setIsListColorOpen] = useState(false);
  const [isCopyListOpen, setIsCopyListOpen] = useState(false);
  const [copyMode, setCopyMode] = useState<'append' | 'replace'>('append');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const listColorRef = useRef<HTMLDivElement>(null);
  const copyListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (listColorRef.current && !listColorRef.current.contains(e.target as Node)) {
        setIsListColorOpen(false);
      }
      if (copyListRef.current && !copyListRef.current.contains(e.target as Node)) {
        setIsCopyListOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const otherLists = useMemo(
    () => lists.filter((l) => l.id !== activeListId),
    [lists, activeListId]
  );

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    timer: TimerItem | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    timer: null,
  });

  // Handle column header sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        // Reset to default list order
        setSortField(null);
        setSortOrder('asc');
      }
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter & Sort timers
  const displayTimers = useMemo(() => {
    let result = [...timers];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    // Sorting
    if (sortField) {
      result.sort((a, b) => {
        let valA: unknown = a[sortField];
        let valB: unknown = b[sortField];

        if (sortField === 'order') {
          valA = a.order;
          valB = b.order;
        }

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        const numA = Number(valA) || 0;
        const numB = Number(valB) || 0;
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      });
    }

    return result;
  }, [timers, searchQuery, sortField, sortOrder]);

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${index}`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      onReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  // Right-click context menu
  const handleContextMenu = (e: React.MouseEvent, timer: TimerItem) => {
    e.preventDefault();
    onCue(timer.id);
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      timer,
    });
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-2.5 h-2.5 opacity-40 shrink-0" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-2.5 h-2.5 text-cyan-500 shrink-0" />
    ) : (
      <ArrowDown className="w-2.5 h-2.5 text-cyan-500 shrink-0" />
    );
  };

  const headerBorder = isDark ? 'border-r border-[#1a2130] hover:bg-[#151c2b]' : 'border-r border-slate-200 hover:bg-slate-200';

  return (
    <div className={`flex-1 flex flex-col min-h-0 select-none relative transition-colors duration-150 ${
      isDark ? 'bg-[#080a0f]' : 'bg-slate-50'
    }`}>
      {/* Search and Table Control Bar */}
      <div
        style={
          activeListColor
            ? {
                borderBottomColor: `${activeListColor}99`,
                background: isDark
                  ? `linear-gradient(90deg, ${activeListColor}45 0%, ${activeListColor}1f 40%, #0c1017 85%)`
                  : `linear-gradient(90deg, ${activeListColor}38 0%, ${activeListColor}18 40%, #f1f5f9 85%)`,
              }
            : undefined
        }
        className={`h-8 border-b px-3 flex items-center justify-between gap-3 text-xs transition-colors ${
          isDark ? 'bg-[#0c1017] border-[#1b2333]' : 'bg-slate-100 border-slate-200'
        }`}
      >
        {/* Search Input */}
        <div className="relative flex items-center max-w-xs w-full">
          <Search className={`w-3.5 h-3.5 absolute left-2 pointer-events-none ${isDark ? 'text-neutral-500' : 'text-slate-400'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cues by name or type..."
            className={`w-full rounded pl-7 pr-6 py-0.5 text-xs transition-colors focus:outline-hidden focus:border-cyan-500 border ${
              isDark 
                ? 'bg-[#121722] border-[#222e42] text-white placeholder-neutral-500' 
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className={`absolute right-2 cursor-pointer ${isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Cue List Color & Copy Cue List To Another Tab Controls */}
        <div className="flex items-center gap-2.5">
          {copyNotice && (
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border animate-in fade-in ${
                isDark
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}
            >
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{copyNotice}</span>
            </span>
          )}

          {/* 1. Cue List & Tab Color Picker */}
          {onChangeListColor && activeListId && (
            <div className="relative" ref={listColorRef}>
              <button
                type="button"
                onClick={() => setIsListColorOpen((prev) => !prev)}
                title="Change color of this cue list & list tab"
                className={`px-2 py-0.5 rounded border text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#121722] hover:bg-[#192131] border-[#232f44] text-neutral-300 hover:text-white'
                    : 'bg-white hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900'
                }`}
              >
                {activeListColor ? (
                  <span
                    className="w-2.5 h-2.5 rounded-full ring-1 ring-white/40"
                    style={{ backgroundColor: activeListColor }}
                  />
                ) : (
                  <Palette className="w-3 h-3 text-cyan-500" />
                )}
                <span>Cue List Color</span>
              </button>

              {isListColorOpen && (
                <div
                  className={`absolute right-0 top-7 z-50 p-2.5 rounded-lg shadow-2xl border w-52 ${
                    isDark ? 'bg-[#10141d] border-[#263145] text-neutral-200' : 'bg-white border-slate-300 text-slate-800'
                  }`}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${
                    isDark ? 'text-neutral-400' : 'text-slate-500'
                  }`}>
                    Cue List & Tab Color
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {CUE_COLOR_SWATCHES.map((swatch) => {
                      const isSelected =
                        (!swatch.value && !activeListColor) || swatch.value === activeListColor;
                      return (
                        <button
                          key={swatch.label}
                          type="button"
                          title={swatch.label}
                          onClick={() => {
                            onChangeListColor(activeListId, swatch.value);
                            setIsListColorOpen(false);
                          }}
                          className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
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
            </div>
          )}

          {/* 2. Copy Cue List to Another List Tab */}
          {onCopyListCuesToList && activeListId && otherLists.length > 0 && (
            <div className="relative" ref={copyListRef}>
              <button
                type="button"
                onClick={() => setIsCopyListOpen((prev) => !prev)}
                title="Copy all cues in this cue list to another list tab"
                className={`px-2 py-0.5 rounded border text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#121722] hover:bg-[#192131] border-[#232f44] text-neutral-300 hover:text-white'
                    : 'bg-white hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900'
                }`}
              >
                <FolderInput className="w-3 h-3 text-cyan-500" />
                <span>Copy Cue List To...</span>
              </button>

              {isCopyListOpen && (
                <div
                  className={`absolute right-0 top-7 z-50 p-2.5 rounded-lg shadow-2xl border w-64 ${
                    isDark ? 'bg-[#10141d] border-[#263145] text-neutral-200' : 'bg-white border-slate-300 text-slate-800'
                  }`}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-neutral-400' : 'text-slate-500'
                  }`}>
                    Copy {timers.length} {timers.length === 1 ? 'Cue' : 'Cues'} to List Tab
                  </div>

                  {/* Mode Toggle: Append vs Replace */}
                  <div className={`flex items-center p-0.5 rounded border mb-2 text-[11px] ${
                    isDark ? 'bg-[#090c12] border-[#1e2736]' : 'bg-slate-100 border-slate-300'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setCopyMode('append')}
                      className={`flex-1 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                        copyMode === 'append'
                          ? isDark
                            ? 'bg-cyan-600 text-white'
                            : 'bg-cyan-600 text-white'
                          : isDark
                          ? 'text-neutral-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Append Cues
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
                      Replace Cues
                    </button>
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-0.5">
                    {otherLists.map((targetList) => (
                      <button
                        key={targetList.id}
                        type="button"
                        onClick={() => {
                          const count = onCopyListCuesToList(activeListId, targetList.id, copyMode);
                          setIsCopyListOpen(false);
                          setCopyNotice(
                            `${copyMode === 'replace' ? 'Replaced' : 'Copied'} ${count} cue${
                              count === 1 ? '' : 's'
                            } → ${targetList.name}`
                          );
                          setTimeout(() => setCopyNotice(null), 2800);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isDark
                            ? 'hover:bg-[#1b2434] text-neutral-200 hover:text-white'
                            : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: targetList.color || '#06b6d4' }}
                          />
                          <span className="truncate font-medium">{targetList.name}</span>
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
            </div>
          )}

          <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
            {displayTimers.length} {displayTimers.length === 1 ? 'cue' : 'cues'}
            {searchQuery && ` (filtered from ${timers.length})`}
          </span>
        </div>
      </div>

      {/* Main Table Scroll Area */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0">
        <table className="w-full text-left border-collapse">
          <thead
            style={
              activeListColor
                ? {
                    borderBottomColor: `${activeListColor}66`,
                  }
                : undefined
            }
            className={`sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wider border-b shadow-2xs ${
              isDark 
                ? 'bg-[#0f141f] text-neutral-300 border-[#1f2838]' 
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <tr>
              <th 
                onClick={() => handleSort('order')}
                className={`py-2.5 px-3 w-14 text-left whitespace-nowrap cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by ID"
              >
                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>ID</span>
                  {renderSortIndicator('order')}
                </div>
              </th>
              <th 
                onClick={() => handleSort('name')}
                className={`py-2.5 px-3.5 min-w-[180px] text-left whitespace-nowrap cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Name"
              >
                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>Name</span>
                  {renderSortIndicator('name')}
                </div>
              </th>
              <th 
                onClick={() => handleSort('startTime')}
                className={`py-2.5 px-3 w-24 text-left whitespace-nowrap cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Start Time"
              >
                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>Start</span>
                  {renderSortIndicator('startTime')}
                </div>
              </th>
              <th 
                onClick={() => handleSort('durationSeconds')}
                className={`py-2.5 px-3 w-28 text-left whitespace-nowrap cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Duration"
              >
                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>Duration</span>
                  {renderSortIndicator('durationSeconds')}
                </div>
              </th>
              <th className={`py-2.5 px-3 w-24 text-left whitespace-nowrap ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                End
              </th>
              <th 
                onClick={() => handleSort('remainingSeconds')}
                className={`py-2.5 px-3 w-28 text-left whitespace-nowrap cursor-pointer transition-colors ${headerBorder} ${
                  isDark ? 'bg-[#121926]/50' : 'bg-cyan-50/50'
                }`}
                title="Sort by Live Counter"
              >
                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>Counter</span>
                  {renderSortIndicator('remainingSeconds')}
                </div>
              </th>
              <th 
                onClick={() => handleSort('type')}
                className={`py-2.5 px-3 w-32 text-left whitespace-nowrap cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Timer Type"
              >
                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>Timer Type</span>
                  {renderSortIndicator('type')}
                </div>
              </th>
              <th className={`py-2.5 px-3 w-20 text-left whitespace-nowrap ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                Alert 1
              </th>
              <th className={`py-2.5 px-3 w-20 text-left whitespace-nowrap ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                Alert 2
              </th>
              <th className={`py-2.5 px-3 w-28 text-left whitespace-nowrap ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                End Action
              </th>
              <th 
                onClick={() => handleSort('speed')}
                className={`py-2.5 px-3 w-20 text-left whitespace-nowrap cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Speed"
              >
                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>Speed</span>
                  {renderSortIndicator('speed')}
                </div>
              </th>
              <th className="py-2.5 px-3 w-28 text-left whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {displayTimers.map((timer, index) => (
              <TimerRow
                key={timer.id}
                timer={timer}
                index={index}
                isActive={timer.id === activeTimerId}
                isCued={timer.id === cuedTimerId}
                status={status}
                currentSeconds={currentSeconds}
                listColor={activeListColor}
                onCue={() => onCue(timer.id)}
                onStart={() => onStart(timer.id)}
                onPause={() => onPause(timer.id)}
                onEdit={() => onEdit(timer)}
                onDuplicate={() => onDuplicate(timer.id)}
                onDelete={() => onDelete(timer.id)}
                onRename={(newName) => onRename(timer.id, newName)}
                onChangeType={onChangeType ? (type) => onChangeType(timer.id, type) : undefined}
                onChangeEndAction={onChangeEndAction ? (endAction) => onChangeEndAction(timer.id, endAction) : undefined}
                onChangeColor={onChangeTimerColor ? (colorTag) => onChangeTimerColor(timer.id, colorTag) : undefined}
                onContextMenu={(e) => handleContextMenu(e, timer)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </tbody>
        </table>

        {/* Empty state / Click to add timer footer */}
        <div
          onClick={onAddNew}
          className={`py-3.5 px-4 flex flex-col items-center justify-center cursor-pointer transition-colors group border-t border-dashed ${
            isDark 
              ? 'hover:bg-[#111722]/50 border-[#1a2233]' 
              : 'hover:bg-slate-100/70 border-slate-300'
          }`}
        >
          <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all mb-1.5 ${
            isDark 
              ? 'bg-[#0c1018] border-neutral-700/80 text-neutral-400 group-hover:border-cyan-500 group-hover:text-cyan-400 group-hover:scale-105' 
              : 'bg-white border-slate-300 text-slate-500 group-hover:border-cyan-600 group-hover:text-cyan-600 group-hover:scale-105 shadow-2xs'
          }`}>
            <Plus className="w-4 h-4" />
          </div>
          <span className={`text-xs font-medium transition-colors ${
            isDark ? 'text-neutral-300 group-hover:text-white' : 'text-slate-700 group-hover:text-slate-900'
          }`}>
            Click here to add a timer
          </span>
          <span className={`text-[11px] mt-0.5 ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>
            Default settings from Options &rarr; Preferences
          </span>
        </div>
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu.visible && contextMenu.timer && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          timer={contextMenu.timer}
          lists={lists}
          activeListId={activeListId}
          onClose={() => setContextMenu({ ...contextMenu, visible: false })}
          onStart={() => onStart(contextMenu.timer!.id)}
          onPause={() => onPause(contextMenu.timer!.id)}
          onStop={() => onStop(contextMenu.timer!.id)}
          onRestart={() => onRestart(contextMenu.timer!.id)}
          onEdit={() => onEdit(contextMenu.timer!)}
          onDuplicate={() => onDuplicate(contextMenu.timer!.id)}
          onDelete={() => onDelete(contextMenu.timer!.id)}
          onChangeColor={
            onChangeTimerColor
              ? (colorTag) => {
                  onChangeTimerColor(contextMenu.timer!.id, colorTag);
                  setContextMenu((prev) =>
                    prev.timer ? { ...prev, timer: { ...prev.timer, colorTag } } : prev
                  );
                }
              : undefined
          }
          onCopyToList={
            onCopyTimerToList
              ? (targetListId) => {
                  const targetList = lists.find((l) => l.id === targetListId);
                  onCopyTimerToList(contextMenu.timer!.id, targetListId);
                  if (targetList) {
                    setCopyNotice(`Copied "${contextMenu.timer!.name || 'Cue'}" → ${targetList.name}`);
                    setTimeout(() => setCopyNotice(null), 2500);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
