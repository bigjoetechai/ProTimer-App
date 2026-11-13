/**
 * Preview Pop-Out Display.
 * Frameless, always-on-top, freely resizable window without minimize/restore/close buttons.
 * Toggled on and off directly via the Preview button on the main console.
 * Includes Start, Pause, Stop, Next Cue, +Step, -Step, and Step controls.
 * Supports dragging via the header bar and 8-direction edge/corner resizing.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { Play, Pause, Square, ChevronRight, Plus, Minus, Sliders, Pin } from 'lucide-react';
import { MessageOverlay } from '../messages/MessageOverlay';
import { resolveBackgroundImageForList, resolveLogoImageForList } from '../types';
import { formatClock, formatDate, formatSeconds } from '../utilities/timeFormatters';
import {
  getElementOffsetTransform,
  getLogoLocationClasses,
  getTargetCanvasStyles,
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

const MIN_WIDTH = 150;
const MIN_HEIGHT = 90;

export const PreviewDisplay: React.FC = () => {
  const { payload, sendRemoteCommand } = useDisplaySync(true);
  const localPrefs = useLivePreferences(payload?.preferences);
  const [incrementSeconds, setIncrementSeconds] = useState(60);
  const [showStepMenu, setShowStepMenu] = useState(false);
  const [stepMenuPos, setStepMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 360,
    height: typeof window !== 'undefined' ? window.innerHeight : 240,
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

  const isOvertime = payload.isOvertime;
  const isRunning = payload.status === 'running' || payload.status === 'overtime';
  const isPaused = payload.status === 'paused';

  const fsElements = getTargetElements(localPrefs, 'fullscreen_ndi_preview');
  const fsExtras = getTargetExtras(localPrefs, 'fullscreen_ndi_preview');
  const textShadowStyle = getTargetShadowCss(fsExtras);

  const countdownCfg = fsElements.countdown;
  const nameCfg = fsElements.name;
  const clockCfg = fsElements.clock;
  const dateCfg = fsElements.date;
  const progressBarCfg = fsElements.progress_bar;
  const logoCfg = fsElements.logo;
  const slideTextCfg = fsElements.slide_text;

  const formattedClock = formatClock(new Date(), undefined, localPrefs);
  const formattedDate = payload.dateFormatted || formatDate(new Date(), localPrefs);
  const formattedCountdown = formatSeconds(
    payload.secondsRemaining,
    true,
    isOvertime,
    localPrefs
  );

  const displayTime = payload.isClockMode
    ? formattedClock
    : isOvertime
    ? `+${formattedCountdown.replace(/^[+-]/, '')}`
    : formattedCountdown.replace(/^-/, '+');

  const countdownScale = Math.max(0.2, (countdownCfg?.sizePercent ?? 113) / 113);
  const nameScale = Math.max(0.2, (nameCfg?.sizePercent ?? 33) / 33);
  const clockScale = Math.max(0.2, (clockCfg?.sizePercent ?? 33) / 33);
  const dateScale = Math.max(0.2, (dateCfg?.sizePercent ?? 33) / 33);
  const logoScale = Math.max(0.2, (logoCfg?.sizePercent ?? 20) / 20);

  const baseFontSizePx = Math.max(
    18,
    Math.min(viewport.width * 0.165, Math.max(40, viewport.height - 76) * 0.52)
  );
  const computedFontSizePx = Math.max(14, Math.round(baseFontSizePx * countdownScale));

  const resolvedDigitColor = resolveDisplayDigitColor({
    isOvertime,
    isPaused,
    activeAlertLevel: payload.activeAlertLevel,
    alertColor: payload.alertColor,
    prefs: localPrefs,
  });

  const activeListId = payload.activeListId || 'list_1';
  const hasExplicitListBgEntry = Boolean(
    localPrefs.listBackgroundImages &&
      Object.prototype.hasOwnProperty.call(localPrefs.listBackgroundImages, activeListId)
  );
  const resolvedFromPrefs = sanitizeImageUrl(resolveBackgroundImageForList(localPrefs, activeListId));
  const activeBackgroundImageUrl =
    hasExplicitListBgEntry && !resolvedFromPrefs
      ? ''
      : resolvedFromPrefs || sanitizeImageUrl(payload.backgroundImageUrl);

  const backgroundFit = payload.backgroundFit || localPrefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? localPrefs.backgroundImageOpacity ?? 100;

  const hasExplicitListLogoEntry = Boolean(
    localPrefs.listLogoImages &&
      Object.prototype.hasOwnProperty.call(localPrefs.listLogoImages, activeListId)
  );
  const resolvedLogoFromPrefs = sanitizeImageUrl(resolveLogoImageForList(localPrefs, activeListId));
  const activeLogoUrl =
    hasExplicitListLogoEntry && !resolvedLogoFromPrefs
      ? ''
      : resolvedLogoFromPrefs || sanitizeImageUrl(payload.logoImageUrl);

  const { outerStyle, innerTransformStyle } = getTargetCanvasStyles(
    fsExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  const formatStepShort = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}`;
  };

  const formatStepLabel = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}m`;
  };

  return (
    <div
      className={`h-screen w-screen bg-black text-white flex flex-col justify-between p-2 font-mono select-none overflow-hidden relative border-2 ${
        fsElements.border?.visible ? 'border-cyan-400' : 'border-cyan-500/60'
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

      {/* Draggable Header & Controls Bar (No minimize, restore, or close buttons) */}
      <div
        onMouseDown={startMove}
        className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-[#1c2536] cursor-move shrink-0 z-20"
      >
        <div className="flex items-center gap-1 min-w-0">
          <Pin className="w-3 h-3 text-cyan-400 shrink-0" />
          {nameCfg?.visible !== false && (
            <span
              className="text-cyan-400 uppercase tracking-wider truncate"
              style={{
                fontFamily: resolveFontFamily(nameCfg?.font),
                ...resolveFontStyleCss(nameCfg?.fontStyle),
                fontSize: `${Math.max(9, Math.min(16, Math.round(11 * nameScale)))}px`,
              }}
            >
              {payload.activeTimer?.name || 'PREVIEW'}
            </span>
          )}
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

          {/* +Step, -Step, and Step size */}
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
      <div
        className="relative flex-1 flex flex-col items-center justify-center min-h-0 my-1 overflow-hidden rounded"
        style={outerStyle}
      >
        {activeBackgroundImageUrl && (
          <img
            src={activeBackgroundImageUrl}
            alt=""
            decoding="sync"
            draggable={false}
            className={`absolute inset-0 w-full h-full pointer-events-none select-none z-0 ${
              backgroundFit === 'contain' ? 'object-contain' : 'object-cover'
            }`}
            style={{
              opacity: Math.min(1, Math.max(0, backgroundOpacity / 100)),
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            }}
          />
        )}

        {activeLogoUrl && (
          <img
            src={activeLogoUrl}
            alt="Logo"
            decoding="sync"
            draggable={false}
            className={`absolute z-10 object-contain pointer-events-none select-none ${getLogoLocationClasses(
              logoCfg?.location
            )}`}
            style={{
              height: `${Math.round(24 * logoScale)}px`,
              maxWidth: `${Math.round(90 * logoScale)}px`,
              transform: getElementOffsetTransform(logoCfg, 1),
            }}
          />
        )}

        {payload.isBlackout ? (
          <span className="relative z-10 text-xs uppercase tracking-widest text-red-400 font-semibold">
            BLACKOUT ACTIVE
          </span>
        ) : (
          <div
            className="relative z-10 flex flex-col items-center justify-center w-full"
            style={innerTransformStyle}
          >
            {(clockCfg?.visible || dateCfg?.visible) && (
              <div className="flex items-center justify-center gap-2 mb-0.5">
                {clockCfg?.visible && (
                  <span
                    className="text-neutral-200 tabular-nums"
                    style={{
                      fontFamily: resolveFontFamily(clockCfg?.font),
                      ...resolveFontStyleCss(clockCfg?.fontStyle),
                      fontSize: `${Math.max(9, Math.round(11 * clockScale))}px`,
                      textShadow: textShadowStyle,
                    }}
                  >
                    {formattedClock}
                  </span>
                )}
                {dateCfg?.visible && (
                  <span
                    className="text-neutral-300"
                    style={{
                      fontFamily: resolveFontFamily(dateCfg?.font),
                      ...resolveFontStyleCss(dateCfg?.fontStyle),
                      fontSize: `${Math.max(9, Math.round(10 * dateScale))}px`,
                      textShadow: textShadowStyle,
                    }}
                  >
                    {formattedDate}
                  </span>
                )}
              </div>
            )}

            {countdownCfg?.visible !== false && (
              <div
                style={{
                  fontSize: `${computedFontSizePx}px`,
                  color: resolvedDigitColor,
                  fontFamily: resolveFontFamily(countdownCfg?.font),
                  ...resolveFontStyleCss(countdownCfg?.fontStyle),
                  textShadow: textShadowStyle,
                  transform: getElementOffsetTransform(countdownCfg, 1.5),
                }}
                className={`tracking-tighter tabular-nums leading-none ${
                  localPrefs.smoothTransitions !== false ? 'transition-colors duration-300' : ''
                } ${
                  isOvertime
                    ? 'animate-overtime-blink'
                    : payload.alertOnOff
                    ? 'animate-overtime-blink'
                    : payload.alertFlash && localPrefs.flashAlertsEnabled !== false
                    ? 'animate-pulse'
                    : ''
                }`}
              >
                {renderTimeWithColonOffset(displayTime, fsElements.colon?.vert)}
              </div>
            )}

            {slideTextCfg?.visible && payload.activeTimer?.notes && (
              <div
                className="text-cyan-300 truncate max-w-full mt-0.5"
                style={{
                  fontFamily: resolveFontFamily(slideTextCfg?.font),
                  ...resolveFontStyleCss(slideTextCfg?.fontStyle),
                  fontSize: `${Math.max(9, Math.round(11 * ((slideTextCfg.sizePercent ?? 33) / 33)))}px`,
                  textShadow: textShadowStyle,
                }}
              >
                {payload.activeTimer.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Status & Progress Bar */}
      <div className="pt-1 border-t border-[#1c2536] shrink-0 z-20">
        {showProgressBar && (
          <div
            className="bg-neutral-900 rounded-full overflow-hidden mb-1 mx-auto"
            style={{
              height: `${Math.max(4, Math.min(12, Math.round((localPrefs.progressBarHeightPx ?? 12) * 0.5)))}px`,
              width: `${Math.min(100, Math.max(15, progressBarCfg?.sizePercent ?? 100))}%`,
            }}
          >
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
        )}
        <div
          className="flex items-center justify-between text-[10px] text-neutral-400"
          style={{
            fontFamily: resolveFontFamily(nameCfg?.font),
          }}
        >
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

      <MessageOverlay
        message={payload.activeMessage}
        config={fsElements.message}
        compact
        textShadow={textShadowStyle}
      />
    </div>
  );
};
