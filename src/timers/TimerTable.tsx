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

import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  X
} from 'lucide-react';
import { TimerItem, TimerStatus, EndAction, TimerType } from '../types';
import { TimerRow } from './TimerRow';
import { ContextMenu } from './ContextMenu';
import { useTheme } from '../hooks';

interface TimerTableProps {
  timers: TimerItem[];
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
  onReorder: (sourceIndex: number, destinationIndex: number) => void;
  onAddNew: () => void;
}

type SortField = 'order' | 'name' | 'startTime' | 'durationSeconds' | 'remainingSeconds' | 'type' | 'speed';
type SortOrder = 'asc' | 'desc';

export const TimerTable: React.FC<TimerTableProps> = ({
  timers,
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
      return <ArrowUpDown className="w-2.5 h-2.5 opacity-40 ml-1 inline" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-2.5 h-2.5 text-cyan-500 ml-1 inline" />
    ) : (
      <ArrowDown className="w-2.5 h-2.5 text-cyan-500 ml-1 inline" />
    );
  };

  const headerBorder = isDark ? 'border-r border-[#1a2130] hover:bg-[#151c2b]' : 'border-r border-slate-200 hover:bg-slate-200';

  return (
    <div className={`flex-1 flex flex-col min-h-0 select-none relative transition-colors duration-150 ${
      isDark ? 'bg-[#080a0f]' : 'bg-slate-50'
    }`}>
      {/* Search and Table Control Bar */}
      <div className={`h-8 border-b px-3 flex items-center justify-between gap-3 text-xs transition-colors ${
        isDark ? 'bg-[#0c1017] border-[#1b2333]' : 'bg-slate-100 border-slate-200'
      }`}>
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

        {/* Quick Table Info & Add Cue Button */}
        <div className="flex items-center gap-3">
          <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
            {displayTimers.length} {displayTimers.length === 1 ? 'cue' : 'cues'}
            {searchQuery && ` (filtered from ${timers.length})`}
          </span>

          <button
            type="button"
            onClick={onAddNew}
            className="flex items-center gap-1 px-2.5 py-0.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold transition-colors shadow-xs active:scale-95 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Add Timer</span>
          </button>
        </div>
      </div>

      {/* Main Table Scroll Area */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0">
        <table className="w-full text-left border-collapse">
          <thead className={`sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wider border-b shadow-2xs ${
            isDark 
              ? 'bg-[#0f141f] text-neutral-300 border-[#1f2838]' 
              : 'bg-slate-100 text-slate-700 border-slate-200'
          }`}>
            <tr>
              <th 
                onClick={() => handleSort('order')}
                className={`py-2.5 px-3 w-14 text-center cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by ID"
              >
                ID {renderSortIndicator('order')}
              </th>
              <th 
                onClick={() => handleSort('name')}
                className={`py-2.5 px-3.5 min-w-[180px] cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Name"
              >
                Name {renderSortIndicator('name')}
              </th>
              <th 
                onClick={() => handleSort('startTime')}
                className={`py-2.5 px-3 w-24 cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Start Time"
              >
                Start {renderSortIndicator('startTime')}
              </th>
              <th 
                onClick={() => handleSort('durationSeconds')}
                className={`py-2.5 px-3 w-24 cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Duration"
              >
                Duration {renderSortIndicator('durationSeconds')}
              </th>
              <th className={`py-2.5 px-3 w-24 ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                End
              </th>
              <th 
                onClick={() => handleSort('remainingSeconds')}
                className={`py-2.5 px-3 w-28 cursor-pointer transition-colors ${headerBorder} ${
                  isDark ? 'bg-[#121926]/50' : 'bg-cyan-50/50'
                }`}
                title="Sort by Live Counter"
              >
                Counter {renderSortIndicator('remainingSeconds')}
              </th>
              <th 
                onClick={() => handleSort('type')}
                className={`py-2.5 px-3 w-32 cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Timer Type"
              >
                Timer Type {renderSortIndicator('type')}
              </th>
              <th className={`py-2.5 px-3 w-20 ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                Alert 1
              </th>
              <th className={`py-2.5 px-3 w-20 ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                Alert 2
              </th>
              <th className={`py-2.5 px-3 w-28 ${isDark ? 'border-r border-[#1a2130]' : 'border-r border-slate-200'}`}>
                End Action
              </th>
              <th 
                onClick={() => handleSort('speed')}
                className={`py-2.5 px-3 w-20 cursor-pointer transition-colors ${headerBorder}`}
                title="Sort by Speed"
              >
                Speed {renderSortIndicator('speed')}
              </th>
              <th className="py-2.5 px-2 w-28 text-right">
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
                onCue={() => onCue(timer.id)}
                onStart={() => onStart(timer.id)}
                onPause={() => onPause(timer.id)}
                onEdit={() => onEdit(timer)}
                onDuplicate={() => onDuplicate(timer.id)}
                onDelete={() => onDelete(timer.id)}
                onRename={(newName) => onRename(timer.id, newName)}
                onChangeType={onChangeType ? (type) => onChangeType(timer.id, type) : undefined}
                onChangeEndAction={onChangeEndAction ? (endAction) => onChangeEndAction(timer.id, endAction) : undefined}
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
          onClose={() => setContextMenu({ ...contextMenu, visible: false })}
          onStart={() => onStart(contextMenu.timer!.id)}
          onPause={() => onPause(contextMenu.timer!.id)}
          onStop={() => onStop(contextMenu.timer!.id)}
          onRestart={() => onRestart(contextMenu.timer!.id)}
          onEdit={() => onEdit(contextMenu.timer!)}
          onDuplicate={() => onDuplicate(contextMenu.timer!.id)}
          onDelete={() => onDelete(contextMenu.timer!.id)}
        />
      )}
    </div>
  );
};
