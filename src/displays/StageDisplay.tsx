/**
 * Stage Display.
 * Optimized for stage crew, backstage monitors, and band/audio engineers.
 */

import React from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';

export const StageDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);

  if (!payload || payload.isBlackout) {
    return <div className="h-screen w-screen bg-black" />;
  }

  const isOvertime = payload.isOvertime;

  return (
    <div className="h-screen w-screen bg-[#08090b] text-white flex flex-col p-6 font-mono select-none">
      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-neutral-800">
        <div>
          <span className="text-xs text-neutral-400 uppercase tracking-widest block font-semibold">
            CUE
          </span>
          <span className="text-2xl font-bold text-white truncate block">
            {payload.activeTimer?.name || 'STANDBY'}
          </span>
          {payload.activeTimer?.endTime && (
            <span className="text-xs text-neutral-400 font-mono">
              Ends at: <span className="text-neutral-200 font-bold">{payload.activeTimer.endTime}</span>
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs text-neutral-500 uppercase tracking-widest block">TIME OF DAY</span>
          <span className="text-2xl font-bold text-white">
            {payload.clockTimeFormatted}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div 
          className={`text-8xl sm:text-9xl md:text-[12rem] font-black tabular-nums tracking-tighter ${
            isOvertime
              ? 'text-red-500 animate-overtime-blink'
              : payload.alertOnOff
              ? 'animate-overtime-blink'
              : payload.alertFlash
              ? 'animate-pulse'
              : ''
          }`}
          style={payload.alertColor ? { color: payload.alertColor } : undefined}
        >
          {isOvertime ? `+${payload.formattedTime.replace(/^[+-]/, '')}` : payload.formattedTime.replace(/^-/, '+')}
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm text-neutral-400">
          <span>PROGRESS: {Math.round(payload.progressPercent)}%</span>
          <span>•</span>
          <span>SPEED: {payload.speed}%</span>
          <span>•</span>
          <span className="text-emerald-400 uppercase font-bold">{payload.status}</span>
        </div>
      </div>

      <div className="border-t border-neutral-800 pt-4 flex items-center justify-between text-xs text-neutral-400">
        <span>NEXT: {payload.nextTimer?.name || 'None'}</span>
        <span>PROTIMER STAGE OUTPUT</span>
      </div>

      <MessageOverlay message={payload.activeMessage} />
    </div>
  );
};
