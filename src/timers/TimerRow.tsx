/**
 * Timer Row component in the cue schedule table.
 * Supports:
 * - Drag and Drop reordering
 * - Double-click to open configuration modal
 * - Right-click context menu
 * - Inline rename affordance
 * - Quick action buttons (Start, Pause, Duplicate, Edit, Delete)
 * - Full Dark & Light theme responsive styling
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Trash2, 
  Edit2, 
  Copy, 
  GripVertical, 
  ChevronRight,
  Check,
  X,
  Palette
} from 'lucide-react';
import { TimerItem, TimerStatus, EndAction, TimerType } from '../types';
import { formatSeconds, calculateEndTime } from '../utilities/timeFormatters';
import { useTheme } from '../hooks';
import { computeActiveAlert, timerManagerService } from '../services/timerManager';
import { CUE_COLOR_SWATCHES } from './ContextMenu';

interface TimerRowProps {
  timer: TimerItem;
  index: number;
  isActive: boolean;
  isCued: boolean;
  status: TimerStatus;
  currentSeconds: number;
  isDragging?: boolean;
  listColor?: string;
  onCue: () => void;
  onStart: () => void;
  onPause: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  onChangeType?: (type: TimerType) => void;
  onChangeEndAction?: (endAction: EndAction) => void;
  onChangeColor?: (colorTag?: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}

export const TimerRow: React.FC<TimerRowProps> = ({
  timer,
  index,
  isActive,
  isCued,
  status,
  currentSeconds,
  listColor,
  onCue,
  onStart,
  onPause,
  onEdit,
  onDuplicate,
  onDelete,
  onRename,
  onChangeType,
  onChangeEndAction,
  onChangeColor,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const { isDark } = useTheme();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(timer.name);
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isColorMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colorMenuRef.current && !colorMenuRef.current.contains(e.target as Node)) {
        setIsColorMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isColorMenuOpen]);

  const isRunning = isActive && status === 'running';
  const isPaused = isActive && status === 'paused';
  const isOvertime = isActive && status === 'overtime';

  // Live counter value if active, otherwise remaining
  const counterVal = isActive ? currentSeconds : timer.remainingSeconds;

  // Active alert color computation
  const alertInfo = computeActiveAlert(timer, counterVal, isActive ? status : timer.status);
  const rowAlertColor = alertInfo.color;
  const rowFlash = alertInfo.flash;
  const rowOnOff = alertInfo.onOff;
  const rowAlertLevel = alertInfo.level;

  // Effective cue color: cue's own colorTag or fallback to listColor for subtle left accent
  const cueColor = timer.colorTag;

  // Background and borders based on state:
  // - Active cue: Reddish highlight
  // - Cued (Next cue): Cyan highlight with NEXT badge
  // - Custom colorTag cue: Tinted with timer.colorTag
  let rowStyle = isDark ? 'bg-[#0b0e14] hover:bg-[#121824] text-neutral-300' : 'bg-white hover:bg-slate-50 text-slate-800';
  if (isActive) {
    if (rowAlertLevel === 'overtime') {
      rowStyle = isDark
        ? 'bg-red-950/75 text-red-100 border-l-4 border-l-red-600 font-bold ring-1 ring-red-500/50 shadow-sm'
        : 'bg-red-100 text-red-950 border-l-4 border-l-red-700 font-bold ring-1 ring-red-500/40 shadow-xs';
    } else if (rowAlertLevel === 'alert1') {
      rowStyle = isDark 
        ? 'bg-red-950/55 text-red-100 border-l-4 border-l-amber-500 font-semibold ring-1 ring-red-500/45 shadow-sm'
        : 'bg-red-50 text-red-900 border-l-4 border-l-amber-600 font-semibold ring-1 ring-red-500/30 shadow-xs';
    } else {
      rowStyle = isDark 
        ? 'bg-red-950/55 text-red-100 border-l-4 border-l-red-500 font-semibold ring-1 ring-red-500/45 shadow-sm'
        : 'bg-red-50 text-red-900 border-l-4 border-l-red-600 font-semibold ring-1 ring-red-500/30 shadow-xs';
    }
  } else if (isCued) {
    rowStyle = isDark
      ? 'bg-[#10243e] text-cyan-100 border-l-4 border-l-cyan-400 font-medium ring-1 ring-cyan-500/40 shadow-sm'
      : 'bg-cyan-50 text-cyan-900 border-l-4 border-l-cyan-600 font-semibold ring-1 ring-cyan-500/30 shadow-xs';
  }

  const customRowInlineStyle: React.CSSProperties | undefined =
    !isActive && !isCued && cueColor
      ? {
          backgroundColor: isDark ? `${cueColor}2b` : `${cueColor}22`,
          borderLeft: `4px solid ${cueColor}`,
        }
      : !isActive && !isCued && listColor
      ? {
          backgroundColor: isDark ? `${listColor}14` : `${listColor}10`,
          borderLeft: `3px solid ${listColor}b3`,
        }
      : undefined;

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameValue.trim() && nameValue.trim() !== timer.name) {
      onRename(nameValue.trim());
    }
    setIsEditingName(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const isSpacer = timer.type === 'spacer';
  const isEmptyCue = timer.type === 'empty';

  const cellBorder = isDark ? 'border-r border-[#161c28]' : 'border-r border-slate-200';
  const rowBottomBorder = isDark ? 'border-b border-[#18202d]' : 'border-b border-slate-200';
  const secondaryText = isDark ? 'text-neutral-400' : 'text-slate-500';
  const actionHover = isDark ? 'hover:bg-[#1a2333]' : 'hover:bg-slate-200';

  if (isSpacer) {
    return (
      <tr
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={(e) => onDrop(e, index)}
        onContextMenu={onContextMenu}
        className={`${rowBottomBorder} transition-colors text-xs select-none group h-8 ${
          isDark ? 'bg-[#07090d] hover:bg-[#0d1118]' : 'bg-slate-100/70 hover:bg-slate-200/60'
        }`}
      >
        <td className={`py-1.5 px-3 w-14 text-left ${cellBorder}`}>
          <div className="flex items-center justify-start">
            <GripVertical
              className={`w-3 h-3 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                isDark ? 'text-neutral-600 hover:text-neutral-400' : 'text-slate-400 hover:text-slate-600'
              }`}
            />
          </div>
        </td>
        <td colSpan={10} className={`py-1.5 px-3 ${cellBorder}`} />
        <td className="py-1.5 px-3 text-left">
          <div
            className="flex items-center justify-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onDuplicate}
              className={`p-1 rounded text-blue-500 transition-colors cursor-pointer ${actionHover}`}
              title="Duplicate spacer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className={`p-1 rounded transition-colors cursor-pointer ${
                isDark ? 'hover:bg-red-950/40 text-neutral-500 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-600'
              }`}
              title="Delete spacer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      draggable={!isEditingName}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onClick={onCue}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
      style={customRowInlineStyle}
      className={`${rowBottomBorder} cursor-pointer transition-colors text-xs select-none group ${rowStyle}`}
    >
      {/* 1. ID / Drag Handle */}
      <td className={`py-2 px-3 font-mono ${secondaryText} w-14 text-left ${cellBorder}`}>
        <div className="flex items-center justify-start gap-1">
          <GripVertical className={`w-3 h-3 cursor-grab active:cursor-grabbing shrink-0 ${
            isEmptyCue ? 'opacity-0 group-hover:opacity-100 transition-opacity ' : ''
          }${
            isDark ? 'text-neutral-600 group-hover:text-neutral-400' : 'text-slate-400 group-hover:text-slate-600'
          }`} />
          {isCued && !isEmptyCue && (
            <span title="Next Cued"><ChevronRight className="w-3 h-3 text-cyan-500 shrink-0" /></span>
          )}
          <span className={`tabular-nums ${isActive ? (isDark ? 'text-red-200 font-bold' : 'text-red-900 font-bold') : ''}`}>
            {isEmptyCue && !timer.name && timer.durationSeconds === 0 ? '' : index + 1}
          </span>
        </div>
      </td>

      {/* 2. Name (Inline Editable or Double-Click) */}
      <td className={`py-2 px-3 font-medium max-w-[220px] ${cellBorder}`}>
        {isEditingName ? (
          <form onSubmit={handleNameSubmit} className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              autoFocus
              className={`px-1.5 py-0.5 border border-cyan-500 rounded text-xs w-full focus:outline-hidden ${
                isDark ? 'bg-[#080b10] text-white' : 'bg-white text-slate-900'
              }`}
            />
            <button type="submit" className="p-0.5 text-cyan-500 hover:text-cyan-400 cursor-pointer">
              <Check className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => setIsEditingName(false)} className={`p-0.5 cursor-pointer ${isDark ? 'text-neutral-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}>
              <X className="w-3 h-3" />
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between group/name min-h-[20px]">
            <div className="flex items-center gap-1.5 min-w-0">
              {cueColor && (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20"
                  style={{ backgroundColor: cueColor }}
                  title={`Cue Color: ${cueColor}`}
                />
              )}
              <span className={`truncate ${
                isActive 
                  ? (isDark ? 'text-red-100 font-bold' : 'text-red-900 font-bold') 
                  : (isDark ? 'text-white' : 'text-slate-900')
              }`} title={timer.name}>
                {timer.name}
              </span>
              {isActive && (
                <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-black bg-red-600 text-white tracking-widest shrink-0 shadow-xs">
                  ACTIVE
                </span>
              )}
              {isCued && !isActive && !isEmptyCue && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider shrink-0 border ${
                  isDark ? 'bg-cyan-950 text-cyan-300 border-cyan-700/60' : 'bg-cyan-100 text-cyan-800 border-cyan-300'
                }`}>
                  NEXT
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNameValue(timer.name);
                setIsEditingName(true);
              }}
              title="Quick Rename"
              className={`opacity-0 group-hover/name:opacity-100 p-0.5 ml-1 transition-opacity cursor-pointer ${
                isDark ? 'text-neutral-500 hover:text-red-300' : 'text-slate-400 hover:text-red-600'
              }`}
            >
              <Edit2 className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </td>

      {/* 3. Start Time */}
      <td className={`py-2 px-3 font-mono ${cellBorder} tabular-nums whitespace-nowrap ${
        isActive 
          ? (rowAlertLevel === 'alert1'
              ? (isDark ? 'text-amber-200 font-semibold' : 'text-amber-800 font-semibold')
              : (isDark ? 'text-red-200 font-semibold' : 'text-red-800 font-semibold'))
          : secondaryText
      }`}>
        {isEmptyCue ? (timer.startTime || '') : (timer.startTime || '--:--:--')}
      </td>

      {/* 4. Duration */}
      <td className={`py-2 px-3 font-mono ${cellBorder} tabular-nums whitespace-nowrap ${
        isActive ? (isDark ? 'text-red-100 font-bold' : 'text-red-950 font-bold') : (isDark ? 'text-neutral-200' : 'text-slate-800')
      }`}>
        {isEmptyCue && timer.durationSeconds === 0 ? '' : formatSeconds(timer.durationSeconds, true)}
      </td>

      {/* 5. End Time */}
      <td className={`py-2 px-3 font-mono ${cellBorder} tabular-nums whitespace-nowrap ${
        isActive 
          ? (rowAlertLevel === 'alert1'
              ? (isDark ? 'text-amber-200 font-bold' : 'text-amber-800 font-bold')
              : (isDark ? 'text-red-200 font-bold' : 'text-red-800 font-bold'))
          : secondaryText
      }`}>
        {isEmptyCue && !timer.endTime && timer.durationSeconds === 0
          ? ''
          : (timer.endTime || calculateEndTime(timer.durationSeconds))}
      </td>

      {/* 6. Counter */}
      <td className={`py-2 px-3 font-mono font-bold text-sm ${cellBorder} tabular-nums whitespace-nowrap ${
        isEmptyCue && !isActive && timer.durationSeconds === 0
          ? ''
          : isActive 
          ? (rowAlertLevel === 'alert1'
              ? (isDark ? 'bg-amber-950/60' : 'bg-amber-100/60')
              : (isDark ? 'bg-red-950/60' : 'bg-red-100/60'))
          : (isDark ? 'bg-black/20' : 'bg-slate-100/60')
      }`}>
        {isEmptyCue && !isActive && timer.durationSeconds === 0 ? (
          ''
        ) : (
          <span
            className={
              isActive
                ? `${
                    isOvertime || rowOnOff
                      ? 'animate-overtime-blink font-black'
                      : rowFlash
                      ? 'animate-pulse font-black'
                      : 'font-black'
                  } ${
                    !rowAlertColor ? (isPaused ? 'text-amber-400' : isDark ? 'text-red-300' : 'text-red-700') : ''
                  }`
                : (isDark ? 'text-neutral-100' : 'text-slate-900')
            }
            style={isActive && rowAlertColor ? { color: rowAlertColor } : undefined}
          >
            {formatSeconds(counterVal, true, isOvertime || counterVal < 0)}
          </span>
        )}
      </td>

      {/* 7. Timer Type */}
      <td
        className={`py-1.5 px-2.5 ${cellBorder} whitespace-nowrap`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <select
          value={timer.type === 'count_down' ? 'countdown' : (timer.type || 'countdown')}
          onChange={(e) => {
            const newType = e.target.value as TimerType;
            if (onChangeType) {
              onChangeType(newType);
            } else {
              timerManagerService.updateTimer(timer.id, { type: newType });
            }
          }}
          className={`w-full px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer focus:outline-hidden focus:border-cyan-500 ${
            isEmptyCue
              ? isDark
                ? 'bg-transparent border-transparent group-hover:bg-[#141b27] group-hover:border-[#222e42] text-cyan-300'
                : 'bg-transparent border-transparent group-hover:bg-slate-100 group-hover:border-slate-300 text-cyan-800'
              : isDark
              ? 'bg-[#141b27] hover:bg-[#1a2436] border-[#222e42] text-cyan-300'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-cyan-800'
          }`}
        >
          {isEmptyCue && <option value="empty"></option>}
          <option value="countdown">Countdown</option>
          <option value="count_up">Count Up</option>
          <option value="stopwatch">Stopwatch</option>
          <option value="digital_clock">Digital Clock</option>
          <option value="meeting_timer">Meeting Timer</option>
        </select>
      </td>

      {/* 8. Alert 1 */}
      <td className={`py-2 px-3 font-mono ${cellBorder} tabular-nums whitespace-nowrap`}>
        {timer.alert1 ? (
          <span
            className="px-1.5 py-0.5 rounded text-[11px] font-medium"
            style={{ backgroundColor: `${timer.alert1.color}25`, color: timer.alert1.color }}
          >
            {formatSeconds(timer.alert1.timeSeconds, false)}
          </span>
        ) : (
          <span className={isDark ? 'text-neutral-600' : 'text-slate-400'}>{isEmptyCue ? '' : '-'}</span>
        )}
      </td>

      {/* 9. Alert 2 */}
      <td className={`py-2 px-3 font-mono ${cellBorder} tabular-nums whitespace-nowrap`}>
        {timer.alert2 ? (
          <span
            className="px-1.5 py-0.5 rounded text-[11px] font-medium"
            style={{ backgroundColor: `${timer.alert2.color}25`, color: timer.alert2.color }}
          >
            {formatSeconds(timer.alert2.timeSeconds, false)}
          </span>
        ) : (
          <span className={isDark ? 'text-neutral-600' : 'text-slate-400'}>{isEmptyCue ? '' : '-'}</span>
        )}
      </td>

      {/* 10. End Action */}
      <td
        className={`py-1.5 px-2.5 ${cellBorder} whitespace-nowrap`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <select
          value={isEmptyCue && (!timer.endAction || timer.endAction === 'none') ? 'none' : (timer.endAction || 'count_up')}
          onChange={(e) => {
            const newAction = e.target.value as EndAction;
            if (onChangeEndAction) {
              onChangeEndAction(newAction);
            } else {
              timerManagerService.updateTimer(timer.id, { endAction: newAction });
            }
          }}
          className={`w-full px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer focus:outline-hidden focus:border-cyan-500 ${
            isEmptyCue && (!timer.endAction || timer.endAction === 'none')
              ? isDark
                ? 'bg-transparent border-transparent group-hover:bg-[#111622] group-hover:border-[#222e42] text-neutral-200'
                : 'bg-transparent border-transparent group-hover:bg-slate-50 group-hover:border-slate-300 text-slate-800'
              : isDark
              ? 'bg-[#111622] hover:bg-[#182032] border-[#222e42] text-neutral-200'
              : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
          }`}
        >
          {isEmptyCue && (!timer.endAction || timer.endAction === 'none') && (
            <option value="none"></option>
          )}
          <option value="count_up">Overtime</option>
          <option value="stop">Stop</option>
          <option value="next_timer">Next Timer</option>
          <option value="blackout">Blackout</option>
          <option value="loop">Loop</option>
          {(!isEmptyCue || (timer.endAction && timer.endAction !== 'none')) && (
            <option value="none">None</option>
          )}
        </select>
      </td>

      {/* 11. Speed */}
      <td className={`py-2 px-3 font-mono ${cellBorder} tabular-nums whitespace-nowrap ${
        isDark ? 'text-neutral-300' : 'text-slate-700'
      }`}>
        {isEmptyCue && !timer.speed ? '' : `${timer.speed || 100}%`}
      </td>

      {/* Actions */}
      <td className="py-2 px-3 text-left relative">
        <div
          className={`flex items-center justify-start gap-1 ${
            isEmptyCue ? 'opacity-0' : 'opacity-70'
          } group-hover:opacity-100 transition-opacity`}
          onClick={(e) => e.stopPropagation()}
        >
          {isRunning ? (
            <button
              type="button"
              onClick={onPause}
              className={`p-1 rounded text-amber-500 transition-colors cursor-pointer ${actionHover}`}
              title="Pause timer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className={`p-1 rounded text-emerald-500 transition-colors cursor-pointer ${actionHover}`}
              title="Start timer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          )}

          {onChangeColor && (
            <div className="relative" ref={colorMenuRef}>
              <button
                type="button"
                onClick={() => setIsColorMenuOpen((prev) => !prev)}
                className={`p-1 rounded transition-colors cursor-pointer ${actionHover}`}
                title="Change cue color"
              >
                {cueColor ? (
                  <span
                    className="block w-3.5 h-3.5 rounded-full ring-1 ring-white/40"
                    style={{ backgroundColor: cueColor }}
                  />
                ) : (
                  <Palette className="w-3.5 h-3.5 text-purple-400" />
                )}
              </button>
              {isColorMenuOpen && (
                <div
                  className={`absolute right-0 top-7 z-50 p-2 rounded-lg shadow-2xl border flex items-center gap-1.5 ${
                    isDark ? 'bg-[#10141d] border-[#263145]' : 'bg-white border-slate-300'
                  }`}
                >
                  {CUE_COLOR_SWATCHES.map((swatch) => {
                    const isSelected = (!swatch.value && !cueColor) || swatch.value === cueColor;
                    return (
                      <button
                        key={swatch.label}
                        type="button"
                        title={swatch.label}
                        onClick={() => {
                          onChangeColor(swatch.value);
                          setIsColorMenuOpen(false);
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
                          <span className="text-[8px] font-bold text-neutral-400">×</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onDuplicate}
            className={`p-1 rounded text-blue-500 transition-colors cursor-pointer ${actionHover}`}
            title="Duplicate timer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onEdit}
            className={`p-1 rounded text-cyan-500 transition-colors cursor-pointer ${actionHover}`}
            title="Edit timer settings (or double-click row)"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onDelete}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isDark ? 'hover:bg-red-950/40 text-neutral-500 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-600'
            }`}
            title="Delete timer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};
