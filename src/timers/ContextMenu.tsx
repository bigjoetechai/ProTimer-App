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
  Trash2,
  Palette,
  FolderInput,
  X,
} from 'lucide-react';
import { TimerItem, TimerList } from '../types';
import { useTheme } from '../hooks';

export const CUE_COLOR_SWATCHES = [
  { label: 'Default (None)', value: '' },
  { label: 'Cyan', value: '#00d2ff' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Emerald', value: '#00c853' },
  { label: 'Amber', value: '#ffb300' },
  { label: 'Orange', value: '#ff6d00' },
  { label: 'Red', value: '#ff2a2a' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Pink', value: '#f50076' },
  { label: 'Brown', value: '#a04916' },
  { label: 'Ash', value: '#7c8b9e' },
];

interface ContextMenuProps {
  x: number;
  y: number;
  timer: TimerItem;
  lists?: TimerList[];
  activeListId?: string;
  onClose: () => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onChangeColor?: (colorTag?: string) => void;
  onCopyToList?: (targetListId: string) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  timer,
  lists = [],
  activeListId,
  onClose,
  onStart,
  onPause,
  onStop,
  onRestart,
  onEdit,
  onDuplicate,
  onDelete,
  onChangeColor,
  onCopyToList,
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

  const otherLists = lists.filter((l) => l.id !== activeListId);

  // Adjust position so it doesn't overflow viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, Math.max(12, window.innerHeight - 360));

  const itemHover = isDark ? 'hover:bg-[#1a2333]' : 'hover:bg-slate-100';
  const dividerBorder = isDark ? 'border-[#1b2434]' : 'border-slate-200';

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className={`fixed z-50 w-52 rounded-md shadow-2xl py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100 border ${
        isDark ? 'bg-[#0f141f] border-[#222e42] text-neutral-200' : 'bg-white border-slate-300 text-slate-800'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`px-3 py-1.5 text-[10px] font-semibold border-b flex items-center gap-1.5 truncate ${
        isDark ? 'text-neutral-400 border-[#1b2434]' : 'text-slate-500 border-slate-200'
      }`}>
        {timer.colorTag && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: timer.colorTag }}
          />
        )}
        <span className="truncate">{timer.name || 'Cue'}</span>
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

      {/* Cue Color Palette */}
      {onChangeColor && (
        <div className="px-3 py-1.5">
          <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
            isDark ? 'text-neutral-400' : 'text-slate-500'
          }`}>
            <Palette className="w-3 h-3 text-cyan-500" />
            <span>Cue Color</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CUE_COLOR_SWATCHES.map((swatch) => {
              const isSelected = (timer.colorTag || '') === swatch.value;
              if (!swatch.value) {
                return (
                  <button
                    key="none"
                    type="button"
                    title="Clear Cue Color"
                    onClick={() => {
                      onChangeColor(undefined);
                      onClose();
                    }}
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition-transform cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'border-white bg-neutral-800 text-neutral-300 scale-110'
                          : 'border-slate-900 bg-slate-200 text-slate-700 scale-110'
                        : isDark
                        ? 'border-neutral-600 bg-neutral-900 text-neutral-500 hover:border-neutral-400'
                        : 'border-slate-300 bg-slate-100 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                );
              }
              return (
                <button
                  key={swatch.value}
                  type="button"
                  title={`Color: ${swatch.label}`}
                  onClick={() => {
                    onChangeColor(swatch.value);
                    onClose();
                  }}
                  className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                    isSelected
                      ? 'border-white scale-115 ring-1 ring-cyan-400'
                      : 'border-black/20 hover:scale-110'
                  }`}
                  style={{ backgroundColor: swatch.value }}
                />
              );
            })}
          </div>
        </div>
      )}

      {onChangeColor && <div className={`border-t my-1 ${dividerBorder}`} />}

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

      {/* Copy Cue to Another List Tab */}
      {onCopyToList && otherLists.length > 0 && (
        <>
          <div className={`border-t my-1 ${dividerBorder}`} />
          <div className={`px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
            isDark ? 'text-neutral-400' : 'text-slate-500'
          }`}>
            <FolderInput className="w-3 h-3 text-cyan-500" />
            <span>Copy Cue to List Tab</span>
          </div>
          <div className="max-h-28 overflow-y-auto">
            {otherLists.map((targetList) => (
              <button
                key={targetList.id}
                type="button"
                onClick={() => {
                  onCopyToList(targetList.id);
                  onClose();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer ${itemHover} ${
                  isDark ? 'text-neutral-300 hover:text-cyan-300' : 'text-slate-700 hover:text-cyan-700'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: targetList.color || '#06b6d4' }}
                />
                <span className="truncate">{targetList.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

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
