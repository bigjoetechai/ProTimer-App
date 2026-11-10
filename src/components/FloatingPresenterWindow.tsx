/**
 * Always-On-Top Resizable Presenter Pop-Out Screen (Default: 360 x 240 pixels).
 * - Stays always on top of the screen (z-[9999]).
 * - Resizable from all 8 edges and corners (N, S, E, W, NE, NW, SE, SW) by dragging.
 * - Draggable anywhere on screen via its header bar.
 * - Displays the active timer time in real time with NO transport/duration controls at the top.
 * - Applies all Preferences: Fonts, Font Styles, Sizes & Positions (presenter_window target),
 *   Colon Offset, Shadow, Crop & Scale, Colors & Animations, Progress Bar, Background Image, and Logo.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Pin, ExternalLink } from 'lucide-react';
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

interface FloatingPresenterWindowProps {
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
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 240;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 130;

export const FloatingPresenterWindow: React.FC<FloatingPresenterWindowProps> = ({
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
}) => {
  const localPrefs = useLivePreferences();

  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number }>(() => {
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: 28,
      y: Math.max(48, winH - DEFAULT_HEIGHT - 96),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  });

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
    dragStateRef.current = {
      type: 'resize',
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { ...bounds },
    };
  };

  const isRunning = status === 'running' || status === 'overtime';
  const isPaused = status === 'paused';

  const presElements = getTargetElements(localPrefs, 'presenter_window');
  const presExtras = getTargetExtras(localPrefs, 'presenter_window');
  const textShadowStyle = getTargetShadowCss(presExtras);

  const countdownCfg = presElements.countdown;
  const nameCfg = presElements.name;
  const clockCfg = presElements.clock;
  const dateCfg = presElements.date;
  const progressBarCfg = presElements.progress_bar;
  const logoCfg = presElements.logo;
  const slideTextCfg = presElements.slide_text;

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
    Math.min(bounds.width * 0.165, (bounds.height - 76) * 0.54)
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
    presExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  return (
    <div
      style={{
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }}
      className={`fixed z-[9999] bg-black text-white rounded-md border-2 ${
        presElements.border?.visible ? 'border-cyan-400' : 'border-cyan-500/60'
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
          DRAGGABLE HEADER BAR (NO transport/duration controls)
         ===================================================================== */}
      <div
        onMouseDown={startMove}
        className="h-8 px-2.5 bg-[#0c111b] border-b border-[#1d2738] flex items-center justify-between gap-2 cursor-move shrink-0 z-20"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Pin className="w-3 h-3 text-cyan-400 shrink-0" />
          {nameCfg?.visible !== false && (
            <span
              className="text-white uppercase tracking-wider truncate"
              style={{
                fontFamily: resolveFontFamily(nameCfg?.font),
                ...resolveFontStyleCss(nameCfg?.fontStyle),
                fontSize: `${Math.max(9, Math.min(16, Math.round(11 * nameScale)))}px`,
              }}
            >
              {activeTimer?.name || 'PRESENTER'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-neutral-400 tabular-nums"
            style={{
              fontFamily: resolveFontFamily(clockCfg?.font),
              ...resolveFontStyleCss(clockCfg?.fontStyle),
              fontSize: `${Math.max(9, Math.min(14, Math.round(10 * clockScale)))}px`,
            }}
          >
            {formattedClock}
          </span>

          {onPopOutWindow && (
            <button
              type="button"
              onClick={onPopOutWindow}
              title="Open Presenter in Native OS / Browser Window (360×240)"
              className="p-1 text-neutral-400 hover:text-white hover:bg-[#1a2436] rounded cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close Presenter"
            className="p-1 text-neutral-400 hover:text-red-400 hover:bg-[#1a2436] rounded cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* =====================================================================
          CENTER ACTIVE TIME DISPLAY
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
          <div className="w-full h-full bg-black" />
        ) : (
          <div
            className="relative z-10 flex flex-col items-center justify-center w-full"
            style={innerTransformStyle}
          >
            {dateCfg?.visible && (
              <span
                className="text-neutral-300 mb-0.5"
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
                {renderTimeWithColonOffset(displayTime, presElements.colon?.vert)}
              </div>
            )}

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
  );
};
