/**
 * NDI Broadcast Output Display.
 * Designed for IP video switchers (vMix, OBS, TriCaster, Wirecast) with transparency,
 * chroma key options, and broadcast safe margins.
 */

import React, { useState } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { Radio, Layers } from 'lucide-react';

export const NdiDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);
  const [bgMode, setBgMode] = useState<'transparent' | 'black' | 'green'>('black');
  const [showSafeMargins, setShowSafeMargins] = useState(false);

  if (!payload || payload.isBlackout) {
    return <div className="h-screen w-screen bg-transparent" />;
  }

  const bgClasses = {
    transparent: 'bg-transparent',
    black: 'bg-black',
    green: 'bg-[#00b140]',
  }[bgMode];

  return (
    <div className={`h-screen w-screen ${bgClasses} text-white flex flex-col justify-between p-8 font-mono select-none relative overflow-hidden`}>
      {/* Safe Title Margins Overlay */}
      {showSafeMargins && (
        <div className="absolute inset-12 border border-dashed border-cyan-500/40 pointer-events-none flex items-start justify-end p-2">
          <span className="text-[10px] text-cyan-400 bg-black/60 px-1 rounded">ACTION / TITLE SAFE 90%</span>
        </div>
      )}

      {/* Top NDI Metadata Toolbar (Discreet) */}
      <div className="flex items-center justify-between opacity-50 hover:opacity-100 transition-opacity z-20">
        <div className="flex items-center gap-2 text-xs">
          <Radio className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="font-bold text-red-400">NDI|HX OUT: PROTIMER_PGM_1</span>
          <span className="text-neutral-400">1080p60 • Alpha: Enabled</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowSafeMargins(!showSafeMargins)}
            className="px-2 py-1 bg-black/70 hover:bg-black rounded text-[11px] text-neutral-300 border border-neutral-700"
          >
            Safe Area
          </button>
          <button
            type="button"
            onClick={() => {
              const nextMode = bgMode === 'black' ? 'transparent' : bgMode === 'transparent' ? 'green' : 'black';
              setBgMode(nextMode);
            }}
            className="px-2 py-1 bg-black/70 hover:bg-black rounded text-[11px] text-neutral-300 border border-neutral-700 flex items-center gap-1"
          >
            <Layers className="w-3 h-3 text-cyan-400" />
            Key: {bgMode.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Center Digital Clock / Counter */}
      <div className="my-auto flex flex-col items-center justify-center text-center">
        {payload.activeTimer && (
          <div className="text-2xl md:text-3xl font-bold tracking-wider uppercase text-cyan-300 mb-2 drop-shadow-md">
            {payload.activeTimer.name}
          </div>
        )}
        <div
          className={`text-8xl md:text-[14rem] font-black tracking-tighter tabular-nums drop-shadow-2xl ${
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
          {payload.isClockMode
            ? payload.clockTimeFormatted
            : payload.isOvertime
            ? `+${payload.formattedTime.replace(/^[+-]/, '')}`
            : payload.formattedTime.replace(/^-/, '+')}
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="flex items-center justify-between text-xs text-neutral-400 border-t border-neutral-800/60 pt-2">
        <span>STATUS: {payload.status.toUpperCase()}</span>
        <span>SPEED: {payload.speed}%</span>
        <span>NEXT: {payload.nextTimer?.name || 'STANDBY'}</span>
      </div>
    </div>
  );
};
