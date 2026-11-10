/**
 * Preview Pop-Out Display.
 * Designed for 360x240 compact always-on-top preview windows and scales smoothly when resized.
 * Includes Start, Pause, Stop, Next Cue, +1, -1, and Step controls.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { Play, Pause, Square, ChevronRight, Plus, Minus, Sliders, Pin } from 'lucide-react';
import { MessageOverlay } from '../messages/MessageOverlay';

export const PreviewDisplay: React.FC = () => {
  const { payload, sendRemoteCommand } = useDisplaySync(true);
  const [incrementSeconds, setIncrementSeconds] = useState(60);
  const [showStepMenu, setShowStepMenu] = useState(false);
  const [stepMenuPos, setStepMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const stepBtnRef = useRef<HTMLButtonElement>(null);
  const stepMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showStepMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        stepMenuRef.current &&
        !stepMenuRef.current.contains(e.target as Node) &&
        stepBtnRef.current &&
        !stepBtnRef.current.contains(e.target as Node)
      ) {
        setShowStepMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showStepMenu]);

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-400 flex items-center justify-center font-mono text-xs select-none">
        Loading Preview...
      </div>
    );
  }

  const isOvertime = payload.isOvertime;
  const isRunning = payload.status === 'running' || payload.status === 'overtime';
  const isPaused = payload.status === 'paused';

  const displayTime = payload.isClockMode
    ? payload.clockTimeFormatted
    : isOvertime
    ? `+${payload.formattedTime.replace(/^[+-]/, '')}`
    : payload.formattedTime.replace(/^-/, '+');

  const formatStepShort = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}`;
  };

  const formatStepLabel = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}m`;
  };

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col justify-between p-2.5 font-mono select-none overflow-hidden relative border border-[#222d3d]">
      {/* Compact Header & Controls Bar */}
      <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-[#1c2536] shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <Pin className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider truncate">
            {payload.activeTimer?.name || 'STANDBY'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => sendRemoteCommand('START')}
            title="Start"
            className="p-1 bg-emerald-600/25 hover:bg-emerald-600/45 text-emerald-400 rounded border border-emerald-500/40 cursor-pointer"
          >
            <Play className="w-2.5 h-2.5 fill-emerald-400" />
          </button>
          <button
            type="button"
            onClick={() => sendRemoteCommand('PAUSE')}
            title="Pause / Resume"
            className={`p-1 rounded border cursor-pointer ${
              isPaused
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-amber-600/25 hover:bg-amber-600/45 text-amber-400 border-amber-500/40'
            }`}
          >
            <Pause className={`w-2.5 h-2.5 ${isPaused ? 'fill-black' : 'fill-amber-400'}`} />
          </button>
          <button
            type="button"
            onClick={() => sendRemoteCommand('STOP')}
            title="Stop"
            className="p-1 bg-red-600/25 hover:bg-red-600/45 text-red-400 rounded border border-red-500/40 cursor-pointer"
          >
            <Square className="w-2.5 h-2.5 fill-red-400" />
          </button>
          <button
            type="button"
            onClick={() => sendRemoteCommand('CUE_NEXT')}
            title="Next Cue"
            className="p-1 bg-cyan-600/25 hover:bg-cyan-600/45 text-cyan-400 rounded border border-cyan-500/40 cursor-pointer"
          >
            <ChevronRight className="w-2.5 h-2.5" />
          </button>

          <div className="h-3.5 w-[1px] bg-[#1e293b] mx-0.5" />

          {/* +1, -1, and Step */}
          <button
            type="button"
            onClick={() => sendRemoteCommand('ADJUST_DURATION', { secondsDelta: incrementSeconds })}
            title={`Add ${formatStepLabel(incrementSeconds)} (+)`}
            className="px-1.5 py-0.5 h-[22px] bg-[#161e2e] hover:bg-[#1f2b42] text-emerald-400 rounded border border-[#2a3852] text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
          >
            <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
            <span>{formatStepShort(incrementSeconds)}</span>
          </button>
          <button
            type="button"
            onClick={() => sendRemoteCommand('ADJUST_DURATION', { secondsDelta: -incrementSeconds })}
            title={`Subtract ${formatStepLabel(incrementSeconds)} (-)`}
            className="px-1.5 py-0.5 h-[22px] bg-[#161e2e] hover:bg-[#1f2b42] text-amber-400 rounded border border-[#2a3852] text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
          >
            <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
            <span>{formatStepShort(incrementSeconds)}</span>
          </button>
          <button
            ref={stepBtnRef}
            type="button"
            onClick={() => {
              if (!showStepMenu && stepBtnRef.current) {
                const rect = stepBtnRef.current.getBoundingClientRect();
                setStepMenuPos({
                  top: rect.bottom + 4,
                  left: Math.min(rect.left, window.innerWidth - 90),
                });
              }
              setShowStepMenu((prev) => !prev);
            }}
            title="Change Step Increment (15s, 30s, 1m, 5m)"
            className={`px-1.5 py-0.5 h-[22px] rounded border text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer ${
              showStepMenu
                ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                : 'bg-[#161e2e] hover:bg-[#1f2b42] text-neutral-300 hover:text-white border-[#2a3852]'
            }`}
          >
            <Sliders className="w-2.5 h-2.5 text-cyan-400" />
            <span>{formatStepLabel(incrementSeconds)}</span>
          </button>
        </div>
      </div>

      {/* Main Active Time Display */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 my-1">
        {payload.isBlackout ? (
          <span className="text-xs uppercase tracking-widest text-red-400 font-semibold">
            BLACKOUT ACTIVE
          </span>
        ) : (
          <div
            style={{
              fontSize: 'clamp(2.25rem, 15vw, 9rem)',
              ...(payload.alertColor ? { color: payload.alertColor } : {}),
            }}
            className={`font-black tracking-tighter tabular-nums leading-none ${
              isOvertime
                ? 'text-red-500 animate-overtime-blink'
                : payload.alertOnOff
                ? 'text-white animate-overtime-blink'
                : payload.alertFlash
                ? 'text-white animate-pulse'
                : isPaused
                ? 'text-amber-400'
                : 'text-white'
            }`}
          >
            {displayTime}
          </div>
        )}
      </div>

      {/* Bottom Status & Progress Bar */}
      <div className="pt-1.5 border-t border-[#1c2536] shrink-0">
        <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden mb-1.5">
          <div
            className={`h-full transition-all duration-200 ${
              isOvertime || payload.activeAlertLevel === 'danger'
                ? 'bg-red-500'
                : payload.activeAlertLevel === 'warning'
                ? 'bg-amber-500'
                : isRunning
                ? 'bg-emerald-500'
                : 'bg-cyan-500/60'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, payload.progressPercent))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-neutral-400">
          <span
            className={`uppercase font-bold ${
              isOvertime
                ? 'text-red-400'
                : isRunning
                ? 'text-emerald-400'
                : isPaused
                ? 'text-amber-400'
                : 'text-cyan-400'
            }`}
          >
            {payload.status}
          </span>
          <span className="truncate max-w-[65%]">
            Next: <span className="text-neutral-200">{payload.nextTimer?.name || 'End'}</span>
          </span>
        </div>
      </div>

      {/* Step Selector Dropdown */}
      {showStepMenu && (
        <div
          ref={stepMenuRef}
          style={{ top: stepMenuPos.top, left: stepMenuPos.left }}
          className="fixed z-50 rounded shadow-2xl p-1 flex flex-col gap-0.5 min-w-[82px] border bg-[#111622] border-[#253247]"
        >
          <span className="text-[9px] uppercase px-2 py-0.5 font-semibold text-neutral-400">
            Step Size
          </span>
          {[
            { label: '15 sec', val: 15 },
            { label: '30 sec', val: 30 },
            { label: '1 min', val: 60 },
            { label: '5 min', val: 300 },
          ].map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => {
                setIncrementSeconds(opt.val);
                setShowStepMenu(false);
              }}
              className={`text-left px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                incrementSeconds === opt.val
                  ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                  : 'text-neutral-300 hover:bg-[#1b2436]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <MessageOverlay message={payload.activeMessage} />
    </div>
  );
};
