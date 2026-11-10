/**
 * Fullscreen Output Display.
 * Dedicated borderless video output for external monitors, projectors, and confidence displays.
 * - Fully applies all Sizes & Positions elements (Countdown, Colon, Name, Clock, Date,
 *   Timer List, Message, Progress Bar, Border, Background, Logo, Slide Text, Slide Progress),
 *   Shadow, Crop & Scale, Images, Alerts, Colors & Animations, and General formatting preferences.
 * - Shows the uploaded background image for the active list (or default background image) when uploaded.
 * - Shows a pure black background (#000000) or configured BG Key Color when no image is uploaded or removed.
 */

import React, { useEffect, useState } from 'react';
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
  useLivePreferences,
} from '../utilities/displayStyleHelper';
import { X, Minimize2 } from 'lucide-react';

interface FullscreenDisplayProps {
  onClose?: () => void;
  isClient?: boolean;
}

export const FullscreenDisplay: React.FC<FullscreenDisplayProps> = ({
  onClose,
  isClient = true,
}) => {
  const { payload } = useDisplaySync(isClient);
  const [showControls, setShowControls] = useState(false);
  const localPrefs = useLivePreferences(payload?.preferences);

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (typeof window !== 'undefined' && window.electronAPI?.closeFullscreenOutput) {
      window.electronAPI.closeFullscreenOutput();
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      window.close();
    }
  };

  // Handle Escape key to safely close/exit fullscreen without stopping timers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (onClose) {
          onClose();
          return;
        }
        if (typeof window !== 'undefined' && window.electronAPI?.closeFullscreenOutput) {
          window.electronAPI.closeFullscreenOutput();
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

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-500 flex flex-col items-center justify-center font-mono select-none">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
      </div>
    );
  }

  // Blackout mode (Blank pure black screen)
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
            title="Exit Fullscreen (Escape)"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  const fsElements = getTargetElements(localPrefs, 'fullscreen_ndi_preview');
  const fsExtras = getTargetExtras(localPrefs, 'fullscreen_ndi_preview');
  const textShadowStyle = getTargetShadowCss(fsExtras);

  // Resolve active list's independent background image (or global default; '' when none or removed -> pure black)
  const activeListId = payload.activeListId || 'list_1';
  const resolvedFromPrefs = resolveBackgroundImageForList(localPrefs, activeListId);
  const hasLocalListBgMap = Boolean(
    localPrefs.listBackgroundImages && Object.keys(localPrefs.listBackgroundImages).length > 0
  );
  const activeBackgroundImageUrl =
    resolvedFromPrefs || (!hasLocalListBgMap ? payload.backgroundImageUrl || '' : '');

  const backgroundFit = payload.backgroundFit || localPrefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? localPrefs.backgroundImageOpacity ?? 100;
  const resolvedLogoFromPrefs = resolveLogoImageForList(localPrefs, activeListId);
  const hasLocalListLogoMap = Boolean(
    localPrefs.listLogoImages && Object.keys(localPrefs.listLogoImages).length > 0
  );
  const activeLogoUrl =
    resolvedLogoFromPrefs || (!hasLocalListLogoMap ? payload.logoImageUrl || '' : '');

  const { outerStyle, innerTransformStyle } = getTargetCanvasStyles(
    fsExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const formattedClock = formatClock(new Date(), undefined, localPrefs);
  const formattedDate = payload.dateFormatted || formatDate(new Date(), localPrefs);

  // Clock Mode: Large Broadcast Time of Day
  if (payload.isClockMode) {
    const clockModeScale = (fsElements.countdown?.sizePercent ?? 113) / 113;
    return (
      <div
        className={`h-screen w-screen bg-black text-white flex flex-col items-center justify-center select-none relative overflow-hidden ${
          fsElements.border?.visible ? 'border-4 border-cyan-500/80' : ''
        }`}
        style={outerStyle}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
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
            fontSize: `calc(clamp(4rem, 16vw, 19rem) * ${clockModeScale})`,
            textShadow: textShadowStyle || '0 4px 24px rgba(0,0,0,0.85)',
            ...innerTransformStyle,
          }}
        >
          {formattedClock}
        </div>

        {showControls && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-50 p-2.5 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-all border border-neutral-700 shadow-lg cursor-pointer"
            title="Exit Fullscreen (Escape)"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}

        <MessageOverlay
          message={payload.activeMessage}
          config={fsElements.message}
          textShadow={textShadowStyle}
        />
      </div>
    );
  }

  const isOvertime = payload.isOvertime;
  const formattedCountdown = formatSeconds(
    payload.secondsRemaining,
    true,
    isOvertime,
    localPrefs
  );
  const displayTime = isOvertime
    ? `+${formattedCountdown.replace(/^[+-]/, '')}`
    : formattedCountdown.replace(/^-/, '+');

  const resolvedDigitColor = resolveDisplayDigitColor({
    isOvertime,
    activeAlertLevel: payload.activeAlertLevel,
    alertColor: payload.alertColor,
    prefs: localPrefs,
  });

  // Element visibility & layout configs
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
                : payload.alertOnOff
                ? 'animate-overtime-blink'
                : payload.alertFlash && localPrefs.flashAlertsEnabled !== false
                ? 'animate-pulse'
                : ''
            }`}
            style={{
              color: resolvedDigitColor,
              fontFamily: resolveFontFamily(countdownCfg?.font),
              ...resolveFontStyleCss(countdownCfg?.fontStyle),
              fontSize: `calc(clamp(4.5rem, 18vw, 21rem) * ${countdownScale})`,
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
            className="flex flex-col items-center text-center max-w-[90vw]"
            style={{
              fontFamily: resolveFontFamily(nameCfg?.font),
              ...resolveFontStyleCss(nameCfg?.fontStyle),
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(nameCfg, 3.5),
            }}
          >
            <span
              className="text-white truncate max-w-full leading-tight"
              style={{
                fontSize: `calc(clamp(1.35rem, 3.4vw, 3.25rem) * ${nameScale})`,
              }}
            >
              {payload.activeTimer?.name || 'STANDBY'}
            </span>
            {payload.activeTimer?.endTime && (
              <span
                className="text-neutral-300 mt-0.5"
                style={{
                  fontSize: `calc(clamp(0.75rem, 1.4vw, 1.25rem) * ${nameScale})`,
                }}
              >
                Ends at: <span className="text-white font-bold">{payload.activeTimer.endTime}</span>
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
              fontSize: `calc(clamp(1.25rem, 3vw, 2.8rem) * ${clockScale})`,
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
              fontSize: `calc(clamp(1.1rem, 2.5vw, 2.3rem) * ${dateScale})`,
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(dateCfg, 3.5),
            }}
          >
            {formattedDate}
          </div>
        );
      }

      case 'timer_list': {
        if (!timerListCfg?.visible || !payload.timerList || payload.timerList.length === 0) {
          return null;
        }
        return (
          <div
            key="timer_list"
            className="bg-black/65 border border-white/15 rounded-lg px-4 py-2.5 backdrop-blur-xs max-w-[85vw]"
            style={{
              fontFamily: resolveFontFamily(timerListCfg?.font),
              ...resolveFontStyleCss(timerListCfg?.fontStyle),
              fontSize: `calc(clamp(0.8rem, 1.5vw, 1.35rem) * ${timerListScale})`,
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(timerListCfg, 3.5),
            }}
          >
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {payload.timerList.slice(0, 6).map((t, i) => {
                const isCurrent = t.id === payload.activeTimer?.id;
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
        const text =
          payload.activeTimer?.notes ||
          payload.activeTimer?.name ||
          '';
        if (!text) return null;
        return (
          <div
            key="slide_text"
            className="text-cyan-300 text-center max-w-[85vw] truncate"
            style={{
              fontFamily: resolveFontFamily(slideTextCfg?.font),
              ...resolveFontStyleCss(slideTextCfg?.fontStyle),
              fontSize: `calc(clamp(1rem, 2.4vw, 2.2rem) * ${slideTextScale})`,
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
              style={{ width: `${Math.min(100, Math.max(0, payload.progressPercent))}%` }}
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
                isOvertime || payload.activeAlertLevel === 'danger'
                  ? 'bg-red-500'
                  : payload.activeAlertLevel === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, payload.progressPercent))}%` }}
            />
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Group elements into Top, Middle, and Bottom zones based on their configured `location`
  const getZoneForLocation = (loc?: string, defaultZone: 'Top' | 'Middle' | 'Bottom' = 'Top'): 'Top' | 'Middle' | 'Bottom' => {
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

  const topNodes = elementZones.filter((e) => e.zone === 'Top').map((e) => renderElementNode(e.id)).filter(Boolean);
  const middleNodes = elementZones.filter((e) => e.zone === 'Middle').map((e) => renderElementNode(e.id)).filter(Boolean);
  const bottomNodes = elementZones.filter((e) => e.zone === 'Bottom').map((e) => renderElementNode(e.id)).filter(Boolean);

  return (
    <div
      className={`h-screen w-screen bg-black text-white flex flex-col justify-between p-6 sm:p-10 md:p-14 select-none relative overflow-hidden ${
        fsElements.border?.visible ? 'border-4 border-cyan-500/80' : ''
      }`}
      style={outerStyle}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Uploaded Background Image Layer (pure black bg-black when no image is uploaded or removed) */}
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

      {/* Optional Uploaded Logo Overlay positioned by Sizes & Positions -> Logo */}
      {activeLogoUrl && (
        <img
          src={activeLogoUrl}
          alt="Logo"
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

      {/* Subtle hover exit control */}
      {showControls && (
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-50 p-2.5 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-all border border-neutral-700 shadow-xl cursor-pointer"
          title="Exit Fullscreen (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* On-screen Stage Messages Overlay */}
      <MessageOverlay
        message={payload.activeMessage}
        config={fsElements.message}
        textShadow={textShadowStyle}
      />
    </div>
  );
};
