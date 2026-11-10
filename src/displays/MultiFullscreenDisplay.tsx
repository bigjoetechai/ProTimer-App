/**
 * Multi Fullscreen Output Display (Multi FS).
 * Dedicated borderless multiview output that displays all Cue List tabs
 * and each List tab's active/running or cued timer simultaneously.
 * Completely independent from the single Fullscreen output window.
 */

import React, { useEffect, useState } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';
import { storageService } from '../services/storageService';
import { AppPreferences, ListActiveCueSummary, resolveBackgroundImageForList } from '../types';
import { X, Layers, Play, Pause, AlertTriangle, Clock } from 'lucide-react';

interface MultiFullscreenDisplayProps {
  onClose?: () => void;
  isClient?: boolean;
}

export const MultiFullscreenDisplay: React.FC<MultiFullscreenDisplayProps> = ({
  onClose,
  isClient = true,
}) => {
  const { payload } = useDisplaySync(isClient);
  const [showControls, setShowControls] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<AppPreferences>(() =>
    storageService.getPreferences()
  );

  useEffect(() => {
    const refreshPrefs = () => {
      setLocalPrefs({ ...storageService.getPreferences() });
    };
    window.addEventListener('protimer-prefs-updated', refreshPrefs);
    window.addEventListener('storage', refreshPrefs);
    return () => {
      window.removeEventListener('protimer-prefs-updated', refreshPrefs);
      window.removeEventListener('storage', refreshPrefs);
    };
  }, []);

  // Handle Escape key to safely close Multi FS without affecting single Fullscreen or running timers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (onClose) {
          onClose();
          return;
        }
        if (typeof window !== 'undefined' && window.electronAPI?.closeMultiFullscreenOutput) {
          window.electronAPI.closeMultiFullscreenOutput();
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          window.close();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (typeof window !== 'undefined' && window.electronAPI?.closeMultiFullscreenOutput) {
      window.electronAPI.closeMultiFullscreenOutput();
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      window.close();
    }
  };

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-500 flex flex-col items-center justify-center font-mono select-none">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-xs uppercase tracking-widest">Connecting to ProTimer Multi FS Engine...</span>
      </div>
    );
  }

  // Blackout mode
  if (payload.isBlackout) {
    return (
      <div
        className="h-screen w-screen bg-black cursor-none relative"
        onMouseMove={() => setShowControls(true)}
      >
        {showControls && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-50 p-2 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-opacity opacity-40 hover:opacity-100 cursor-pointer"
            title="Exit Multi FS (Escape)"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  const listSummaries: ListActiveCueSummary[] = payload.listActiveCues && payload.listActiveCues.length > 0
    ? payload.listActiveCues
    : [
        {
          listId: payload.activeListId || 'list_1',
          listName: 'Active List',
          isCurrentOperatorList: true,
          activeTimer: payload.activeTimer,
          nextTimer: payload.nextTimer,
          status: payload.status,
          secondsRemaining: payload.secondsRemaining,
          totalDurationSeconds: payload.totalDurationSeconds,
          formattedTime: payload.formattedTime,
          isOvertime: payload.isOvertime,
          progressPercent: payload.progressPercent,
          alertColor: payload.alertColor,
          alertFlash: payload.alertFlash,
          alertOnOff: payload.alertOnOff,
          activeAlertLevel: payload.activeAlertLevel,
          totalCuesCount: 1,
          runningCuesCount: payload.status === 'running' || payload.status === 'overtime' ? 1 : 0,
          backgroundImageUrl: payload.backgroundImageUrl,
        },
      ];

  const totalLists = listSummaries.length;
  const totalRunningLists = listSummaries.filter(
    (l) => l.status === 'running' || l.status === 'overtime'
  ).length;
  const backgroundFit = payload.backgroundFit || localPrefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? localPrefs.backgroundImageOpacity ?? 100;

  // Dynamic responsive grid layout based on number of list tabs
  const getGridClass = (count: number): string => {
    if (count === 1) return 'grid-cols-1 grid-rows-1';
    if (count === 2) return 'grid-cols-1 lg:grid-cols-2 grid-rows-2 lg:grid-rows-1';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2 md:grid-rows-2';
    if (count <= 6) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';
  };

  // Dynamic font size for timer digits based on number of list tabs
  const getTimerFontSize = (count: number): string => {
    if (count === 1) return 'text-8xl sm:text-[11rem] md:text-[15rem]';
    if (count === 2) return 'text-6xl sm:text-8xl xl:text-9xl';
    if (count <= 4) return 'text-5xl sm:text-7xl xl:text-8xl';
    return 'text-4xl sm:text-6xl xl:text-7xl';
  };

  return (
    <div
      className="h-screen w-screen bg-[#05070b] text-white flex flex-col p-4 sm:p-6 select-none font-mono relative overflow-hidden"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Top Broadcast Multiview Header */}
      <header className="flex items-center justify-between border-b border-[#182030] pb-3 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider">MULTI FS</span>
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold tracking-wider uppercase text-white">
              ALL LIST TABS — ACTIVE CUE MULTIVIEW
            </h1>
            <p className="text-[11px] text-neutral-400">
              {totalLists} Cue {totalLists === 1 ? 'List' : 'Lists'} • {totalRunningLists} Active Running
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold block">
              SYSTEM CLOCK
            </span>
            <span className="text-xl sm:text-2xl font-bold text-cyan-400 tabular-nums">
              {payload.clockTimeFormatted}
            </span>
          </div>
        </div>
      </header>

      {/* Multiview Grid: One Panel per Cue List Tab */}
      <div className={`flex-1 grid gap-4 min-h-0 overflow-y-auto ${getGridClass(totalLists)}`}>
        {listSummaries.map((item, idx) => {
          const isRunning = item.status === 'running' || item.status === 'overtime';
          const isPaused = item.status === 'paused';
          const isOvertime = item.isOvertime;
          const isDanger = item.activeAlertLevel === 'danger';
          const isWarning = item.activeAlertLevel === 'warning';

          let cardBg = 'bg-black border-[#1c2638]';
          if (isOvertime || (isDanger && item.alertFlash)) {
            cardBg = 'bg-black border-red-500/80';
          } else if (isWarning && item.alertFlash) {
            cardBg = 'bg-black border-amber-500/80';
          } else if (isRunning) {
            cardBg = 'bg-black border-emerald-500/60';
          } else if (item.isCurrentOperatorList) {
            cardBg = 'bg-black border-cyan-500/50';
          }

          const displayTime = isOvertime
            ? `+${item.formattedTime.replace(/^[+-]/, '')}`
            : item.formattedTime.replace(/^-/, '+');

          const listBackgroundUrl =
            (item.backgroundImageUrl !== undefined && item.backgroundImageUrl !== ''
              ? item.backgroundImageUrl
              : resolveBackgroundImageForList(localPrefs, item.listId)) || '';

          return (
            <div
              key={item.listId}
              className={`rounded-xl border-2 p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 relative overflow-hidden ${cardBg}`}
            >
              {/* Independent Per-List Background Image (pure black bg-black when none or removed) */}
              {listBackgroundUrl && (
                <img
                  src={listBackgroundUrl}
                  alt=""
                  className={`absolute inset-0 w-full h-full pointer-events-none select-none z-0 ${
                    backgroundFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                  style={{
                    opacity: Math.min(1, Math.max(0, backgroundOpacity / 100)),
                  }}
                />
              )}

              {/* Panel Top Bar: List Tab Name & Status Badge */}
              <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-white/10 text-neutral-300 shrink-0">
                    TAB {idx + 1}
                  </span>
                  <h2 className="text-base sm:text-lg font-extrabold text-white truncate drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                    {item.listName}
                  </h2>
                  {item.isCurrentOperatorList && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0">
                      Focused Tab
                    </span>
                  )}
                </div>

                {/* Live Status Pill */}
                <div className="flex items-center gap-2 shrink-0">
                  {isOvertime ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase bg-red-500/25 text-red-300 border border-red-500/50 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      OVERTIME
                    </span>
                  ) : isRunning ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                      RUNNING
                    </span>
                  ) : isPaused ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      <Pause className="w-3 h-3 fill-amber-400 text-amber-400" />
                      PAUSED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold uppercase bg-neutral-800 text-neutral-400 border border-neutral-700">
                      <Clock className="w-3 h-3 text-neutral-400" />
                      CUED
                    </span>
                  )}
                </div>
              </div>

              {/* Active Cue Title & Digits */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-3 text-center">
                <div className="w-full mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-300 font-semibold block drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                    {isRunning ? 'ACTIVE RUNNING CUE' : isPaused ? 'PAUSED CUE' : 'ACTIVE / CUED TIMER'}
                  </span>
                  <div className="text-lg sm:text-2xl font-bold text-white truncate px-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                    {item.activeTimer ? item.activeTimer.name || 'Untitled Cue' : 'No Cues in List'}
                  </div>
                  {item.activeTimer?.notes && (
                    <div className="text-xs text-cyan-400 font-medium truncate">
                      {item.activeTimer.notes}
                    </div>
                  )}
                </div>

                {/* Main Timer Readout */}
                <div
                  className={`${getTimerFontSize(totalLists)} font-black tracking-tighter tabular-nums leading-none my-1 ${
                    listBackgroundUrl ? 'drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]' : ''
                  } ${
                    isOvertime
                      ? 'text-red-500 animate-overtime-blink'
                      : item.alertOnOff
                      ? 'animate-overtime-blink'
                      : item.alertFlash
                      ? 'animate-pulse'
                      : 'text-white'
                  }`}
                  style={item.alertColor ? { color: item.alertColor } : undefined}
                >
                  {displayTime}
                </div>
              </div>

              {/* Progress Bar & Next Cue Footer */}
              <div className="relative z-10 pt-2 border-t border-white/10">
                {/* Progress Bar */}
                <div className="w-full h-2 bg-neutral-900/90 rounded-full overflow-hidden mb-2.5 border border-white/5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isOvertime || isDanger
                        ? 'bg-red-500'
                        : isWarning
                        ? 'bg-amber-500'
                        : isRunning
                        ? 'bg-emerald-500'
                        : 'bg-cyan-500/60'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, item.progressPercent))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-300 gap-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                  <div className="truncate">
                    <span className="text-neutral-400 uppercase font-semibold mr-1.5">NEXT:</span>
                    <span className="text-white font-medium">
                      {item.nextTimer ? item.nextTimer.name || 'Untitled Cue' : 'End of List'}
                    </span>
                  </div>
                  <div className="shrink-0 text-[11px] text-neutral-300 font-mono">
                    {item.totalCuesCount} {item.totalCuesCount === 1 ? 'Cue' : 'Cues'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover Close Button */}
      {showControls && (
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2.5 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-all border border-neutral-700 shadow-xl cursor-pointer z-50"
          title="Exit Multi FS (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Stage Messages Overlay */}
      <MessageOverlay message={payload.activeMessage} />
    </div>
  );
};
