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

  const containerBg = isDark
    ? 'glass-surface border-b border-white/[0.08]'
    : 'glass-surface border-b border-slate-300/80 shadow-2xs';
  const sectionTitleColor = isDark ? 'text-neutral-400/90' : 'text-slate-600';
  const labelColor = isDark ? 'text-[#a8abb3]' : 'text-slate-700';
  const dividerBg = isDark ? 'bg-white/[0.08]' : 'bg-slate-300';

  return (
    <div className={`${containerBg} px-3 sm:px-4 py-2.5 flex flex-nowrap items-center justify-start gap-3.5 overflow-x-auto select-none relative min-w-0 transition-colors duration-150`}>
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
              className={`glass-btn w-12 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                isRunning
                  ? 'glass-btn-red-active'
                  : 'glass-btn-emerald'
              }`}
            >
              <Play className={`w-4 h-4 ml-0.5 group-hover:scale-105 transition-transform ${
                isRunning ? 'fill-white text-white' : isDark ? 'fill-emerald-300 text-emerald-300' : 'fill-emerald-700 text-emerald-700'
              }`} />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Start Next</span>
          </div>

          {/* 2. Stop */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onStop}
              title="Stop Selected Timer"
              className="glass-btn w-12 h-10 rounded-full flex items-center justify-center cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Stop</span>
          </div>

          {/* 3. Move (Divided Up / Down Pill Capsule) */}
          <div className="flex flex-col items-center gap-1 group">
            <div className="glass-btn glass-btn-blue w-12 h-10 rounded-full flex flex-col overflow-hidden p-0">
              {/* Move Up / Previous Cue */}
              <button
                type="button"
                onClick={() => onMovePrev?.()}
                title="Move to Previous Cue (Shift+C)"
                className={`flex-1 w-full flex items-center justify-center transition-colors border-b group/up cursor-pointer ${
                  isDark
                    ? 'hover:bg-white/10 active:bg-white/15 border-white/12 text-blue-200 hover:text-white'
                    : 'hover:bg-blue-200/50 active:bg-blue-200/80 border-blue-300/60 text-blue-800 hover:text-slate-900'
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
                    ? 'hover:bg-white/10 active:bg-white/15 text-amber-300 hover:text-amber-200'
                    : 'hover:bg-blue-200/50 active:bg-blue-200/80 text-amber-700 hover:text-amber-800'
                }`}
              >
                <ChevronDown className="w-3.5 h-3.5 group-hover/down:scale-110 transition-transform" />
              </button>
            </div>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Move</span>
          </div>

          {/* 4. Pause */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onPause}
              title={isPaused ? 'Resume Timer' : 'Pause Timer (preserves current value)'}
              className={`glass-btn w-12 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                isPaused
                  ? 'glass-btn-amber-active'
                  : 'glass-btn-cyan'
              }`}
            >
              <Pause className={`w-4 h-4 group-hover:scale-105 transition-transform ${
                isPaused ? 'fill-white text-white' : isDark ? 'fill-cyan-300 text-cyan-300' : 'fill-cyan-700 text-cyan-700'
              }`} />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Pause</span>
          </div>

          {/* 5. Restart */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onRestart}
              title="Reset to original duration & start immediately (Restart)"
              className="glass-btn glass-btn-cyan w-12 h-10 rounded-full flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 group-hover:-rotate-45 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Restart</span>
          </div>

          {/* 6. Stopwatch Lap (Shown for Stopwatch) */}
          {isStopwatch && onRecordLap && (
            <div className={`flex flex-col items-center gap-1 group pl-2 border-l ${isDark ? 'border-white/[0.08]' : 'border-slate-300'}`}>
              <button
                type="button"
                onClick={onRecordLap}
                disabled={!isRunning}
                title="Record Lap Split (Flag)"
                className="glass-btn glass-btn-purple w-12 h-10 rounded-full flex items-center justify-center cursor-pointer"
              >
                <Flag className="w-4 h-4 fill-current group-hover:scale-105 transition-transform" />
              </button>
              <button
                type="button"
                onClick={() => setShowLapsModal(true)}
                title="View Recorded Stopwatch Laps"
                className={`text-[10px] font-medium tracking-wide hover:underline cursor-pointer ${
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
      <div className={`w-px h-14 shrink-0 ${dividerBg}`} />

      {/* =========================================================================
          SECTION 2: CHANGE DURATION
          Large digital timer display, Increase (+), Decrease (-), Step selector
         ========================================================================= */}
      <div className="flex items-start gap-3.5 shrink-0">
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
                className="glass-btn glass-btn-blue w-12 h-10 rounded-full flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
              <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>
                +{formatIncrementLabel(incrementSeconds)}
              </span>
            </div>

            {/* 3. Decrease Duration (-) */}
            <div className="flex flex-col items-center gap-1 group">
              <button
                type="button"
                onClick={() => onAdjustDuration(-incrementSeconds)}
                title={`Decrease duration by ${formatIncrementLabel(incrementSeconds)} (-)`}
                className="glass-btn glass-btn-blue w-12 h-10 rounded-full flex items-center justify-center cursor-pointer"
              >
                <Minus className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
              <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>
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
                      left: Math.min(rect.left, window.innerWidth - 136),
                    });
                  }
                  setShowIncrementSelector(!showIncrementSelector);
                }}
                title="Change increment step (15s, 30s, 1m, 5m)"
                className="glass-btn w-12 h-10 rounded-full flex flex-col items-center justify-center cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
              </button>
              <span className={`text-[10px] font-medium tracking-wide ${sectionTitleColor}`}>
                Step
              </span>

              {showIncrementSelector && (
                <div
                  ref={stepMenuRef}
                  style={{ top: stepMenuPos.top, left: stepMenuPos.left }}
                  className={`glass-card fixed w-36 rounded-2xl py-1.5 z-[100] text-xs animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? 'text-neutral-200' : 'text-slate-800'
                  }`}
                >
                  <div className={`px-3 py-1 text-[10px] font-semibold border-b ${
                    isDark ? 'text-neutral-400 border-white/10' : 'text-slate-500 border-slate-200'
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
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        incrementSeconds === sec 
                          ? 'text-cyan-400 font-semibold' 
                          : isDark ? 'text-neutral-300 hover:bg-white/[0.08] hover:text-white' : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <span>{formatIncrementLabel(sec)}</span>
                      {incrementSeconds === sec && <Check className="w-3 h-3 text-cyan-400" />}
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
              className="glass-input h-10 px-3 rounded-full flex items-center gap-1"
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
            <div className="h-3.5" />
          </div>
          <div className="mt-1 text-center">
            <span className={`text-[10px] font-bold tracking-wider ${sectionTitleColor}`}>
              Speed %
            </span>
          </div>
        </div>
      </div>

      {/* Subtle Vertical Hairline Divider */}
      <div className={`w-px h-14 shrink-0 ${dividerBg}`} />

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
              className={`glass-btn w-12 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                isBlackout ? 'glass-btn-red-active' : ''
              }`}
            >
              <Monitor className="w-4 h-4 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Hide</span>
          </div>

          {/* Clock */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onToggleClock}
              title="Switch to Real-Time Clock on Displays"
              className={`glass-btn w-12 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                isClockMode ? 'glass-btn-cyan-active' : ''
              }`}
            >
              <Clock className="w-4 h-4 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Clock</span>
          </div>
        </div>
        <div className="mt-1 text-center">
          <span className={`text-[10px] uppercase font-bold tracking-wider ${sectionTitleColor}`}>
            DISPLAY
          </span>
        </div>
      </div>

      {/* Subtle Vertical Hairline Divider */}
      <div className={`w-px h-14 shrink-0 ${dividerBg}`} />

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
              className="glass-btn glass-btn-amber w-12 h-10 rounded-full flex items-center justify-center cursor-pointer"
            >
              <Edit3 className="w-4 h-4 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Edit</span>
          </div>

          {/* Show Message */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              type="button"
              onClick={onToggleMessageShow}
              title="Show / Hide Message on Stage Monitors"
              className={`glass-btn w-12 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                hasActiveMessage && messageVisible
                  ? 'glass-btn-amber-active'
                  : 'glass-btn-purple'
              }`}
            >
              <MessageSquare className="w-4 h-4 group-hover:scale-105 transition-transform" />
            </button>
            <span className={`text-[10px] font-medium tracking-wide ${labelColor}`}>Show</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`glass-card w-full max-w-sm rounded-[28px] p-5 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh] ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b mb-3 ${
              isDark ? 'border-white/10' : 'border-slate-200'
            }`}>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Flag className="w-4 h-4 text-purple-400" />
                Stopwatch Lap Times ({activeTimer?.laps?.length || 0})
              </h4>
              <button
                type="button"
                onClick={() => setShowLapsModal(false)}
                className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 my-2 text-xs">
              {activeTimer?.laps && activeTimer.laps.length > 0 ? (
                activeTimer.laps.map((lap) => (
                  <div
                    key={lap.lapNumber}
                    className="glass-subcard flex items-center justify-between px-3 py-2 rounded-xl font-mono"
                  >
                    <span className="text-purple-400 font-semibold">Lap {lap.lapNumber}</span>
                    <span className={isDark ? 'text-neutral-300' : 'text-slate-600'}>+{formatSeconds(lap.lapTimeSeconds, true)}</span>
                    <span className={`font-bold ${isDark ? 'text-neutral-100' : 'text-slate-900'}`}>{formatSeconds(lap.overallTimeSeconds, true)}</span>
                  </div>
                ))
              ) : (
                <div className={`text-center py-6 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                  No laps recorded yet. Press the Lap flag while stopwatch is running.
                </div>
              )}
            </div>

            <div className={`flex items-center justify-end pt-3 border-t ${
              isDark ? 'border-white/10' : 'border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setShowLapsModal(false)}
                className="glass-btn px-5 py-1.5 rounded-full text-xs font-medium cursor-pointer"
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
