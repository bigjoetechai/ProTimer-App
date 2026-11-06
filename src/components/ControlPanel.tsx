/**
 * Master Timer Control Panel.
 * Supports:
 * - START: Start the selected timer
 * - STOP: Stop the selected timer
 * - PAUSE: Pause the selected timer while preserving its current value
 * - RESTART: Reset the timer to original duration and start it again immediately
 * - CUE / MOVE: Move to next or previous cue
 * - DURATION CONTROLS: Increase, decrease, configurable increments (15s, 30s, 1m, 5m)
 * - SPEED CONTROL: 1% to 200%
 * - STOPWATCH: Lap split trigger and count
 * - DISPLAY & MESSAGE controls
 * - Full Dark & Light theme responsive styling
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Square, 
  ChevronUp, 
  ChevronDown, 
  Pause, 
  RotateCcw, 
  Plus, 
  Minus, 
  Monitor, 
  Clock, 
  Edit3, 
  MessageSquare,
  Flag,
  Check,
  X,
  Sliders
} from 'lucide-react';
import { DigitDisplay } from './DigitDisplay';
import { TimerItem, TimerStatus } from '../types';
import { formatSeconds } from '../utilities/timeFormatters';
import { useTheme } from '../hooks';

interface ControlPanelProps {
  timeStr: string;
  status: TimerStatus;
  speed?: number;
  alertColor?: string;
  isFlash?: boolean;
  isOnOff?: boolean;
  isOvertime?: boolean;
  activeTimer: TimerItem | null;
  isBlackout: boolean;
  isClockMode: boolean;
  hasActiveMessage: boolean;
  messageVisible: boolean;
  onStart: () => void;
  onStop: () => void;
  onCue?: () => void;
  onMove?: () => void;
  onMovePrev?: () => void;
  onPause: () => void;
  onRestart: () => void;
  onAdjustDuration: (secondsDelta: number) => void;
  onSetDuration?: (totalSeconds: number) => void;
  onSpeedChange?: (speed: number) => void;
  onRecordLap?: () => void;
  onToggleBlackout: () => void;
  onToggleClock: () => void;
  onEditMessage: () => void;
  onToggleMessageShow: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  timeStr,
  status,
  speed = 100,
  alertColor,
  isFlash = false,
  isOnOff = false,
  isOvertime: propIsOvertime,
  activeTimer,
  isBlackout,
  isClockMode,
  hasActiveMessage,
  messageVisible,
  onStart,
  onStop,
  onCue,
  onMove,
  onMovePrev,
  onPause,
  onRestart,
  onAdjustDuration,
  onSpeedChange,
  onRecordLap,
  onToggleBlackout,
  onToggleClock,
  onEditMessage,
  onToggleMessageShow,
}) => {
  const { isDark } = useTheme();
  const handleMove = onMove || onCue;
  
  // Configurable increment: 15s, 30s, 60s (1m), 300s (5m)
  const [incrementSeconds, setIncrementSeconds] = useState(60);
  const [showIncrementSelector, setShowIncrementSelector] = useState(false);
  const [stepMenuPos, setStepMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const stepButtonRef = useRef<HTMLButtonElement>(null);
  const stepMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showIncrementSelector) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        stepMenuRef.current &&
        !stepMenuRef.current.contains(e.target as Node) &&
        stepButtonRef.current &&
        !stepButtonRef.current.contains(e.target as Node)
      ) {
        setShowIncrementSelector(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showIncrementSelector]);

  // Stopwatch Laps viewer modal state
  const [showLapsModal, setShowLapsModal] = useState(false);

  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isOvertime = propIsOvertime ?? (status === 'overtime');
  const isStopwatch = activeTimer?.type === 'stopwatch';

  const formatIncrementLabel = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)} min`;
  };

  const containerBg = isDark ? 'bg-[#0c0f16] border-b border-[#1b2333]' : 'bg-white border-b border-slate-200 shadow-2xs';
  const sectionTitleColor = isDark ? 'text-neutral-400' : 'text-slate-500';
  const labelColor = isDark ? 'text-neutral-300' : 'text-slate-700';
  const dividerBg = isDark ? 'bg-[#1b2333]' : 'bg-slate-200';

  return (
    <div className={`${containerBg} px-3 sm:px-4 py-2 flex flex-nowrap items-center justify-between gap-2 xl:gap-6 overflow-x-auto select-none relative min-w-0 transition-colors duration-150`}>
      {/* =========================================================================
          SECTION 1: CONTROLS
          Buttons: Start, Stop, Cue/Move, Pause, Restart (+ Lap for Stopwatch)
         ========================================================================= */}
      <div className="flex flex-col items-center shrink-0">
        <div className="flex items-start gap-2">
          {/* 1. Start */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onStart}
              title="Start Next Cue (Space)"
              className={`w-11 h-11 rounded flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer ${
                isRunning 
                  ? 'bg-red-600 ring-2 ring-red-400 text-white' 
                  : isDark
                  ? 'bg-[#1a2b22] hover:bg-[#233a2e] text-emerald-400 border border-emerald-800/60'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300'
              }`}
            >
              <Play className={`w-5 h-5 ml-0.5 group-hover:scale-105 transition-transform ${
                isRunning ? 'fill-white text-white' : isDark ? 'fill-emerald-400 text-emerald-400' : 'fill-emerald-600 text-emerald-600'
              }`} />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Start Next</span>
          </div>

          {/* 2. Stop */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onStop}
              title="Stop Selected Timer"
              className={`w-11 h-11 rounded flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
                isDark
                  ? 'bg-[#1f2633] hover:bg-[#263042] border border-[#2e3b52] text-neutral-300 hover:text-white'
                  : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-slate-900'
              }`}
            >
              <Square className="w-5 h-5 fill-current group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Stop</span>
          </div>

          {/* 3. Move (Divided Up / Down) */}
          <div className="flex flex-col items-center gap-1 group">
            <div className={`w-11 h-11 rounded flex flex-col overflow-hidden shadow-md border ${
              isDark ? 'bg-[#14233a] border-blue-900/60' : 'bg-blue-50/80 border-blue-200'
            }`}>
              {/* Move Up / Previous Cue */}
              <button
                type="button"
                onClick={() => onMovePrev?.()}
                title="Move to Previous Cue (Shift+C)"
                className={`flex-1 w-full flex items-center justify-center transition-colors border-b group/up cursor-pointer ${
                  isDark
                    ? 'hover:bg-[#1f375a] active:bg-[#254570] border-blue-900/60 text-slate-200 hover:text-white'
                    : 'hover:bg-blue-100 active:bg-blue-200 border-blue-200 text-slate-700 hover:text-slate-900'
                }`}
              >
                <ChevronUp className="w-3.5 h-3.5 group-hover/up:scale-110 transition-transform" />
              </button>

              {/* Move Down / Skip Event to Next Cue */}
              <button
                type="button"
                onClick={() => handleMove?.()}
                title="Skip Event / Move to Next Cue (C)"
                className={`flex-1 w-full flex items-center justify-center transition-colors group/down cursor-pointer ${
                  isDark
                    ? 'hover:bg-[#1f375a] active:bg-[#254570] text-amber-400 hover:text-amber-300'
                    : 'hover:bg-blue-100 active:bg-blue-200 text-amber-600 hover:text-amber-700'
                }`}
              >
                <ChevronDown className="w-3.5 h-3.5 group-hover/down:scale-110 transition-transform" />
              </button>
            </div>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Move</span>
          </div>

          {/* 4. Pause */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onPause}
              title={isPaused ? 'Resume Timer' : 'Pause Timer (preserves current value)'}
              className={`w-11 h-11 rounded border flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
                isPaused
                  ? 'bg-amber-600 ring-2 ring-amber-400 text-white border-amber-500'
                  : isDark
                  ? 'bg-[#152438] hover:bg-[#1c304d] text-cyan-400 border-cyan-950/80'
                  : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border-cyan-300'
              }`}
            >
              <Pause className={`w-5 h-5 group-hover:scale-105 transition-transform ${
                isPaused ? 'fill-white text-white' : isDark ? 'fill-cyan-400 text-cyan-400' : 'fill-cyan-600 text-cyan-600'
              }`} />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Pause</span>
          </div>

          {/* 5. Restart */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onRestart}
              title="Reset to original duration & start immediately (Restart)"
              className={`w-11 h-11 rounded flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
                isDark
                  ? 'bg-[#152438] hover:bg-[#1c304d] border border-cyan-950/80 text-cyan-400'
                  : 'bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 text-cyan-700'
              }`}
            >
              <RotateCcw className="w-4 h-4 group-hover:-rotate-45 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Restart</span>
          </div>

          {/* 6. Stopwatch Lap (Shown for Stopwatch) */}
          {isStopwatch && onRecordLap && (
            <div className={`flex flex-col items-center gap-1 group pl-1 border-l ${isDark ? 'border-[#1f2838]' : 'border-slate-300'}`}>
              <button
                type="button"
                onClick={onRecordLap}
                disabled={!isRunning}
                title="Record Lap Split (Flag)"
                className={`w-11 h-11 rounded disabled:opacity-50 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
                  isDark
                    ? 'bg-[#1e1a2b] hover:bg-[#2b243e] border border-purple-900/60 text-purple-400'
                    : 'bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-700'
                }`}
              >
                <Flag className="w-4 h-4 fill-current group-hover:scale-105 transition-transform" />
              </button>
              <button
                type="button"
                onClick={() => setShowLapsModal(true)}
                title="View Recorded Stopwatch Laps"
                className={`text-[10px] font-medium tracking-tight hover:underline cursor-pointer ${
                  isDark ? 'text-purple-300' : 'text-purple-700'
                }`}
              >
                Lap {activeTimer?.laps?.length ? `(${activeTimer.laps.length})` : ''}
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 text-center">
          <span className={`text-[10px] uppercase font-bold tracking-wider ${sectionTitleColor}`}>
            CONTROLS
          </span>
        </div>
      </div>

      {/* Subtle Vertical Hairline Divider */}
      <div className={`hidden lg:block w-px h-14 ${dividerBg}`} />

      {/* =========================================================================
          SECTION 2: CHANGE DURATION
          Large digital timer display, Increase (+), Decrease (-), Step selector
         ========================================================================= */}
      <div className="flex items-start gap-3 shrink-0">
        {/* 1. Large Digital Timer Display (HH:MM:SS) */}
        <div className="flex items-start">
          <DigitDisplay
            timeStr={timeStr}
            status={status}
            isOvertime={isOvertime}
            alertColor={alertColor}
            isFlash={isFlash}
            isOnOff={isOnOff}
            size="lg"
          />
        </div>

        {/* Change Duration (+ / - buttons and step) */}
        <div className="flex flex-col items-center">
          <div className="flex items-start gap-2">
            {/* 2. Increase Duration (+) */}
            <div className="flex flex-col items-center gap-1 group">
              <button
                type="button"
                onClick={() => onAdjustDuration(incrementSeconds)}
                title={`Increase duration by ${formatIncrementLabel(incrementSeconds)} (+)`}
                className={`w-11 h-11 rounded flex items-center justify-center transition-colors shadow-xs active:scale-95 cursor-pointer ${
                  isDark
                    ? 'bg-[#162740] hover:bg-[#1f375a] border border-blue-800/60 text-blue-400 hover:text-blue-300'
                    : 'bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 hover:text-blue-800'
                }`}
              >
                <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
              <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>
                +{formatIncrementLabel(incrementSeconds)}
              </span>
            </div>

            {/* 3. Decrease Duration (-) */}
            <div className="flex flex-col items-center gap-1 group">
              <button
                type="button"
                onClick={() => onAdjustDuration(-incrementSeconds)}
                title={`Decrease duration by ${formatIncrementLabel(incrementSeconds)} (-)`}
                className={`w-11 h-11 rounded flex items-center justify-center transition-colors shadow-xs active:scale-95 cursor-pointer ${
                  isDark
                    ? 'bg-[#162740] hover:bg-[#1f375a] border border-blue-800/60 text-blue-400 hover:text-blue-300'
                    : 'bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 hover:text-blue-800'
                }`}
              >
                <Minus className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
              <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>
                -{formatIncrementLabel(incrementSeconds)}
              </span>
            </div>

            {/* Increment Step Selector */}
            <div className="relative flex flex-col items-center gap-1">
              <button
                ref={stepButtonRef}
                type="button"
                onClick={() => {
                  if (!showIncrementSelector && stepButtonRef.current) {
                    const rect = stepButtonRef.current.getBoundingClientRect();
                    setStepMenuPos({
                      top: rect.bottom + 6,
                      left: Math.min(rect.left, window.innerWidth - 128),
                    });
                  }
                  setShowIncrementSelector(!showIncrementSelector);
                }}
                title="Change increment step (15s, 30s, 1m, 5m)"
                className={`w-11 h-11 rounded flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#121722] hover:bg-[#1a2333] border border-[#222e42] text-neutral-400 hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-4 h-4" />
              </button>
              <span className={`text-[10px] font-medium tracking-tight ${sectionTitleColor}`}>
                Step
              </span>

              {showIncrementSelector && (
                <div
                  ref={stepMenuRef}
                  style={{ top: stepMenuPos.top, left: stepMenuPos.left }}
                  className={`fixed w-32 rounded-md shadow-2xl py-1 z-[100] text-xs animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? 'bg-[#101520] border border-[#253247] text-neutral-200' : 'bg-white border border-slate-300 text-slate-800'
                  }`}
                >
                  <div className={`px-2.5 py-1 text-[10px] font-semibold border-b ${
                    isDark ? 'text-neutral-400 border-[#1f2838]' : 'text-slate-500 border-slate-200'
                  }`}>
                    Increment:
                  </div>
                  {[15, 30, 60, 300].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setIncrementSeconds(sec);
                        setShowIncrementSelector(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between cursor-pointer ${
                        incrementSeconds === sec 
                          ? 'text-cyan-500 font-semibold' 
                          : isDark ? 'text-neutral-300 hover:bg-[#1c273a]' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{formatIncrementLabel(sec)}</span>
                      {incrementSeconds === sec && <Check className="w-3 h-3 text-cyan-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-1 text-center">
            <span className={`text-[10px] uppercase font-bold tracking-wider ${sectionTitleColor}`}>
              CHANGE DURATION
            </span>
          </div>
        </div>

        {/* Speed % Control */}
        <div className="flex flex-col items-center">
          <div className="flex flex-col items-center gap-1">
            <div 
              className={`h-11 px-2.5 rounded border flex items-center gap-1 shadow-inner ${
                isDark ? 'bg-[#0f141d] border-[#222e42]' : 'bg-slate-100 border-slate-300'
              }`}
              title="Speed %"
            >
              <input
                type="number"
                min="1"
                max="200"
                value={speed}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onSpeedChange?.(100);
                    return;
                  }
                  const val = parseInt(raw, 10);
                  if (!isNaN(val)) {
                    onSpeedChange?.(Math.max(1, Math.min(200, val)));
                  }
                }}
                className={`w-10 text-sm font-mono font-bold bg-transparent text-center tabular-nums focus:outline-hidden ${
                  isDark ? 'text-neutral-100' : 'text-slate-900'
                }`}
              />
              <div className="flex flex-col -mr-0.5">
                <button
                  type="button"
                  onClick={() => onSpeedChange?.(Math.min(200, (speed || 100) + 5))}
                  title="Increase speed"
                  className={`p-0.5 leading-none transition-colors cursor-pointer ${
                    isDark ? 'text-neutral-400 hover:text-cyan-400' : 'text-slate-500 hover:text-cyan-600'
                  }`}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onSpeedChange?.(Math.max(1, (speed || 100) - 5))}
                  title="Decrease speed"
                  className={`p-0.5 leading-none transition-colors cursor-pointer ${
                    isDark ? 'text-neutral-400 hover:text-cyan-400' : 'text-slate-500 hover:text-cyan-600'
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="h-4" />
          </div>
          <div className="mt-1 text-center">
            <span className={`text-[10px] font-bold tracking-wider ${sectionTitleColor}`}>
              Speed %
            </span>
          </div>
        </div>
      </div>

      {/* Subtle Vertical Hairline Divider */}
      <div className={`hidden lg:block w-px h-14 ${dividerBg}`} />

      {/* =========================================================================
          SECTION 3: DISPLAY
          Buttons: Hide, Clock
         ========================================================================= */}
      <div className="flex flex-col items-center shrink-0">
        <div className="flex items-start gap-2">
          {/* Hide */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onToggleBlackout}
              title="Hide / Blackout Secondary Displays (H)"
              className={`w-11 h-11 rounded flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer ${
                isBlackout
                  ? 'bg-red-900/80 text-white border border-red-500 ring-2 ring-red-500/50'
                  : isDark
                  ? 'bg-[#1a202c] hover:bg-[#252e3e] text-neutral-300 border border-[#2a364a]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
              }`}
            >
              <Monitor className="w-5 h-5 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Hide</span>
          </div>

          {/* Clock */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onToggleClock}
              title="Switch to Real-Time Clock on Displays"
              className={`w-11 h-11 rounded flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer ${
                isClockMode
                  ? 'bg-cyan-900/80 text-white border border-cyan-400 ring-2 ring-cyan-400/50'
                  : isDark
                  ? 'bg-[#1a202c] hover:bg-[#252e3e] text-neutral-300 border border-[#2a364a]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
              }`}
            >
              <Clock className="w-5 h-5 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Clock</span>
          </div>
        </div>
        <div className="mt-1 text-center">
          <span className={`text-[10px] uppercase font-bold tracking-wider ${sectionTitleColor}`}>
            DISPLAY
          </span>
        </div>
      </div>

      {/* Subtle Vertical Hairline Divider */}
      <div className={`hidden lg:block w-px h-14 ${dividerBg}`} />

      {/* =========================================================================
          SECTION 4: MESSAGE
          Buttons: Edit Message, Show Message
         ========================================================================= */}
      <div className="flex flex-col items-center shrink-0">
        <div className="flex items-start gap-2">
          {/* Edit Message */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onEditMessage}
              title="Edit Stage Message to Speaker (M)"
              className={`w-11 h-11 rounded flex items-center justify-center transition-colors shadow-xs active:scale-95 cursor-pointer ${
                isDark
                  ? 'bg-[#2b211a] hover:bg-[#382b22] border border-amber-900/60 text-amber-400 hover:text-amber-300'
                  : 'bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-700 hover:text-amber-800'
              }`}
            >
              <Edit3 className="w-5 h-5 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Edit</span>
          </div>

          {/* Show Message */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onToggleMessageShow}
              title="Show / Hide Message on Stage Monitors"
              className={`w-11 h-11 rounded flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer ${
                hasActiveMessage && messageVisible
                  ? 'bg-amber-600 text-white ring-2 ring-amber-400 shadow-md'
                  : isDark
                  ? 'bg-[#251e30] hover:bg-[#322842] text-purple-300 border border-purple-900/60'
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300'
              }`}
            >
              <MessageSquare className="w-5 h-5 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-tight ${labelColor}`}>Show</span>
          </div>
        </div>
        <div className="mt-1 text-center">
          <span className={`text-[10px] uppercase font-bold tracking-wider ${sectionTitleColor}`}>
            MESSAGE
          </span>
        </div>
      </div>

      {/* =========================================================================
          STOPWATCH LAPS MODAL
         ========================================================================= */}
      {showLapsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className={`w-full max-w-sm rounded-lg shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh] border ${
            isDark ? 'bg-[#111622] border-[#253247] text-white' : 'bg-white border-slate-300 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b mb-3 ${
              isDark ? 'border-[#1f2838]' : 'border-slate-200'
            }`}>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Flag className="w-4 h-4 text-purple-500" />
                Stopwatch Lap Times ({activeTimer?.laps?.length || 0})
              </h4>
              <button
                type="button"
                onClick={() => setShowLapsModal(false)}
                className={`p-1 rounded cursor-pointer ${isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 my-2 text-xs">
              {activeTimer?.laps && activeTimer.laps.length > 0 ? (
                activeTimer.laps.map((lap) => (
                  <div
                    key={lap.lapNumber}
                    className={`flex items-center justify-between p-2 rounded font-mono border ${
                      isDark ? 'bg-[#090b10] border-[#1f2838]' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span className="text-purple-500 font-semibold">Lap {lap.lapNumber}</span>
                    <span className={isDark ? 'text-neutral-300' : 'text-slate-600'}>+{formatSeconds(lap.lapTimeSeconds, true)}</span>
                    <span className={`font-bold ${isDark ? 'text-neutral-100' : 'text-slate-900'}`}>{formatSeconds(lap.overallTimeSeconds, true)}</span>
                  </div>
                ))
              ) : (
                <div className={`text-center py-6 ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
                  No laps recorded yet. Press the Lap flag while stopwatch is running.
                </div>
              )}
            </div>

            <div className={`flex items-center justify-end pt-3 border-t ${
              isDark ? 'border-[#1f2838]' : 'border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setShowLapsModal(false)}
                className={`px-4 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                  isDark ? 'bg-[#1e2738] hover:bg-[#28354c] text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
