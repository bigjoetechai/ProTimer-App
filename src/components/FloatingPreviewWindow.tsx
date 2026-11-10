/**
 * Always-On-Top Resizable Preview Pop-Out Screen (Default: 360 x 240 pixels).
 * - Stays always on top of the screen (z-[9999]).
 * - Resizable from all 8 edges and corners (N, S, E, W, NE, NW, SE, SW) by dragging.
 * - Draggable anywhere on screen via its header bar.
 * - Displays the active timer time in real time with Start, Pause, Stop, Next, +Step, -Step, and Step selector controls.
 * - Applies all Preferences: Fonts, Font Styles, Sizes & Positions, Colon Offset, Shadow, Crop & Scale,
 *   Colors & Animations, Progress Bar, Background Image, and Logo.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  ChevronRight,
  Plus,
  Minus,
  Sliders,
  X,
  Pin,
  ExternalLink,
} from 'lucide-react';
import {
  TimerItem,
  TimerStatus,
  resolveBackgroundImageForList,
  resolveLogoImageForList,
} from '../types';
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
  useLivePreferences,
} from '../utilities/displayStyleHelper';

interface FloatingPreviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  onPopOutWindow?: () => void;
  timeStr: string;
  currentSeconds?: number;
  activeListId?: string;
  activeAlertLevel?: 'none' | 'warning' | 'danger';
  status: TimerStatus;
  isOvertime: boolean;
  alertColor?: string;
  isFlash?: boolean;
  isOnOff?: boolean;
  activeTimer: TimerItem | null;
  nextTimerName?: string;
  progressPercent?: number;
  isBlackout?: boolean;
  isClockMode?: boolean;
  clockTimeFormatted?: string;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onNextCue: () => void;
  onAdjustDuration: (secondsDelta: number) => void;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 240;
const MIN_WIDTH = 260;
const MIN_HEIGHT = 150;

export const FloatingPreviewWindow: React.FC<FloatingPreviewWindowProps> = ({
  isOpen,
  onClose,
  onPopOutWindow,
  timeStr,
  currentSeconds,
  activeListId,
  activeAlertLevel = 'none',
  status,
  isOvertime,
  alertColor,
  isFlash = false,
  isOnOff = false,
  activeTimer,
  nextTimerName,
  progressPercent = 0,
  isBlackout = false,
  isClockMode = false,
  clockTimeFormatted,
  onStart,
  onPause,
  onStop,
  onNextCue,
  onAdjustDuration,
}) => {
  const localPrefs = useLivePreferences();

  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number }>(() => {
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(20, winW - DEFAULT_WIDTH - 28),
      y: Math.max(48, winH - DEFAULT_HEIGHT - 96),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  });

  // Step duration increment state (15s, 30s, 60s = 1m, 300s = 5m)
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

  const dragStateRef = useRef<{
    type: 'move' | 'resize';
    dir?: ResizeDirection;
    startX: number;
    startY: number;
    startBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      const { startBounds } = state;

      if (state.type === 'move') {
        const maxX = Math.max(0, window.innerWidth - 80);
        const maxY = Math.max(0, window.innerHeight - 40);
        setBounds({
          ...startBounds,
          x: Math.min(maxX, Math.max(0, startBounds.x + dx)),
          y: Math.min(maxY, Math.max(0, startBounds.y + dy)),
        });
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

        setBounds({
          x: Math.max(0, newX),
          y: Math.max(0, newY),
          width: newW,
          height: newH,
        });
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

  if (!isOpen) return null;

  const startMove = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setShowStepMenu(false);
    dragStateRef.current = {
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { ...bounds },
    };
  };

  const startResize = (dir: ResizeDirection) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowStepMenu(false);
    dragStateRef.current = {
      type: 'resize',
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { ...bounds },
    };
  };

  const formatStepShort = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}`;
  };

  const formatStepLabel = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}m`;
  };

  const isRunning = status === 'running' || status === 'overtime';
  const isPaused = status === 'paused';

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

  const formattedClock = clockTimeFormatted || formatClock(new Date(), undefined, localPrefs);
  const formattedDate = formatDate(new Date(), localPrefs);

  const formattedCountdown =
    currentSeconds !== undefined
      ? formatSeconds(currentSeconds, true, isOvertime, localPrefs)
      : timeStr || '00:00:00';
  const cleanTime = formattedCountdown.replace(/^[+-]/, '');
  const displayTime = isClockMode
    ? formattedClock
    : isOvertime
    ? `+${cleanTime}`
    : cleanTime;

  const countdownScale = Math.max(0.2, (countdownCfg?.sizePercent ?? 113) / 113);
  const nameScale = Math.max(0.2, (nameCfg?.sizePercent ?? 33) / 33);
  const clockScale = Math.max(0.2, (clockCfg?.sizePercent ?? 33) / 33);
  const dateScale = Math.max(0.2, (dateCfg?.sizePercent ?? 33) / 33);
  const logoScale = Math.max(0.2, (logoCfg?.sizePercent ?? 20) / 20);

  // Dynamic font size based on current pop-out width/height and Sizes & Positions countdown.sizePercent
  const baseFontSizePx = Math.max(
    24,
    Math.min(bounds.width * 0.165, (bounds.height - 84) * 0.52)
  );
  const computedFontSizePx = Math.max(14, Math.round(baseFontSizePx * countdownScale));

  const resolvedDigitColor = resolveDisplayDigitColor({
    isOvertime,
    isPaused,
    activeAlertLevel,
    alertColor,
    prefs: localPrefs,
  });

  const activeBackgroundImageUrl = resolveBackgroundImageForList(
    localPrefs,
    activeListId || 'list_1'
  );
  const backgroundFit = localPrefs.backgroundFit || 'cover';
  const backgroundOpacity = localPrefs.backgroundImageOpacity ?? 100;
  const activeLogoUrl = resolveLogoImageForList(localPrefs, activeListId || 'list_1');

  const { outerStyle, innerTransformStyle } = getTargetCanvasStyles(
    fsExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  return (
    <>
      <div
        style={{
          left: `${bounds.x}px`,
          top: `${bounds.y}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`,
        }}
        className={`fixed z-[9999] bg-black text-white rounded-md border-2 ${
          fsElements.border?.visible ? 'border-cyan-400' : 'border-cyan-500/60'
        } shadow-[0_18px_50px_rgba(0,0,0,0.85)] flex flex-col justify-between font-mono select-none overflow-hidden`}
      >
        {/* =====================================================================
            8-DIRECTION EDGE & CORNER RESIZE HANDLES
           ===================================================================== */}
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

        {/* =====================================================================
            DRAGGABLE TITLE & CONTROLS BAR (Always On Top)
           ===================================================================== */}
        <div
          onMouseDown={startMove}
          className="h-9 px-2 bg-[#0c111b] border-b border-[#1d2738] flex items-center justify-between gap-1.5 cursor-move shrink-0 z-20"
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
                {activeTimer?.name || 'PREVIEW'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Transport Controls: Start, Pause, Stop, Next */}
            <button
              type="button"
              onClick={onStart}
              title="Start"
              className="p-1 bg-emerald-600/25 hover:bg-emerald-600/45 text-emerald-400 rounded border border-emerald-500/40 cursor-pointer"
            >
              <Play className="w-2.5 h-2.5 fill-emerald-400" />
            </button>
            <button
              type="button"
              onClick={onPause}
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
              onClick={onStop}
              title="Stop"
              className="p-1 bg-red-600/25 hover:bg-red-600/45 text-red-400 rounded border border-red-500/40 cursor-pointer"
            >
              <Square className="w-2.5 h-2.5 fill-red-400" />
            </button>
            <button
              type="button"
              onClick={onNextCue}
              title="Next Cue"
              className="p-1 bg-cyan-600/25 hover:bg-cyan-600/45 text-cyan-400 rounded border border-cyan-500/40 cursor-pointer"
            >
              <ChevronRight className="w-2.5 h-2.5" />
            </button>

            <div className="h-3.5 w-[1px] bg-[#1e293b] mx-0.5" />

            {/* Duration Controls: +1, -1, and Step */}
            <button
              type="button"
              onClick={() => onAdjustDuration(incrementSeconds)}
              title={`Add ${formatStepLabel(incrementSeconds)} (+)`}
              className="px-1.5 py-0.5 h-[22px] bg-[#161e2e] hover:bg-[#1f2b42] text-emerald-400 rounded border border-[#2a3852] text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
              <span>{formatStepShort(incrementSeconds)}</span>
            </button>
            <button
              type="button"
              onClick={() => onAdjustDuration(-incrementSeconds)}
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

            {onPopOutWindow && (
              <button
                type="button"
                onClick={onPopOutWindow}
                title="Open in Native OS / Browser Window (360×240)"
                className="p-1 text-neutral-400 hover:text-white hover:bg-[#1a2436] rounded cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Close Preview"
              className="p-1 text-neutral-400 hover:text-red-400 hover:bg-[#1a2436] rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            CENTER ACTIVE TIME DISPLAY (Respects Sizes & Positions, Fonts, Colors, Images)
           ===================================================================== */}
        <div
          className="relative flex-1 flex flex-col items-center justify-center px-3 min-h-0 overflow-hidden"
          style={outerStyle}
        >
          {activeBackgroundImageUrl && (
            <img
              src={activeBackgroundImageUrl}
              alt=""
              className={`absolute inset-0 w-full h-full pointer-events-none select-none z-0 ${
                backgroundFit === 'contain' ? 'object-contain' : 'object-cover'
              }`}
              style={{
                opacity: Math.min(1, Math.max(0, backgroundOpacity / 100)),
              }}
            />
          )}

          {activeLogoUrl && (
            <img
              src={activeLogoUrl}
              alt="Logo"
              className={`absolute z-10 object-contain pointer-events-none select-none ${getLogoLocationClasses(
                logoCfg?.location
              )}`}
              style={{
                height: `${Math.round(22 * logoScale)}px`,
                maxWidth: `${Math.round(80 * logoScale)}px`,
                transform: getElementOffsetTransform(logoCfg, 1),
              }}
            />
          )}

          {isBlackout ? (
            <span className="relative z-10 text-xs uppercase tracking-widest text-red-400 font-semibold">
              BLACKOUT ACTIVE
            </span>
          ) : (
            <div
              className="relative z-10 flex flex-col items-center justify-center w-full"
              style={innerTransformStyle}
            >
              {/* Optional Clock / Date overlay when enabled in Sizes & Positions */}
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
                        transform: getElementOffsetTransform(clockCfg, 1),
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
                        transform: getElementOffsetTransform(dateCfg, 1),
                      }}
                    >
                      {formattedDate}
                    </span>
                  )}
                </div>
              )}

              {/* Main Countdown Readout */}
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
                      : isOnOff
                      ? 'animate-overtime-blink'
                      : isFlash && localPrefs.flashAlertsEnabled !== false
                      ? 'animate-pulse'
                      : ''
                  }`}
                >
                  {renderTimeWithColonOffset(displayTime, fsElements.colon?.vert)}
                </div>
              )}

              {/* Optional Slide Text / Cue Name below countdown */}
              {slideTextCfg?.visible && activeTimer?.notes && (
                <div
                  className="text-cyan-300 truncate max-w-full mt-0.5"
                  style={{
                    fontFamily: resolveFontFamily(slideTextCfg?.font),
                    ...resolveFontStyleCss(slideTextCfg?.fontStyle),
                    fontSize: `${Math.max(9, Math.round(11 * ((slideTextCfg.sizePercent ?? 33) / 33)))}px`,
                    textShadow: textShadowStyle,
                  }}
                >
                  {activeTimer.notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* =====================================================================
            BOTTOM PROGRESS & STATUS FOOTER
           ===================================================================== */}
        <div className="px-2.5 py-1.5 bg-[#090d14] border-t border-[#1d2738] shrink-0 z-20">
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
                  isOvertime || activeAlertLevel === 'danger'
                    ? 'bg-red-500'
                    : activeAlertLevel === 'warning'
                    ? 'bg-amber-500'
                    : isRunning
                    ? 'bg-emerald-500'
                    : isPaused
                    ? 'bg-amber-500'
                    : 'bg-cyan-500/60'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
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
              {status}
            </span>
            <span className="truncate max-w-[65%]">
              Next: <span className="text-neutral-200">{nextTimerName || 'End'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Floating Step Dropdown Menu (pops out above all windows) */}
      {showStepMenu && (
        <div
          ref={stepMenuRef}
          style={{ top: stepMenuPos.top, left: stepMenuPos.left }}
          className="fixed z-[10000] rounded shadow-2xl p-1 flex flex-col gap-0.5 min-w-[82px] border bg-[#111622] border-[#253247] font-mono select-none"
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
    </>
  );
};
