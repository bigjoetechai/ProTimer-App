/**
 * Presenter Pop-Out Display (Confidence Monitor).
 * Frameless, always-on-top, freely resizable window without minimize/restore/close buttons.
 * Toggled on and off directly via the Presenter button on the main console.
 * Mirrors the exact visual output, layout zones, styles, background, logo, clock mode,
 * blackout mode, and stage messages shown on the external / Fullscreen display.
 * Supports dragging anywhere on the canvas and 8-direction edge/corner resizing.
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

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 150;
const MIN_HEIGHT = 90;
const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;

export const PresenterDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);
  const localPrefs = useLivePreferences(payload?.preferences);
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 360,
    height: typeof window !== 'undefined' ? window.innerHeight : 240,
  }));

  const pinnedListId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('listId') || undefined
      : undefined;

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

  const resizeHandles = (
    <>
      <div
        onMouseDown={startResize('n')}
        className="absolute top-0 left-2 right-2 h-1.5 cursor-ns-resize z-50"
      />
      <div
        onMouseDown={startResize('s')}
        className="absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize z-50"
      />
      <div
        onMouseDown={startResize('w')}
        className="absolute left-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-50"
      />
      <div
        onMouseDown={startResize('e')}
        className="absolute right-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-50"
      />
      <div
        onMouseDown={startResize('nw')}
        className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-50"
      />
      <div
        onMouseDown={startResize('ne')}
        className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-50"
      />
      <div
        onMouseDown={startResize('sw')}
        className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-50"
      />
      <div
        onMouseDown={startResize('se')}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-50"
      />
    </>
  );

  if (!payload) {
    return (
      <div
        onMouseDown={startMove}
        className="h-screen w-screen bg-black text-neutral-500 flex flex-col items-center justify-center font-mono select-none cursor-move relative overflow-hidden"
      >
        {resizeHandles}
      </div>
    );
  }

  // Blackout mode (Blank pure black screen, matching FullscreenDisplay)
  if (payload.isBlackout) {
    return (
      <div
        onMouseDown={startMove}
        className="h-screen w-screen bg-black select-none cursor-move relative overflow-hidden"
      >
        {resizeHandles}
      </div>
    );
  }

  // Use the exact same target profile as FullscreenDisplay ('fullscreen_ndi_preview')
  const fsElements = getTargetElements(localPrefs, 'fullscreen_ndi_preview');
  const fsExtras = getTargetExtras(localPrefs, 'fullscreen_ndi_preview');
  const textShadowStyle = getTargetShadowCss(fsExtras);

  // Resolve which list is currently showing on the external Fullscreen display (or activeListId)
  const activeFsListIds = Object.keys(payload.activeFullscreenByList || {}).filter(
    (id) => payload.activeFullscreenByList?.[id]
  );
  const resolvedExternalListId =
    activeFsListIds.length > 0
      ? payload.activeListId && payload.activeFullscreenByList?.[payload.activeListId]
        ? payload.activeListId
        : activeFsListIds[0]
      : undefined;

  const targetListId = pinnedListId || resolvedExternalListId || payload.activeListId || 'list_1';
  const listCue =
    targetListId !== payload.activeListId || pinnedListId
      ? payload.listActiveCues?.find((c) => c.listId === targetListId)
      : undefined;

  // Resolve target list's independent background image (or global default; '' when none or removed -> pure black)
  const hasExplicitListBgEntry = Boolean(
    localPrefs.listBackgroundImages &&
      Object.prototype.hasOwnProperty.call(localPrefs.listBackgroundImages, targetListId)
  );
  const resolvedFromPrefs = sanitizeImageUrl(resolveBackgroundImageForList(localPrefs, targetListId));
  const fallbackBgUrl = listCue ? listCue.backgroundImageUrl : payload.backgroundImageUrl;
  const activeBackgroundImageUrl =
    hasExplicitListBgEntry && !resolvedFromPrefs
      ? ''
      : resolvedFromPrefs || sanitizeImageUrl(fallbackBgUrl);

  const backgroundFit = payload.backgroundFit || localPrefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? localPrefs.backgroundImageOpacity ?? 100;

  const hasExplicitListLogoEntry = Boolean(
    localPrefs.listLogoImages &&
      Object.prototype.hasOwnProperty.call(localPrefs.listLogoImages, targetListId)
  );
  const resolvedLogoFromPrefs = sanitizeImageUrl(resolveLogoImageForList(localPrefs, targetListId));
  const fallbackLogoUrl = listCue ? listCue.logoImageUrl : payload.logoImageUrl;
  const activeLogoUrl =
    hasExplicitListLogoEntry && !resolvedLogoFromPrefs
      ? ''
      : resolvedLogoFromPrefs || sanitizeImageUrl(fallbackLogoUrl);

  const { outerStyle, innerTransformStyle } = getTargetCanvasStyles(
    fsExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const formattedClock = formatClock(new Date(), undefined, localPrefs);
  const formattedDate = payload.dateFormatted || formatDate(new Date(), localPrefs);

  // Virtual Fullscreen Canvas scaling so the Presenter window is a 1:1 proportional replica of FullscreenDisplay
  const scale = Math.max(
    0.05,
    Math.min(viewport.width / REFERENCE_WIDTH, viewport.height / REFERENCE_HEIGHT)
  );
  const virtualWidth = Math.max(320, Math.round(viewport.width / scale));
  const virtualHeight = Math.max(180, Math.round(viewport.height / scale));
  const vw = (v: number) => `${((virtualWidth * v) / 100).toFixed(2)}px`;

  // Clock Mode: Large Broadcast Time of Day (identical to FullscreenDisplay)
  if (payload.isClockMode) {
    const clockModeScale = (fsElements.countdown?.sizePercent ?? 113) / 113;
    return (
      <div
        onMouseDown={startMove}
        className="h-screen w-screen bg-black select-none cursor-move relative overflow-hidden"
      >
        {resizeHandles}
        <div
          style={{
            width: `${virtualWidth}px`,
            height: `${virtualHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            ...outerStyle,
          }}
          className={`bg-black text-white flex flex-col items-center justify-center select-none relative overflow-hidden ${
            fsElements.border?.visible ? 'border-4 border-cyan-500/80' : ''
          }`}
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
              className={`absolute z-20 object-contain pointer-events-none select-none ${getLogoLocationClasses(
                fsElements.logo?.location
              )}`}
              style={{
                height: `${Math.round(64 * Math.max(0.2, (fsElements.logo?.sizePercent ?? 20) / 20))}px`,
                maxWidth: `${Math.round(240 * Math.max(0.2, (fsElements.logo?.sizePercent ?? 20) / 20))}px`,
                transform: getElementOffsetTransform(fsElements.logo, 4),
              }}
            />
          )}

          <div
            className="relative z-10 tracking-tight text-white tabular-nums leading-none"
            style={{
              fontFamily: resolveFontFamily(fsElements.clock?.font || fsElements.countdown?.font),
              ...resolveFontStyleCss(fsElements.clock?.fontStyle || fsElements.countdown?.fontStyle),
              fontSize: `calc(clamp(4rem, ${vw(16)}, 19rem) * ${clockModeScale})`,
              textShadow: textShadowStyle || '0 4px 24px rgba(0,0,0,0.85)',
              ...innerTransformStyle,
            }}
          >
            {formattedClock}
          </div>

          <MessageOverlay
            message={payload.activeMessage}
            config={fsElements.message}
            textShadow={textShadowStyle}
          />
        </div>
      </div>
    );
  }

  const isOvertime = listCue ? listCue.isOvertime : payload.isOvertime;
  const secondsRemaining = listCue ? listCue.secondsRemaining : payload.secondsRemaining;
  const activeAlertLevel = listCue ? listCue.activeAlertLevel : payload.activeAlertLevel;
  const alertColor = listCue ? listCue.alertColor : payload.alertColor;
  const alertFlash = listCue ? listCue.alertFlash : payload.alertFlash;
  const alertOnOff = listCue ? listCue.alertOnOff : payload.alertOnOff;
  const activeTimer = listCue ? listCue.activeTimer : payload.activeTimer;
  const progressPercent = listCue ? listCue.progressPercent : payload.progressPercent;
  const activeTimerList = listCue?.timerList || payload.timerList;

  const formattedCountdown = formatSeconds(
    secondsRemaining,
    true,
    isOvertime,
    localPrefs
  );
  const displayTime = isOvertime
    ? `+${formattedCountdown.replace(/^[+-]/, '')}`
    : formattedCountdown.replace(/^-/, '+');

  const resolvedDigitColor = resolveDisplayDigitColor({
    isOvertime,
    activeAlertLevel,
    alertColor,
    prefs: localPrefs,
  });

  // Element visibility & layout configs (identical to FullscreenDisplay)
  const countdownCfg = fsElements.countdown;
  const nameCfg = fsElements.name;
  const clockCfg = fsElements.clock;
  const dateCfg = fsElements.date;
  const timerListCfg = fsElements.timer_list;
  const progressBarCfg = fsElements.progress_bar;
  const logoCfg = fsElements.logo;
  const slideTextCfg = fsElements.slide_text;
  const slideProgressCfg = fsElements.slide_progress;

  const showProgressBar = Boolean(localPrefs.showProgressBar || progressBarCfg?.visible);
  const progressBarLocation =
    progressBarCfg?.location || (localPrefs.progressBarPosition === 'top' ? 'Top' : 'Bottom');
  const progressBarHeightPx = localPrefs.progressBarHeightPx ?? 12;
  const progressBarWidthPct = Math.min(100, Math.max(10, progressBarCfg?.sizePercent ?? 100));

  // Scale ratios from Sizes & Positions
  const countdownScale = Math.max(0.15, (countdownCfg?.sizePercent ?? 113) / 113);
  const nameScale = Math.max(0.15, (nameCfg?.sizePercent ?? 33) / 33);
  const clockScale = Math.max(0.15, (clockCfg?.sizePercent ?? 33) / 33);
  const dateScale = Math.max(0.15, (dateCfg?.sizePercent ?? 33) / 33);
  const timerListScale = Math.max(0.15, (timerListCfg?.sizePercent ?? 33) / 33);
  const slideTextScale = Math.max(0.15, (slideTextCfg?.sizePercent ?? 33) / 33);
  const logoScale = Math.max(0.15, (logoCfg?.sizePercent ?? 20) / 20);

  // Render helper for each movable element so it can be placed in Top, Middle, or Bottom
  const renderElementNode = (id: string): React.ReactNode => {
    switch (id) {
      case 'countdown': {
        if (countdownCfg?.visible === false) return null;
        return (
          <div
            key="countdown"
            className={`tracking-tighter tabular-nums leading-none text-center ${
              localPrefs.smoothTransitions !== false ? 'transition-colors duration-300' : ''
            } ${
              activeBackgroundImageUrl && !textShadowStyle
                ? 'drop-shadow-[0_6px_28px_rgba(0,0,0,0.9)]'
                : ''
            } ${
              isOvertime
                ? 'animate-overtime-blink'
                : alertOnOff
                ? 'animate-overtime-blink'
                : alertFlash && localPrefs.flashAlertsEnabled !== false
                ? 'animate-pulse'
                : ''
            }`}
            style={{
              color: resolvedDigitColor,
              fontFamily: resolveFontFamily(countdownCfg?.font),
              ...resolveFontStyleCss(countdownCfg?.fontStyle),
              fontSize: `calc(clamp(4.5rem, ${vw(18)}, 21rem) * ${countdownScale})`,
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(countdownCfg, 4),
            }}
          >
            {renderTimeWithColonOffset(displayTime, fsElements.colon?.vert)}
          </div>
        );
      }

      case 'name': {
        if (nameCfg?.visible === false) return null;
        return (
          <div
            key="name"
            className="flex flex-col items-center text-center"
            style={{
              maxWidth: vw(90),
              fontFamily: resolveFontFamily(nameCfg?.font),
              ...resolveFontStyleCss(nameCfg?.fontStyle),
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(nameCfg, 3.5),
            }}
          >
            <span
              className="text-white truncate max-w-full leading-tight"
              style={{
                fontSize: `calc(clamp(1.35rem, ${vw(3.4)}, 3.25rem) * ${nameScale})`,
              }}
            >
              {activeTimer?.name || 'STANDBY'}
            </span>
            {activeTimer?.endTime && (
              <span
                className="text-neutral-300 mt-0.5"
                style={{
                  fontSize: `calc(clamp(0.75rem, ${vw(1.4)}, 1.25rem) * ${nameScale})`,
                }}
              >
                Ends at: <span className="text-white font-bold">{activeTimer.endTime}</span>
              </span>
            )}
          </div>
        );
      }

      case 'clock': {
        if (!clockCfg?.visible) return null;
        return (
          <div
            key="clock"
            className="tabular-nums text-neutral-100 leading-tight"
            style={{
              fontFamily: resolveFontFamily(clockCfg?.font),
              ...resolveFontStyleCss(clockCfg?.fontStyle),
              fontSize: `calc(clamp(1.25rem, ${vw(3)}, 2.8rem) * ${clockScale})`,
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(clockCfg, 3.5),
            }}
          >
            {formattedClock}
          </div>
        );
      }

      case 'date': {
        if (!dateCfg?.visible) return null;
        return (
          <div
            key="date"
            className="text-neutral-200 leading-tight"
            style={{
              fontFamily: resolveFontFamily(dateCfg?.font),
              ...resolveFontStyleCss(dateCfg?.fontStyle),
              fontSize: `calc(clamp(1.1rem, ${vw(2.5)}, 2.3rem) * ${dateScale})`,
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(dateCfg, 3.5),
            }}
          >
            {formattedDate}
          </div>
        );
      }

      case 'timer_list': {
        if (!timerListCfg?.visible || !activeTimerList || activeTimerList.length === 0) {
          return null;
        }
        return (
          <div
            key="timer_list"
            className="bg-black/65 border border-white/15 rounded-lg px-4 py-2.5 backdrop-blur-xs"
            style={{
              maxWidth: vw(85),
              fontFamily: resolveFontFamily(timerListCfg?.font),
              ...resolveFontStyleCss(timerListCfg?.fontStyle),
              fontSize: `calc(clamp(0.8rem, ${vw(1.5)}, 1.35rem) * ${timerListScale})`,
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(timerListCfg, 3.5),
            }}
          >
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {activeTimerList.slice(0, 6).map((t, i) => {
                const isCurrent = t.id === activeTimer?.id;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 ${
                      isCurrent ? 'text-cyan-400 font-bold' : 'text-neutral-300'
                    }`}
                  >
                    <span className="opacity-60">#{i + 1}</span>
                    <span className="truncate max-w-[180px]">{t.name || 'Untitled'}</span>
                    <span className="opacity-80 tabular-nums">({t.durationFormatted})</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      case 'slide_text': {
        if (!slideTextCfg?.visible) return null;
        const text = activeTimer?.notes || activeTimer?.name || '';
        if (!text) return null;
        return (
          <div
            key="slide_text"
            className="text-cyan-300 text-center truncate"
            style={{
              maxWidth: vw(85),
              fontFamily: resolveFontFamily(slideTextCfg?.font),
              ...resolveFontStyleCss(slideTextCfg?.fontStyle),
              fontSize: `calc(clamp(1rem, ${vw(2.4)}, 2.2rem) * ${slideTextScale})`,
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(slideTextCfg, 3.5),
            }}
          >
            {text}
          </div>
        );
      }

      case 'slide_progress': {
        if (!slideProgressCfg?.visible) return null;
        const slideWidthPct = Math.min(100, Math.max(10, slideProgressCfg?.sizePercent ?? 100));
        return (
          <div
            key="slide_progress"
            className="h-2 bg-neutral-900/80 rounded-full overflow-hidden border border-white/10"
            style={{
              width: `${slideWidthPct}%`,
              transform: getElementOffsetTransform(slideProgressCfg, 3),
            }}
          >
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        );
      }

      case 'progress_bar': {
        if (!showProgressBar) return null;
        return (
          <div
            key="progress_bar"
            className="bg-neutral-900/85 rounded-full overflow-hidden border border-white/10 mx-auto"
            style={{
              width: `${progressBarWidthPct}%`,
              height: `${progressBarHeightPx}px`,
              transform: getElementOffsetTransform(progressBarCfg, 3),
            }}
          >
            <div
              className={`h-full transition-all duration-300 ${
                isOvertime || activeAlertLevel === 'danger'
                  ? 'bg-red-500'
                  : activeAlertLevel === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Group elements into Top, Middle, and Bottom zones based on their configured `location`
  const getZoneForLocation = (
    loc?: string,
    defaultZone: 'Top' | 'Middle' | 'Bottom' = 'Top'
  ): 'Top' | 'Middle' | 'Bottom' => {
    if (!loc) return defaultZone;
    if (loc === 'Top' || loc === 'High' || loc === 'Left') return 'Top';
    if (loc === 'Middle') return 'Middle';
    if (loc === 'Bottom' || loc === 'Low' || loc === 'Right') return 'Bottom';
    return defaultZone;
  };

  const elementZones: Array<{ id: string; zone: 'Top' | 'Middle' | 'Bottom' }> = [
    { id: 'timer_list', zone: getZoneForLocation(timerListCfg?.location, 'Top') },
    { id: 'clock', zone: getZoneForLocation(clockCfg?.location, 'Top') },
    { id: 'date', zone: getZoneForLocation(dateCfg?.location, 'Top') },
    { id: 'slide_text', zone: getZoneForLocation(slideTextCfg?.location, 'Top') },
    { id: 'slide_progress', zone: getZoneForLocation(slideProgressCfg?.location, 'Top') },
    { id: 'countdown', zone: getZoneForLocation(countdownCfg?.location, 'Middle') },
    { id: 'name', zone: getZoneForLocation(nameCfg?.location, 'Bottom') },
    { id: 'progress_bar', zone: getZoneForLocation(progressBarLocation, 'Bottom') },
  ];

  const topNodes = elementZones
    .filter((e) => e.zone === 'Top')
    .map((e) => renderElementNode(e.id))
    .filter(Boolean);
  const middleNodes = elementZones
    .filter((e) => e.zone === 'Middle')
    .map((e) => renderElementNode(e.id))
    .filter(Boolean);
  const bottomNodes = elementZones
    .filter((e) => e.zone === 'Bottom')
    .map((e) => renderElementNode(e.id))
    .filter(Boolean);

  return (
    <div
      onMouseDown={startMove}
      className="h-screen w-screen bg-black select-none cursor-move relative overflow-hidden"
    >
      {resizeHandles}

      <div
        style={{
          width: `${virtualWidth}px`,
          height: `${virtualHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          ...outerStyle,
        }}
        className={`bg-black text-white flex flex-col justify-between p-14 select-none relative overflow-hidden ${
          fsElements.border?.visible ? 'border-4 border-cyan-500/80' : ''
        }`}
      >
        {/* Uploaded Background Image Layer (pure black bg-black when no image is uploaded or removed) */}
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

        {/* Optional Uploaded Logo Overlay positioned by Sizes & Positions -> Logo */}
        {activeLogoUrl && (
          <img
            src={activeLogoUrl}
            alt="Logo"
            decoding="sync"
            draggable={false}
            className={`absolute z-20 object-contain pointer-events-none select-none ${getLogoLocationClasses(
              logoCfg?.location
            )}`}
            style={{
              height: `${Math.round(56 * logoScale)}px`,
              maxWidth: `${Math.round(220 * logoScale)}px`,
              transform: getElementOffsetTransform(logoCfg, 3),
            }}
          />
        )}

        {/* Inner Canvas Wrapper (Applies Crop & Scale Size / Position D-Pad Transform) */}
        <div
          className="relative z-10 flex-1 flex flex-col justify-between w-full h-full min-h-0"
          style={innerTransformStyle}
        >
          {/* TOP ZONE */}
          <div className="flex flex-col items-center justify-center gap-3 w-full min-h-[48px]">
            {topNodes}
          </div>

          {/* MIDDLE ZONE */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 my-2 w-full">
            {middleNodes}
          </div>

          {/* BOTTOM ZONE */}
          <div className="flex flex-col items-center justify-center gap-3 w-full min-h-[48px]">
            {bottomNodes}
          </div>
        </div>

        {/* On-screen Stage Messages Overlay */}
        <MessageOverlay
          message={payload.activeMessage}
          config={fsElements.message}
          textShadow={textShadowStyle}
        />
      </div>
    </div>
  );
};
