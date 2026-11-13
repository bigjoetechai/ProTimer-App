/**
 * Presenter Pop-Out Display (Confidence Monitor).
 * Frameless, always-on-top, freely resizable window without minimize/restore/close buttons.
 * Toggled on and off directly via the Presenter button on the main console.
 * Supports dragging via the header bar and 8-direction edge/corner resizing.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
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
import { Pin } from 'lucide-react';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 150;
const MIN_HEIGHT = 90;

export const PresenterDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);
  const localPrefs = useLivePreferences(payload?.preferences);
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 360,
    height: typeof window !== 'undefined' ? window.innerHeight : 240,
  }));

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

  const startMove = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
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
    Math.min(viewport.width * 0.165, Math.max(40, viewport.height - 68) * 0.54)
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
    presExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  return (
    <div
      className={`h-screen w-screen bg-black text-white flex flex-col justify-between p-2.5 font-mono select-none overflow-hidden relative border-2 ${
        presElements.border?.visible ? 'border-cyan-400' : 'border-cyan-500/60'
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

      {/* Clean Draggable Header Bar (Cue Name & Time of Day — NO minimize, restore, or close buttons) */}
      <div
        onMouseDown={startMove}
        className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#1c2536] cursor-move shrink-0 z-20"
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
              {payload.activeTimer?.name || 'PRESENTER'}
            </span>
          )}
        </div>

        <span
          className="text-neutral-400 tabular-nums shrink-0"
          style={{
            fontFamily: resolveFontFamily(clockCfg?.font),
            ...resolveFontStyleCss(clockCfg?.fontStyle),
            fontSize: `${Math.max(9, Math.min(15, Math.round(11 * clockScale)))}px`,
          }}
        >
          {formattedClock}
        </span>
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
                    : payload.alertOnOff
                    ? 'animate-overtime-blink'
                    : payload.alertFlash && localPrefs.flashAlertsEnabled !== false
                    ? 'animate-pulse'
                    : ''
                }`}
              >
                {renderTimeWithColonOffset(displayTime, presElements.colon?.vert)}
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

      {/* Bottom Progress Bar & Next Cue */}
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

      <MessageOverlay
        message={payload.activeMessage}
        config={presElements.message}
        compact
        textShadow={textShadowStyle}
      />
    </div>
  );
};
