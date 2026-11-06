/**
 * Presenter Display (Confidence Monitor).
 * Designed for speaker-facing screens and teleprompters.
 * Syncs seamlessly via BroadcastChannel with zero lag.
 */

import React from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';
import { AlertIndicator } from '../alerts/AlertIndicator';

export const PresenterDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-400 flex flex-col items-center justify-center font-mono select-none">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span>WAITING FOR PROTIMER MASTER CONNECTION...</span>
      </div>
    );
  }

  // Blackout mode
  if (payload.isBlackout) {
    return <div className="h-screen w-screen bg-black" />;
  }

  // Clock mode
  if (payload.isClockMode) {
    return (
      <div className="h-screen w-screen bg-black text-white flex flex-col items-center justify-center select-none font-mono">
        <span className="text-xl text-neutral-400 tracking-widest uppercase mb-4">CURRENT TIME</span>
        <div className="text-7xl md:text-9xl font-bold tracking-tight text-cyan-400">
          {payload.clockTimeFormatted}
        </div>
      </div>
    );
  }

  const isOvertime = payload.isOvertime;
  const isDanger = payload.activeAlertLevel === 'danger';
  const isWarning = payload.activeAlertLevel === 'warning';

  // Background tint during alerts
  let bgStyle = 'bg-black';
  if (isOvertime || (isDanger && payload.alertFlash)) {
    bgStyle = 'bg-[#2a0c0c]';
  } else if (isWarning && payload.alertFlash) {
    bgStyle = 'bg-[#20170a]';
  }

  return (
    <div className={`h-screen w-screen ${bgStyle} text-white flex flex-col justify-between p-8 md:p-12 select-none overflow-hidden transition-colors duration-200`}>
      {/* Top Header: Current Cue Name & Alert Indicator */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-widest text-neutral-400 font-semibold">
            CUE
          </span>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white mt-1">
            {payload.activeTimer ? payload.activeTimer.name : 'STANDBY'}
          </h1>
          {payload.activeTimer?.endTime && (
            <span className="text-xs text-neutral-400 font-mono mt-0.5">
              Ends at <span className="text-neutral-200 font-bold">{payload.activeTimer.endTime}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <AlertIndicator
            level={payload.activeAlertLevel}
            color={payload.alertColor}
            flash={payload.alertFlash}
          />
          <div className="font-mono text-sm md:text-base text-neutral-400 bg-neutral-900 px-3 py-1.5 rounded border border-neutral-800">
            {payload.clockTimeFormatted}
          </div>
        </div>
      </div>

      {/* Center: Hero Timer Display */}
      <div className="flex-1 flex flex-col items-center justify-center my-auto">
        <div
          className={`font-mono font-black text-8xl sm:text-9xl md:text-[14rem] tracking-tight tabular-nums select-none ${
            isOvertime || payload.alertOnOff
              ? 'animate-overtime-blink'
              : payload.alertFlash
              ? 'animate-pulse'
              : ''
          } ${
            isOvertime
              ? 'text-red-500'
              : !payload.alertColor
              ? isDanger
                ? 'text-red-500'
                : isWarning
                ? 'text-amber-400'
                : 'text-white'
              : ''
          }`}
          style={payload.alertColor ? { color: payload.alertColor } : undefined}
        >
          {isOvertime ? `+${payload.formattedTime.replace(/^[+-]/, '')}` : payload.formattedTime.replace(/^-/, '+')}
        </div>

        {isOvertime && (
          <div className="text-xl md:text-3xl font-extrabold text-red-400 tracking-widest uppercase mt-2">
            OVERTIME: <span className="animate-overtime-blink">+{payload.overtimeFormatted.replace(/^[+-]/, '')}</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-neutral-900 h-3 rounded-full overflow-hidden my-4 border border-neutral-800">
        <div
          className={`h-full transition-all duration-300 ${
            isOvertime ? 'bg-red-500' : isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-500'
          }`}
          style={{ width: `${payload.progressPercent}%` }}
        />
      </div>

      {/* Bottom Footer: Next Cue Up */}
      <div className="flex items-center justify-between border-t border-neutral-800 pt-4 text-xs md:text-sm text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="text-neutral-500 uppercase tracking-wider font-semibold">NEXT CUE:</span>
          <span className="text-neutral-200 font-medium">
            {payload.nextTimer ? payload.nextTimer.name : 'End of Run'}
          </span>
        </div>

        <div className="font-mono text-neutral-500">
          STATUS: <span className="text-cyan-400 uppercase font-semibold">{payload.status}</span>
        </div>
      </div>

      {/* Stage Message Banner */}
      <MessageOverlay message={payload.activeMessage} />
    </div>
  );
};
