/**
 * Context Menu for Timer Table right-click actions.
 * Actions: Start, Pause, Stop, Restart, Edit, Duplicate, Delete
 * Supports Light and Dark themes.
 */

import React, { useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Edit3, 
  Copy, 
  Trash2 
} from 'lucide-react';
import { TimerItem } from '../types';
import { useTheme } from '../hooks';

interface ContextMenuProps {
  x: number;
  y: number;
  timer: TimerItem;
  onClose: () => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  timer,
  onClose,
  onStart,
  onPause,
  onStop,
  onRestart,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const { isDark } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position so it doesn't overflow viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 260);

  const itemHover = isDark ? 'hover:bg-[#1a2333]' : 'hover:bg-slate-100';
  const dividerBorder = isDark ? 'border-[#1b2434]' : 'border-slate-200';

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className={`fixed z-50 w-48 rounded-md shadow-2xl py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100 border ${
        isDark ? 'bg-[#0f141f] border-[#222e42] text-neutral-200' : 'bg-white border-slate-300 text-slate-800'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`px-3 py-1.5 text-[10px] font-semibold border-b truncate ${
        isDark ? 'text-neutral-400 border-[#1b2434]' : 'text-slate-500 border-slate-200'
      }`}>
        {timer.name}
      </div>

      {/* Start */}
      <button
        type="button"
        onClick={() => {
          onStart();
          onClose();
        }}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${itemHover} ${
          isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'
        }`}
      >
        <Play className="w-3.5 h-3.5 fill-current" />
        <span>Start</span>
      </button>

      {/* Pause */}
      <button
        type="button"
        onClick={() => {
          onPause();
          onClose();
        }}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${itemHover} ${
          isDark ? 'text-amber-400 hover:text-amber-300' : 'text-amber-600 hover:text-amber-700'
        }`}
      >
        <Pause className="w-3.5 h-3.5 fill-current" />
        <span>Pause</span>
      </button>

      {/* Stop */}
      <button
        type="button"
        onClick={() => {
          onStop();
          onClose();
        }}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${itemHover} ${
          isDark ? 'text-neutral-300 hover:text-white' : 'text-slate-700 hover:text-slate-900'
        }`}
      >
        <Square className="w-3.5 h-3.5 fill-current" />
        <span>Stop</span>
      </button>

      {/* Restart */}
      <button
        type="button"
        onClick={() => {
          onRestart();
          onClose();
        }}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${itemHover} ${
          isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'
        }`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Restart</span>
      </button>

      <div className={`border-t my-1 ${dividerBorder}`} />

      {/* Edit */}
      <button
        type="button"
        onClick={() => {
          onEdit();
          onClose();
        }}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${itemHover} ${
          isDark ? 'text-neutral-200 hover:text-white' : 'text-slate-700 hover:text-slate-900'
        }`}
      >
        <Edit3 className="w-3.5 h-3.5 text-cyan-500" />
        <span>Edit Settings...</span>
      </button>

      {/* Duplicate */}
      <button
        type="button"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${itemHover} ${
          isDark ? 'text-neutral-200 hover:text-white' : 'text-slate-700 hover:text-slate-900'
        }`}
      >
        <Copy className="w-3.5 h-3.5 text-blue-500" />
        <span>Duplicate Timer</span>
      </button>

      <div className={`border-t my-1 ${dividerBorder}`} />

      {/* Delete */}
      <button
        type="button"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${
          isDark ? 'hover:bg-red-950/40 text-red-400 hover:text-red-300' : 'hover:bg-red-50 text-red-600 hover:text-red-700'
        }`}
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Delete Timer</span>
      </button>
    </div>
  );
};
