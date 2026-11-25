/**
 * Multi Preview Pop-Out Display (`/?display=multi_preview`).
 * Frameless, always-on-top, freely resizable pop-out window that displays
 * the list of all active Cue List tabs simultaneously with live countdowns,
 * status badges, progress bars, next cues, and independent per-list transport controls.
 * Completely independent from the single Preview window.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import {
  Play,
  Pause,
  Square,
  ChevronRight,
  Plus,
  Minus,
  Sliders,
  Layers,
  X,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { MessageOverlay } from '../messages/MessageOverlay';
import {
  ListActiveCueSummary,
  resolveBackgroundImageForList,
  resolveLogoImageForList,
} from '../types';
import { formatClock, formatSeconds } from '../utilities/timeFormatters';
import {
  getLogoLocationClasses,
  getTargetElements,
  getTargetExtras,
  getTargetShadowCss,
  renderTimeWithColonOffset,
  resolveDisplayDigitColor,
  resolveFontFamily,
  resolveFontStyleCss,
  sanitizeImageUrl,
  useLivePreferences,
} from '../utilities/displayStyleHelper';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;

export const MultiPreviewDisplay: React.FC = () => {
  const { payload, sendRemoteCommand } = useDisplaySync(true);
  const localPrefs = useLivePreferences(payload?.preferences);
  const [incrementSeconds, setIncrementSeconds] = useState(60);
  const [showStepMenu, setShowStepMenu] = useState(false);
  const [stepMenuPos, setStepMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 540,
    height: typeof window !== 'undefined' ? window.innerHeight : 360,
  }));

  const stepBtnRef = useRef<HTMLButtonElement>(null);
  const stepMenuRef = useRef<HTMLDivElement>(null);

  const dragStateRef = useRef<{
    type: 'move' | 'resize';
    dir?: ResizeDirection;
    startScreenX: number;
    startScreenY: number;
    startBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const dx = e.screenX - state.startScreenX;
      const dy = e.screenY - state.startScreenY;
      const { startBounds } = state;

      if (state.type === 'move') {
        const nextBounds = {
          x: startBounds.x + dx,
          y: startBounds.y + dy,
          width: startBounds.width,
          height: startBounds.height,
        };
        if (window.electronAPI?.setCurrentWindowBounds) {
          window.electronAPI.setCurrentWindowBounds(nextBounds);
        } else {
          window.moveTo(nextBounds.x, nextBounds.y);
        }
        return;
      }

      if (state.type === 'resize' && state.dir) {
        let newX = startBounds.x;
        let newY = startBounds.y;
        let newW = startBounds.width;
        let newH = startBounds.height;

        if (state.dir.includes('e')) {
          newW = Math.max(MIN_WIDTH, startBounds.width + dx);
        }
        if (state.dir.includes('s')) {
          newH = Math.max(MIN_HEIGHT, startBounds.height + dy);
        }
        if (state.dir.includes('w')) {
          const proposedW = startBounds.width - dx;
          if (proposedW >= MIN_WIDTH) {
            newW = proposedW;
            newX = startBounds.x + dx;
          } else {
            newW = MIN_WIDTH;
            newX = startBounds.x + (startBounds.width - MIN_WIDTH);
          }
        }
        if (state.dir.includes('n')) {
          const proposedH = startBounds.height - dy;
          if (proposedH >= MIN_HEIGHT) {
            newH = proposedH;
            newY = startBounds.y + dy;
          } else {
            newH = MIN_HEIGHT;
            newY = startBounds.y + (startBounds.height - MIN_HEIGHT);
          }
        }

        const nextBounds = { x: newX, y: newY, width: newW, height: newH };
        if (window.electronAPI?.setCurrentWindowBounds) {
          window.electronAPI.setCurrentWindowBounds(nextBounds);
        } else {
          window.moveTo(newX, newY);
          window.resizeTo(newW, newH);
        }
      }
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

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

  const startMove = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setShowStepMenu(false);
    const startScreenX = e.screenX;
    const startScreenY = e.screenY;
    let currentBounds = {
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth || window.innerWidth,
      height: window.outerHeight || window.innerHeight,
    };
    if (window.electronAPI?.getCurrentWindowBounds) {
      const b = await window.electronAPI.getCurrentWindowBounds();
      if (b) currentBounds = b;
    }
    dragStateRef.current = {
      type: 'move',
      startScreenX,
      startScreenY,
      startBounds: currentBounds,
    };
  };

  const startResize = (dir: ResizeDirection) => async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowStepMenu(false);
    const startScreenX = e.screenX;
    const startScreenY = e.screenY;
    let currentBounds = {
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth || window.innerWidth,
      height: window.outerHeight || window.innerHeight,
    };
    if (window.electronAPI?.getCurrentWindowBounds) {
      const b = await window.electronAPI.getCurrentWindowBounds();
      if (b) currentBounds = b;
    }
    dragStateRef.current = {
      type: 'resize',
      dir,
      startScreenX,
      startScreenY,
      startBounds: currentBounds,
    };
  };

  if (!payload) {
    return <div className="h-screen w-screen bg-black select-none" />;
  }

  const listSummaries: ListActiveCueSummary[] =
    payload.listActiveCues && payload.listActiveCues.length > 0
      ? payload.listActiveCues
      : [
          {
            listId: payload.activeListId || 'list_1',
            listName: payload.activeListName || 'List 1',
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
            logoImageUrl: payload.logoImageUrl,
          },
        ];

  const mtElements = getTargetElements(localPrefs, 'multitimer');
  const mtExtras = getTargetExtras(localPrefs, 'multitimer');
  const textShadowStyle = getTargetShadowCss(mtExtras);

  const countdownCfg = mtElements.countdown;
  const nameCfg = mtElements.name;
  const progressBarCfg = mtElements.progress_bar;
  const logoCfg = mtElements.logo;

  const formattedClock = formatClock(new Date(), undefined, localPrefs);
  const backgroundFit = payload.backgroundFit || localPrefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? localPrefs.backgroundImageOpacity ?? 100;
  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  const totalLists = listSummaries.length;
  const totalRunning = listSummaries.filter(
    (c) => c.status === 'running' || c.status === 'overtime'
  ).length;
  const useTwoColGrid = viewport.width >= 480 && totalLists > 1;

  const formatStepShort = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}`;
  };

  const formatStepLabel = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}m`;
  };

  const handleCloseWindow = () => {
    if (window.electronAPI?.closeMultiPreviewWindow) {
      window.electronAPI.closeMultiPreviewWindow();
    } else {
      window.close();
    }
  };

  return (
    <div
      className={`h-screen w-screen bg-[#06090f] text-white flex flex-col justify-between font-mono select-none overflow-hidden relative border-2 ${
        mtElements.border?.visible ? 'border-cyan-400' : 'border-cyan-500/70'
      }`}
    >
      {/* 8-DIRECTION EDGE & CORNER RESIZE HANDLES */}
      <div
        onMouseDown={startResize('n')}
        className="absolute top-0 left-2 right-2 h-1.5 cursor-ns-resize z-30"
      />
      <div
        onMouseDown={startResize('s')}
        className="absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize z-30"
      />
      <div
        onMouseDown={startResize('w')}
        className="absolute left-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-30"
      />
      <div
        onMouseDown={startResize('e')}
        className="absolute right-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-30"
      />
      <div
        onMouseDown={startResize('nw')}
        className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-40"
      />
      <div
        onMouseDown={startResize('ne')}
        className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-40"
      />
      <div
        onMouseDown={startResize('sw')}
        className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-40"
      />
      <div
        onMouseDown={startResize('se')}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-40"
      />

      {/* Draggable Header Bar */}
      <div
        onMouseDown={startMove}
        className="h-9 px-2.5 bg-[#0c111b] border-b border-[#1d2738] flex items-center justify-between gap-2 cursor-move shrink-0 z-20"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 shrink-0">
            <Layers className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider">MULTI PREVIEW</span>
          </div>
          <span className="text-[10px] text-neutral-400 truncate">
            {totalLists} {totalLists === 1 ? 'List' : 'Lists'} • {totalRunning} Running
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-cyan-400 font-semibold tabular-nums hidden sm:inline">
            {formattedClock}
          </span>

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
            <span>Step: {formatStepLabel(incrementSeconds)}</span>
          </button>

          <button
            type="button"
            onClick={handleCloseWindow}
            title="Close Multi Preview"
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-[#1c2638] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List of Active List Tabs */}
      {payload.isBlackout ? (
        <div className="flex-1 flex items-center justify-center bg-black">
          <span className="text-xs uppercase tracking-widest text-red-400 font-semibold">
            BLACKOUT ACTIVE
          </span>
        </div>
      ) : (
        <div
          className={`flex-1 p-2 overflow-y-auto min-h-0 grid gap-2 ${
            useTwoColGrid ? 'grid-cols-2 auto-rows-fr' : 'grid-cols-1'
          }`}
        >
          {listSummaries.map((item, idx) => {
            const isRunning = item.status === 'running' || item.status === 'overtime';
            const isPaused = item.status === 'paused';
            const isOvertime = item.isOvertime;
            const isDanger = item.activeAlertLevel === 'danger';
            const isWarning = item.activeAlertLevel === 'warning';
            const isFocused = item.listId === payload.activeListId || item.isCurrentOperatorList;

            let cardBorder = 'border-[#1d2738]';
            if (isOvertime || (isDanger && item.alertFlash)) {
              cardBorder = 'border-red-500/85';
            } else if (isWarning && item.alertFlash) {
              cardBorder = 'border-amber-500/80';
            } else if (isRunning) {
              cardBorder = 'border-emerald-500/70';
            } else if (isFocused) {
              cardBorder = 'border-cyan-500/60';
            }

            const formattedItemTime = formatSeconds(
              item.secondsRemaining,
              true,
              isOvertime,
              localPrefs
            );
            const cleanTime = formattedItemTime.replace(/^[+-]/, '');
            const displayTime = payload.isClockMode
              ? formattedClock
              : isOvertime
              ? `+${cleanTime}`
              : cleanTime;

            const resolvedItemDigitColor = resolveDisplayDigitColor({
              isOvertime,
              isPaused,
              activeAlertLevel: item.activeAlertLevel,
              alertColor: item.alertColor,
              prefs: localPrefs,
            });

            const hasExplicitItemBgEntry = Boolean(
              localPrefs.listBackgroundImages &&
                Object.prototype.hasOwnProperty.call(localPrefs.listBackgroundImages, item.listId)
            );
            const resolvedFromPrefs = sanitizeImageUrl(
              resolveBackgroundImageForList(localPrefs, item.listId)
            );
            const listBackgroundUrl =
              hasExplicitItemBgEntry && !resolvedFromPrefs
                ? ''
                : resolvedFromPrefs || sanitizeImageUrl(item.backgroundImageUrl);

            const hasExplicitItemLogoEntry = Boolean(
              localPrefs.listLogoImages &&
                Object.prototype.hasOwnProperty.call(localPrefs.listLogoImages, item.listId)
            );
            const resolvedListLogoFromPrefs = sanitizeImageUrl(
              resolveLogoImageForList(localPrefs, item.listId)
            );
            const listLogoUrl =
              hasExplicitItemLogoEntry && !resolvedListLogoFromPrefs
                ? ''
                : resolvedListLogoFromPrefs || sanitizeImageUrl(item.logoImageUrl);

            const cardWidthEstimate = useTwoColGrid ? viewport.width / 2 - 16 : viewport.width - 24;
            const digitFontSizePx = Math.max(
              18,
              Math.min(44, Math.round(cardWidthEstimate * 0.145))
            );

            return (
              <div
                key={item.listId}
                className={`rounded-lg border ${cardBorder} bg-[#0b0f18] flex flex-col justify-between p-2 relative overflow-hidden transition-all`}
                style={{
                  backgroundColor: listBackgroundUrl
                    ? '#000000'
                    : mtExtras?.bgKeyColor || '#090d15',
                }}
              >
                {listBackgroundUrl && (
                  <img
                    src={listBackgroundUrl}
                    alt=""
                    decoding="sync"
                    draggable={false}
                    className={`absolute inset-0 w-full h-full pointer-events-none select-none z-0 ${
                      backgroundFit === 'contain' ? 'object-contain' : 'object-cover'
                    }`}
                    style={{
                      opacity: Math.min(1, Math.max(0, backgroundOpacity / 100)),
                    }}
                  />
                )}

                {listLogoUrl && (
                  <img
                    src={listLogoUrl}
                    alt="List Logo"
                    decoding="sync"
                    draggable={false}
                    className={`absolute z-10 object-contain pointer-events-none select-none ${getLogoLocationClasses(
                      logoCfg?.location
                    )}`}
                    style={{
                      height: '18px',
                      maxWidth: '64px',
                    }}
                  />
                )}

                {/* Card Top Header: List Tab Name + Per-List Controls */}
                <div className="relative z-10 flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5">
                  <button
                    type="button"
                    onClick={() => sendRemoteCommand('SWITCH_LIST', { listId: item.listId })}
                    title={`Switch Console to ${item.listName}`}
                    className="flex items-center gap-1.5 min-w-0 text-left hover:opacity-90 cursor-pointer"
                  >
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-white/10 text-neutral-300 shrink-0">
                      #{idx + 1}
                    </span>
                    <span
                      className="text-xs font-bold text-white truncate"
                      style={{ fontFamily: resolveFontFamily(nameCfg?.font) }}
                    >
                      {item.listName}
                    </span>
                    {isFocused && (
                      <span className="px-1.5 py-0.2 text-[8px] font-bold uppercase rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0">
                        ACTIVE TAB
                      </span>
                    )}
                  </button>

                  {/* Per-List Transport & Step Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => sendRemoteCommand('START', { listId: item.listId })}
                      title={`Start (${item.listName})`}
                      className="p-1 bg-emerald-600/25 hover:bg-emerald-600/45 text-emerald-400 rounded border border-emerald-500/40 cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-emerald-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => sendRemoteCommand('PAUSE', { listId: item.listId })}
                      title={`Pause / Resume (${item.listName})`}
                      className={`p-1 rounded border cursor-pointer ${
                        isPaused
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-amber-600/25 hover:bg-amber-600/45 text-amber-400 border-amber-500/40'
                      }`}
                    >
                      <Pause
                        className={`w-2.5 h-2.5 ${isPaused ? 'fill-black' : 'fill-amber-400'}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => sendRemoteCommand('STOP', { listId: item.listId })}
                      title={`Stop (${item.listName})`}
                      className="p-1 bg-red-600/25 hover:bg-red-600/45 text-red-400 rounded border border-red-500/40 cursor-pointer"
                    >
                      <Square className="w-2.5 h-2.5 fill-red-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => sendRemoteCommand('MOVE_NEXT', { listId: item.listId })}
                      title={`Next Cue (${item.listName})`}
                      className="p-1 bg-cyan-600/25 hover:bg-cyan-600/45 text-cyan-400 rounded border border-cyan-500/40 cursor-pointer"
                    >
                      <ChevronRight className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sendRemoteCommand('ADJUST_DURATION', {
                          listId: item.listId,
                          secondsDelta: incrementSeconds,
                        })
                      }
                      title={`Add ${formatStepLabel(incrementSeconds)} (${item.listName})`}
                      className="px-1 py-0.5 h-[20px] bg-[#161e2e] hover:bg-[#1f2b42] text-emerald-400 rounded border border-[#2a3852] text-[9px] font-bold flex items-center cursor-pointer"
                    >
                      <Plus className="w-2 h-2 stroke-[2.5]" />
                      <span>{formatStepShort(incrementSeconds)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sendRemoteCommand('ADJUST_DURATION', {
                          listId: item.listId,
                          secondsDelta: -incrementSeconds,
                        })
                      }
                      title={`Subtract ${formatStepLabel(incrementSeconds)} (${item.listName})`}
                      className="px-1 py-0.5 h-[20px] bg-[#161e2e] hover:bg-[#1f2b42] text-amber-400 rounded border border-[#2a3852] text-[9px] font-bold flex items-center cursor-pointer"
                    >
                      <Minus className="w-2 h-2 stroke-[2.5]" />
                      <span>{formatStepShort(incrementSeconds)}</span>
                    </button>
                  </div>
                </div>

                {/* Center Active Cue Name & Countdown Readout */}
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center py-1.5 text-center">
                  <div
                    className="text-[10px] text-cyan-300 font-semibold truncate max-w-full px-1"
                    style={{
                      fontFamily: resolveFontFamily(nameCfg?.font),
                      textShadow: textShadowStyle,
                    }}
                  >
                    {item.activeTimer ? item.activeTimer.name || 'Untitled Cue' : 'No Cues in List'}
                  </div>

                  <div
                    style={{
                      fontSize: `${digitFontSizePx}px`,
                      color: resolvedItemDigitColor,
                      fontFamily: resolveFontFamily(countdownCfg?.font),
                      ...resolveFontStyleCss(countdownCfg?.fontStyle),
                      textShadow: textShadowStyle,
                    }}
                    className={`tracking-tighter tabular-nums leading-none my-0.5 ${
                      isOvertime
                        ? 'animate-overtime-blink'
                        : item.alertOnOff
                        ? 'animate-overtime-blink'
                        : item.alertFlash && localPrefs.flashAlertsEnabled !== false
                        ? 'animate-pulse'
                        : ''
                    }`}
                  >
                    {renderTimeWithColonOffset(
                      displayTime,
                      mtElements.colon?.vert,
                      mtElements.countdown?.spacing,
                      mtElements.colon?.horiz
                    )}
                  </div>
                </div>

                {/* Card Footer: Progress Bar + Status & Next Cue */}
                <div className="relative z-10 pt-1 border-t border-white/10">
                  {showProgressBar && (
                    <div className="bg-neutral-900 rounded-full overflow-hidden mb-1 h-1.5 w-full">
                      <div
                        className={`h-full transition-all duration-200 ${
                          isOvertime || isDanger
                            ? 'bg-red-500'
                            : isWarning
                            ? 'bg-amber-500'
                            : isRunning
                            ? 'bg-emerald-500'
                            : isPaused
                            ? 'bg-amber-500'
                            : 'bg-cyan-500/60'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, item.progressPercent))}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[9.5px] text-neutral-400 gap-2">
                    <span
                      className={`inline-flex items-center gap-1 uppercase font-bold ${
                        isOvertime
                          ? 'text-red-400'
                          : isRunning
                          ? 'text-emerald-400'
                          : isPaused
                          ? 'text-amber-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {isOvertime ? (
                        <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                      ) : isRunning ? (
                        <Play className="w-2.5 h-2.5 fill-emerald-400 text-emerald-400" />
                      ) : isPaused ? (
                        <Pause className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      ) : (
                        <Clock className="w-2.5 h-2.5 text-cyan-400" />
                      )}
                      <span>{isOvertime ? 'OVERTIME' : item.status}</span>
                    </span>

                    <span className="truncate max-w-[65%]">
                      Next:{' '}
                      <span className="text-neutral-200">{item.nextTimer?.name || 'End'}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      <MessageOverlay
        message={payload.activeMessage}
        config={mtElements.message}
        compact
        textShadow={textShadowStyle}
      />
    </div>
  );
};
