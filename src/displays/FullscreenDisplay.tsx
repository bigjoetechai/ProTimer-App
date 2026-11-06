/**
 * Fullscreen Output Display.
 * Dedicated borderless video output for external monitors, projectors, and confidence displays.
 * Synchronizes with the central timer engine and allows exiting via Escape key without stopping timers.
 */

import React, { useEffect, useState } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';
import { X, Minimize2 } from 'lucide-react';

export const FullscreenDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);
  const [showControls, setShowControls] = useState(false);

  // Handle Escape key to safely close/exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (typeof window !== 'undefined' && window.electronAPI?.closeFullscreenOutput) {
          window.electronAPI.closeFullscreenOutput();
        } else {
          // In browser, exit fullscreen or close window
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            window.close();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.electronAPI?.closeFullscreenOutput) {
      window.electronAPI.closeFullscreenOutput();
    } else {
      window.close();
    }
  };

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-500 flex flex-col items-center justify-center font-mono select-none">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-xs uppercase tracking-widest">Connecting to ProTimer Engine...</span>
      </div>
    );
  }

  // Blackout mode (Blank screen)
  if (payload.isBlackout) {
    return (
      <div 
        className="h-screen w-screen bg-black cursor-none"
        onMouseMove={() => setShowControls(true)}
      >
        {/* Subtle hover exit control */}
        {showControls && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-opacity opacity-40 hover:opacity-100"
            title="Exit Fullscreen (Escape)"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // Clock Mode: Large Broadcast Time of Day
  if (payload.isClockMode) {
    return (
      <div 
        className="h-screen w-screen bg-black text-white flex flex-col items-center justify-center select-none font-mono relative overflow-hidden"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        <span className="text-2xl sm:text-3xl text-neutral-400 uppercase tracking-widest mb-6 font-semibold">
          CURRENT TIME
        </span>
        <div className="text-8xl sm:text-9xl md:text-[14rem] font-black tracking-tight text-cyan-400 tabular-nums">
          {payload.clockTimeFormatted}
        </div>

        {/* Hover Close Button */}
        {showControls && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2.5 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-all border border-neutral-700 shadow-lg"
            title="Exit Fullscreen (Escape)"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}

        <MessageOverlay message={payload.activeMessage} />
      </div>
    );
  }

  const isOvertime = payload.isOvertime;
  const isDanger = payload.activeAlertLevel === 'danger';
  const isWarning = payload.activeAlertLevel === 'warning';

  // Dynamic alert background tint
  let bgStyle = 'bg-black';
  if (isOvertime || (isDanger && payload.alertFlash)) {
    bgStyle = 'bg-[#2a0808]';
  } else if (isWarning && payload.alertFlash) {
    bgStyle = 'bg-[#221606]';
  }

  return (
    <div 
      className={`h-screen w-screen ${bgStyle} text-white flex flex-col justify-between p-6 sm:p-10 md:p-14 select-none font-mono relative overflow-hidden transition-colors duration-200`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Top Header: Cue Name & System Time */}
      <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
        <div className="flex flex-col max-w-[70%]">
          <span className="text-xs uppercase tracking-widest text-neutral-400 font-semibold mb-1">
            CURRENT CUE
          </span>
          <span className="text-2xl sm:text-4xl font-black text-white truncate">
            {payload.activeTimer?.name || 'STANDBY'}
          </span>
          {payload.activeTimer?.endTime && (
            <span className="text-sm text-neutral-400 font-mono mt-0.5">
              Ends at: <span className="text-neutral-200 font-bold">{payload.activeTimer.endTime}</span>
            </span>
          )}
        </div>

        <div className="text-right">
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-1 block">
            LOCAL TIME
          </span>
          <span className="text-2xl sm:text-4xl font-bold text-neutral-200 tabular-nums">
            {payload.clockTimeFormatted}
          </span>
        </div>
      </div>

      {/* Main Countdown / Count-up Display */}
      <div className="flex-1 flex flex-col items-center justify-center my-4">
        <div
          className={`text-8xl sm:text-[12rem] md:text-[18rem] lg:text-[22rem] font-black tracking-tighter tabular-nums leading-none ${
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

        {/* Status bar */}
        <div className="mt-6 flex items-center gap-4 text-xs sm:text-sm text-neutral-400 tracking-wider">
          <span className="uppercase font-bold text-emerald-400">{payload.status}</span>
          <span>•</span>
          <span>SPEED: {payload.speed}%</span>
          {payload.totalDurationSeconds > 0 && (
            <>
              <span>•</span>
              <span>PROGRESS: {Math.round(payload.progressPercent)}%</span>
            </>
          )}
        </div>
      </div>

      {/* Bottom Footer: Next Cue & Branding */}
      <div className="border-t border-neutral-800/80 pt-4 flex items-center justify-between text-xs sm:text-sm text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="text-neutral-500 uppercase font-semibold">NEXT CUE:</span>
          <span className="text-neutral-200 font-medium">
            {payload.nextTimer ? payload.nextTimer.name : 'End of Run'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-neutral-500 uppercase tracking-widest hidden sm:inline">
            PROTIMER LIVE OUTPUT
          </span>
        </div>
      </div>

      {/* Subtle hover exit control */}
      {showControls && (
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2.5 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-all border border-neutral-700 shadow-xl cursor-pointer"
          title="Exit Fullscreen (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* On-screen Stage Messages Overlay */}
      <MessageOverlay message={payload.activeMessage} />
    </div>
  );
};
