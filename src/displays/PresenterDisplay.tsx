/**
 * Presenter Pop-Out Display (Confidence Monitor).
 * Designed for 360x240 compact always-on-top presenter windows and scales smoothly when resized.
 * Has NO playback/duration controls at the top (clean confidence view for the speaker).
 */

import React from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';
import { Pin } from 'lucide-react';

export const PresenterDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-400 flex items-center justify-center font-mono text-xs select-none">
        Loading Presenter...
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

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col justify-between p-3 font-mono select-none overflow-hidden relative border border-[#222d3d]">
      {/* Clean Header Bar (Cue Name & Time of Day — NO playback controls) */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#1c2536] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Pin className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-bold text-white uppercase tracking-wider truncate">
            {payload.activeTimer?.name || 'STANDBY'}
          </span>
        </div>

        <span className="text-[11px] text-neutral-400 tabular-nums shrink-0">
          {payload.clockTimeFormatted}
        </span>
      </div>

      {/* Main Active Time Display */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 my-1 bg-black">
        {payload.isBlackout ? (
          <div className="w-full h-full bg-black" />
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

      {/* Bottom Progress Bar & Next Cue */}
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

      <MessageOverlay message={payload.activeMessage} />
    </div>
  );
};
