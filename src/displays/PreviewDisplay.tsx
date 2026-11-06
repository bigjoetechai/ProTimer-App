/**
 * Preview & Fullscreen Displays.
 */

import React from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { Play, Pause, Square, ChevronRight } from 'lucide-react';



export const PreviewDisplay: React.FC = () => {
  const { payload, sendRemoteCommand } = useDisplaySync(true);

  if (!payload) return null;

  return (
    <div className="h-screen w-screen bg-[#111317] text-white flex flex-col p-6 font-mono select-none">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
        <span className="text-cyan-400 font-bold tracking-wider">PROTIMER PREVIEW MONITOR</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => sendRemoteCommand('START')}
            className="p-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-400 rounded border border-emerald-500/40"
          >
            <Play className="w-4 h-4 fill-emerald-400" />
          </button>
          <button
            onClick={() => sendRemoteCommand('PAUSE')}
            className="p-2 bg-amber-600/30 hover:bg-amber-600/50 text-amber-400 rounded border border-amber-500/40"
          >
            <Pause className="w-4 h-4 fill-amber-400" />
          </button>
          <button
            onClick={() => sendRemoteCommand('STOP')}
            className="p-2 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded border border-red-500/40"
          >
            <Square className="w-4 h-4 fill-red-400" />
          </button>
          <button
            onClick={() => sendRemoteCommand('CUE_NEXT')}
            className="p-2 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-400 rounded border border-cyan-500/40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className={`text-7xl md:text-9xl font-bold tracking-tight mb-4 ${
            payload.isOvertime
              ? 'text-red-500 animate-overtime-blink'
              : payload.alertOnOff
              ? 'text-white animate-overtime-blink'
              : payload.alertFlash
              ? 'text-white animate-pulse'
              : 'text-white'
          }`}
          style={payload.alertColor ? { color: payload.alertColor } : undefined}
        >
          {payload.isOvertime ? `+${payload.formattedTime.replace(/^[+-]/, '')}` : payload.formattedTime.replace(/^-/, '+')}
        </div>
        <div className="text-lg text-neutral-400">
          Cue: <span className="text-white font-bold">{payload.activeTimer?.name || 'Idle'}</span>
        </div>
      </div>
    </div>
  );
};
