/**
 * Bottom Navigation & Output Toolbar with Full Multiple List Management & Context Actions.
 * Matches the reference screenshot with two clean production rows:
 * Row 1: Timer List Tabs (List 1, List 2, List 3, +, Manage) with live running indicators
 * Row 2: Output Toolbar (Presenter, Preview, Fullscreen, NDI, NDI Multi, Multi Preview, Multi FS, LAN Control, LAN Display) + Fullscreen Monitor Dropdown
 * Full Dark & Light theme responsive styling.
 */

import React, { useState, useRef, useEffect } from 'react';
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
  Wifi
} from 'lucide-react';
import { TimerList, DisplayTarget, DetectedMonitor } from '../types';
import { useTheme } from '../hooks';

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
  onOpenListManager?: () => void;
  getRunningTimerCount?: (id: string) => number;
  onOpenDisplay: (target: DisplayTarget) => void;
  onOpenLanModal?: () => void;
  fullscreenMonitor: string;
  onChangeMonitor: (monitor: string) => void;
  detectedMonitors?: DetectedMonitor[];
  isFullscreenActive?: boolean;
  onCloseFullscreen?: () => void;
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
  onOpenListManager,
  getRunningTimerCount,
  onOpenDisplay,
  onOpenLanModal,
  fullscreenMonitor,
  onChangeMonitor,
  detectedMonitors = [],
  isFullscreenActive = false,
  onCloseFullscreen,
}) => {
  const { isDark } = useTheme();

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    listId: string;
    listName: string;
  } | null>(null);

  // Inline rename state
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, list: TimerList) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.max(10, e.clientY - 170),
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
    <footer className={`border-t select-none text-xs relative z-40 transition-colors duration-150 ${
      isDark ? 'bg-[#0b0e14] border-[#1a2333] text-neutral-300' : 'bg-slate-50 border-slate-200 text-slate-700'
    }`}>
      {/* =========================================================================
          ROW 1: TIMER LIST TABS
          List 1 | List 2 | List 3 | + | [Manage Lists]
         ========================================================================= */}
      <div className={`h-8 px-2 flex items-center justify-between border-b transition-colors ${
        isDark ? 'border-[#141a26] bg-[#090b10]' : 'border-slate-200 bg-slate-100/80'
      }`}>
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {lists.map((list) => {
            const isActive = list.id === activeListId;
            const runningCount = getRunningTimerCount ? getRunningTimerCount(list.id) : 0;
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

            return (
              <button
                key={list.id}
                type="button"
                onClick={() => onSelectList(list.id)}
                onContextMenu={(e) => handleContextMenu(e, list)}
                onDoubleClick={() => handleStartInlineRename(list)}
                title={`${list.name} (Right-click for options, Double-click to rename)`}
                className={`group px-3 py-1 rounded-t text-xs font-semibold tracking-wide transition-all flex items-center gap-2 relative cursor-pointer ${
                  isActive
                    ? isDark 
                      ? 'bg-[#151c28] text-white border-b-2 border-cyan-400 shadow-xs' 
                      : 'bg-white text-slate-900 border-b-2 border-cyan-600 shadow-xs'
                    : isDark 
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-[#121620]' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
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
              </button>
            );
          })}

          {/* Quick Add List (+) */}
          <button
            type="button"
            onClick={onAddList}
            title="Add New List (+)"
            className={`p-1 px-2 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-[#151c28]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Manage Lists Button */}
        {onOpenListManager && (
          <button
            type="button"
            onClick={onOpenListManager}
            title="Open Lists Manager"
            className={`px-2 py-0.5 text-[11px] rounded flex items-center gap-1.5 transition-colors border border-transparent cursor-pointer ${
              isDark 
                ? 'text-neutral-400 hover:text-cyan-400 hover:bg-[#141a26] hover:border-[#1e2736]' 
                : 'text-slate-600 hover:text-cyan-700 hover:bg-slate-200 hover:border-slate-300'
            }`}
          >
            <FolderEdit className="w-3.5 h-3.5 text-cyan-500" />
            <span className="hidden sm:inline">Manage Lists</span>
          </button>
        )}
      </div>

      {/* =========================================================================
          ROW 2: OUTPUT TOOLBAR & MONITOR SELECTION
          Presenter | Preview | Fullscreen | NDI | NDI Multi | Multi Preview | Multi FS | LAN Control | LAN Display
          Fullscreen monitor: [ Auto v ]
         ========================================================================= */}
      <div className={`h-9 px-3 flex items-center justify-between gap-3 overflow-x-auto transition-colors ${
        isDark ? 'bg-[#0b0e14]' : 'bg-white'
      }`}>
        {/* Output Action Buttons */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {[
            { label: 'Presenter', target: 'presenter' as DisplayTarget, tooltip: 'Open Speaker Confidence Display' },
            { label: 'Preview', target: 'preview' as DisplayTarget, tooltip: 'Open Control Room Preview Window' },
            { label: 'Fullscreen', target: 'fullscreen' as DisplayTarget, tooltip: 'TIMER OUTPUT FULLSCREEN (Mode B): Send Live Output to Selected Monitor' },
            { label: 'NDI', target: 'ndi' as DisplayTarget, tooltip: 'NDI IP Video Stream' },
            { label: 'NDI Multi', target: 'ndi' as DisplayTarget, tooltip: 'Multi-Channel NDI Stream' },
            { label: 'Multi Preview', target: 'preview' as DisplayTarget, tooltip: 'Multiview Stage Preview' },
            { label: 'Multi FS', target: 'fullscreen' as DisplayTarget, tooltip: 'TIMER OUTPUT FULLSCREEN (Mode B): Multi-Display Output' },
            { label: 'LAN Control', target: 'lan_control' as DisplayTarget, tooltip: 'Local Network Web Remote Control' },
            { label: 'LAN Display', target: 'lan_display' as DisplayTarget, tooltip: 'Local Network Remote Stage Output' },
          ].map((item) => {
            const isFsButton = item.label === 'Fullscreen' || item.label === 'Multi FS';
            const isActive = isFsButton && isFullscreenActive;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onOpenDisplay(item.target)}
                title={isActive ? `${item.label} Active (Click to Switch Monitor or Toggle)` : item.tooltip}
                className={`px-2.5 py-1 border rounded text-[11px] font-medium transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? isDark 
                      ? 'bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border-cyan-400 ring-1 ring-cyan-400/50' 
                      : 'bg-cyan-100 hover:bg-cyan-200 text-cyan-900 border-cyan-500 ring-1 ring-cyan-500/50'
                    : isDark
                      ? 'bg-[#131924] hover:bg-[#1c2536] active:bg-[#232e42] border-[#232e42] hover:border-cyan-500/50 text-neutral-300 hover:text-white'
                      : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border-slate-300 hover:border-cyan-600/50 text-slate-700 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Dedicated LAN Pairing & QR Hub Button */}
          {onOpenLanModal && (
            <button
              type="button"
              onClick={onOpenLanModal}
              title="Open LAN Remote Pairing, QR Codes & IP Address Hub"
              className={`px-2.5 py-1 border rounded text-[11px] font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                isDark 
                  ? 'bg-[#131d2b] hover:bg-[#1a283c] active:bg-[#20324c] border-cyan-500/50 hover:border-cyan-400 text-cyan-300 hover:text-white' 
                  : 'bg-cyan-50 hover:bg-cyan-100 active:bg-cyan-200 border-cyan-300 text-cyan-800'
              }`}
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span>LAN Hub / QR</span>
            </button>
          )}

          {/* Quick Exit Fullscreen Button if Output is currently Active */}
          {isFullscreenActive && onCloseFullscreen && (
            <button
              type="button"
              onClick={onCloseFullscreen}
              title="Close Fullscreen Output Window"
              className="px-2 py-1 bg-red-950/60 hover:bg-red-900 border border-red-800/80 rounded text-[11px] font-medium text-red-300 hover:text-white transition-all shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Exit Output</span>
            </button>
          )}
        </div>

        {/* Fullscreen Monitor Selector Dropdown */}
        <div className={`flex items-center gap-2 whitespace-nowrap pl-4 border-l shrink-0 ${isDark ? 'border-[#1a2333]' : 'border-slate-200'}`}>
          <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Fullscreen monitor</span>
          <div className="relative">
            <select
              value={fullscreenMonitor}
              onChange={(e) => onChangeMonitor(e.target.value)}
              className={`appearance-none rounded px-3 py-1 pr-6 text-xs focus:outline-hidden focus:border-cyan-500 cursor-pointer shadow-xs border ${
                isDark 
                  ? 'bg-[#121722] hover:bg-[#182030] border-[#232e42] text-white' 
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
              }`}
            >
              <option value="Auto">Auto (Primary Monitor)</option>
              {detectedMonitors.map((m) => {
                const displayName = m.name?.startsWith('Display') ? m.name : `Display ${m.displayIndex}`;
                return (
                  <option key={String(m.id)} value={String(m.id)}>
                    {displayName} – {m.resolution}{m.isPrimary ? ' (Primary)' : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
          </div>
        </div>
      </div>

      {/* Tab Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className={`fixed z-50 w-48 rounded-lg shadow-2xl py-1 text-xs animate-in fade-in duration-100 border ${
            isDark ? 'bg-[#10141d] border-[#222c3d] text-neutral-200' : 'bg-white border-slate-300 text-slate-800'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b ${
            isDark ? 'text-neutral-400 border-[#1b2330]' : 'text-slate-500 border-slate-200'
          }`}>
            {contextMenu.listName}
          </div>

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
            <span>Rename List</span>
          </button>

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

          {onDeleteList && lists.length > 1 && (
            <>
              <div className={`border-t my-1 ${isDark ? 'border-[#1b2330]' : 'border-slate-200'}`} />
              <button
                type="button"
                onClick={() => {
                  onDeleteList(contextMenu.listId);
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                  isDark ? 'hover:bg-red-950/60 text-red-400 hover:text-red-300' : 'hover:bg-red-50 text-red-600 hover:text-red-700'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete List</span>
              </button>
            </>
          )}
        </div>
      )}
    </footer>
  );
};
