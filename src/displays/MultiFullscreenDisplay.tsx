/**
 * Multi Fullscreen Output Display (Multi FS).
 * Dedicated borderless multiview output that displays all Cue List tabs
 * and each List tab's active/running or cued timer simultaneously.
 * Completely independent from the single Fullscreen output window.
 * Applies all Preferences: Fonts, Font Styles, Sizes & Positions (multitimer target),
 * Colon Offset, Shadow, Crop & Scale, Colors & Animations, Progress Bar, and per-list Images.
 */

import React, { useEffect, useState } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';
import {
  ListActiveCueSummary,
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
  sanitizeImageUrl,
  useLivePreferences,
} from '../utilities/displayStyleHelper';
import { Layers, Play, Pause, AlertTriangle, Clock } from 'lucide-react';

interface MultiFullscreenDisplayProps {
  onClose?: () => void;
  isClient?: boolean;
}

export const MultiFullscreenDisplay: React.FC<MultiFullscreenDisplayProps> = ({
  onClose,
  isClient = true,
}) => {
  const { payload } = useDisplaySync(isClient);
  const localPrefs = useLivePreferences(payload?.preferences);

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

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-500 flex flex-col items-center justify-center font-mono select-none" />
    );
  }

  // Blackout mode
  if (payload.isBlackout) {
    return <div className="h-screen w-screen bg-black cursor-none relative" />;
  }

  const listSummaries: ListActiveCueSummary[] =
    payload.listActiveCues && payload.listActiveCues.length > 0
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
            logoImageUrl: payload.logoImageUrl,
          },
        ];

  const totalLists = listSummaries.length;
  const totalRunningLists = listSummaries.filter(
    (l) => l.status === 'running' || l.status === 'overtime'
  ).length;
  const backgroundFit = payload.backgroundFit || localPrefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? localPrefs.backgroundImageOpacity ?? 100;

  const mtElements = getTargetElements(localPrefs, 'multitimer');
  const mtExtras = getTargetExtras(localPrefs, 'multitimer');
  const textShadowStyle = getTargetShadowCss(mtExtras);

  const countdownCfg = mtElements.countdown;
  const nameCfg = mtElements.name;
  const clockCfg = mtElements.clock;
  const dateCfg = mtElements.date;
  const progressBarCfg = mtElements.progress_bar;
  const logoCfg = mtElements.logo;
  const slideTextCfg = mtElements.slide_text;

  const countdownScale = Math.max(0.2, (countdownCfg?.sizePercent ?? 113) / 113);
  const nameScale = Math.max(0.2, (nameCfg?.sizePercent ?? 33) / 33);
  const clockScale = Math.max(0.2, (clockCfg?.sizePercent ?? 33) / 33);
  const dateScale = Math.max(0.2, (dateCfg?.sizePercent ?? 33) / 33);
  const logoScale = Math.max(0.2, (logoCfg?.sizePercent ?? 20) / 20);

  const formattedClock = formatClock(new Date(), undefined, localPrefs);
  const formattedDate = payload.dateFormatted || formatDate(new Date(), localPrefs);

  const activeListId = payload.activeListId || 'list_1';
  const hasExplicitActiveLogoEntry = Boolean(
    localPrefs.listLogoImages &&
      Object.prototype.hasOwnProperty.call(localPrefs.listLogoImages, activeListId)
  );
  const resolvedLogoFromPrefs = sanitizeImageUrl(resolveLogoImageForList(localPrefs, activeListId));
  const activeLogoUrl =
    hasExplicitActiveLogoEntry && !resolvedLogoFromPrefs
      ? ''
      : resolvedLogoFromPrefs || sanitizeImageUrl(payload.logoImageUrl);

  const { outerStyle, innerTransformStyle } = getTargetCanvasStyles(mtExtras, true);

  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  // Dynamic responsive grid layout based on number of list tabs
  const getGridClass = (count: number): string => {
    if (count === 1) return 'grid-cols-1 grid-rows-1';
    if (count === 2) return 'grid-cols-1 lg:grid-cols-2 grid-rows-2 lg:grid-rows-1';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2 md:grid-rows-2';
    if (count <= 6) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';
  };

  // Dynamic base font size for timer digits based on number of list tabs
  const getBaseTimerFontCss = (count: number): string => {
    if (count === 1) return 'clamp(4.5rem, 15vw, 15rem)';
    if (count === 2) return 'clamp(3.25rem, 9vw, 9.5rem)';
    if (count <= 4) return 'clamp(2.75rem, 7vw, 7.5rem)';
    return 'clamp(2.25rem, 5.5vw, 5.5rem)';
  };

  return (
    <div
      className={`h-screen w-screen bg-[#05070b] text-white flex flex-col p-4 sm:p-6 select-none font-mono relative overflow-hidden ${
        mtElements.border?.visible ? 'border-4 border-cyan-500/80' : ''
      }`}
      style={{
        borderRadius: outerStyle.borderRadius,
        clipPath: outerStyle.clipPath,
      }}
    >
      {activeLogoUrl && (
        <img
          src={activeLogoUrl}
          alt="Logo"
          decoding="sync"
          draggable={false}
          className={`absolute z-30 object-contain pointer-events-none select-none ${getLogoLocationClasses(
            logoCfg?.location
          )}`}
          style={{
            height: `${Math.round(42 * logoScale)}px`,
            maxWidth: `${Math.round(160 * logoScale)}px`,
            transform: getElementOffsetTransform(logoCfg, 2.5),
          }}
        />
      )}

      {/* Top Broadcast Multiview Header */}
      <header className="flex items-center justify-between border-b border-[#182030] pb-3 mb-4 shrink-0 relative z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider">MULTI FS</span>
          </div>
          <div>
            <h1
              className="text-sm sm:text-base font-bold tracking-wider uppercase text-white"
              style={{
                fontFamily: resolveFontFamily(nameCfg?.font),
              }}
            >
              ALL LIST TABS — ACTIVE CUE MULTIVIEW
            </h1>
            <p className="text-[11px] text-neutral-400">
              {totalLists} Cue {totalLists === 1 ? 'List' : 'Lists'} • {totalRunningLists} Active Running
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {dateCfg?.visible && (
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold block">
                DATE
              </span>
              <span
                className="text-neutral-200"
                style={{
                  fontFamily: resolveFontFamily(dateCfg?.font),
                  ...resolveFontStyleCss(dateCfg?.fontStyle),
                  fontSize: `calc(clamp(0.95rem, 1.5vw, 1.4rem) * ${dateScale})`,
                }}
              >
                {formattedDate}
              </span>
            </div>
          )}
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold block">
              SYSTEM CLOCK
            </span>
            <span
              className="text-cyan-400 tabular-nums"
              style={{
                fontFamily: resolveFontFamily(clockCfg?.font),
                ...resolveFontStyleCss(clockCfg?.fontStyle || 'Bold'),
                fontSize: `calc(clamp(1.1rem, 1.8vw, 1.65rem) * ${clockScale})`,
              }}
            >
              {formattedClock}
            </span>
          </div>
        </div>
      </header>

      {/* Multiview Grid: One Panel per Cue List Tab */}
      <div
        className={`flex-1 grid gap-4 min-h-0 overflow-y-auto relative z-10 ${getGridClass(
          totalLists
        )}`}
        style={innerTransformStyle}
      >
        {listSummaries.map((item, idx) => {
          const isRunning = item.status === 'running' || item.status === 'overtime';
          const isPaused = item.status === 'paused';
          const isOvertime = item.isOvertime;
          const isDanger = item.activeAlertLevel === 'danger';
          const isWarning = item.activeAlertLevel === 'warning';

          let cardBorder = 'border-[#1c2638]';
          if (isOvertime || (isDanger && item.alertFlash)) {
            cardBorder = 'border-red-500/80';
          } else if (isWarning && item.alertFlash) {
            cardBorder = 'border-amber-500/80';
          } else if (isRunning) {
            cardBorder = 'border-emerald-500/60';
          } else if (item.isCurrentOperatorList) {
            cardBorder = 'border-cyan-500/50';
          }

          const formattedItemTime = formatSeconds(
            item.secondsRemaining,
            true,
            isOvertime,
            localPrefs
          );
          const displayTime = isOvertime
            ? `+${formattedItemTime.replace(/^[+-]/, '')}`
            : formattedItemTime.replace(/^-/, '+');

          const hasExplicitItemBgEntry = Boolean(
            localPrefs.listBackgroundImages &&
              Object.prototype.hasOwnProperty.call(localPrefs.listBackgroundImages, item.listId)
          );
          const resolvedFromPrefs = sanitizeImageUrl(resolveBackgroundImageForList(localPrefs, item.listId));
          const listBackgroundUrl =
            hasExplicitItemBgEntry && !resolvedFromPrefs
              ? ''
              : resolvedFromPrefs || sanitizeImageUrl(item.backgroundImageUrl);

          const hasExplicitItemLogoEntry = Boolean(
            localPrefs.listLogoImages &&
              Object.prototype.hasOwnProperty.call(localPrefs.listLogoImages, item.listId)
          );
          const resolvedListLogoFromPrefs = sanitizeImageUrl(resolveLogoImageForList(localPrefs, item.listId));
          const listLogoUrl =
            hasExplicitItemLogoEntry && !resolvedListLogoFromPrefs
              ? ''
              : resolvedListLogoFromPrefs || sanitizeImageUrl(item.logoImageUrl);

          const resolvedItemDigitColor = resolveDisplayDigitColor({
            isOvertime,
            isPaused,
            activeAlertLevel: item.activeAlertLevel,
            alertColor: item.alertColor,
            prefs: localPrefs,
          });

          return (
            <div
              key={item.listId}
              className={`rounded-xl border-2 p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 relative overflow-hidden ${cardBorder}`}
              style={{
                backgroundColor: listBackgroundUrl
                  ? '#000000'
                  : mtExtras?.bgKeyColor || '#000000',
              }}
            >
              {/* Independent Per-List Background Image (pure black when none or removed) */}
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
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
                  }}
                />
              )}

              {/* Independent Per-List Logo Image */}
              {listLogoUrl && (
                <img
                  src={listLogoUrl}
                  alt="List Logo"
                  decoding="sync"
                  draggable={false}
                  className={`absolute z-20 object-contain pointer-events-none select-none ${getLogoLocationClasses(
                    logoCfg?.location
                  )}`}
                  style={{
                    height: `${Math.round(36 * logoScale)}px`,
                    maxWidth: `${Math.round(140 * logoScale)}px`,
                    transform: getElementOffsetTransform(logoCfg, 2),
                  }}
                />
              )}

              {/* Panel Top Bar: List Tab Name & Status Badge */}
              <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-white/10 text-neutral-300 shrink-0">
                    TAB {idx + 1}
                  </span>
                  <h2
                    className="text-base sm:text-lg font-extrabold text-white truncate drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]"
                    style={{
                      fontFamily: resolveFontFamily(nameCfg?.font),
                    }}
                  >
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
                {nameCfg?.visible !== false && (
                  <div
                    className="w-full mb-2"
                    style={{
                      fontFamily: resolveFontFamily(nameCfg?.font),
                      ...resolveFontStyleCss(nameCfg?.fontStyle),
                      textShadow: textShadowStyle,
                      transform: getElementOffsetTransform(nameCfg, 2),
                    }}
                  >
                    <span className="text-[10px] uppercase tracking-widest text-neutral-300 font-semibold block drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                      {isRunning ? 'ACTIVE RUNNING CUE' : isPaused ? 'PAUSED CUE' : 'ACTIVE / CUED TIMER'}
                    </span>
                    <div
                      className="text-white truncate px-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                      style={{
                        fontSize: `calc(clamp(1.1rem, 2vw, 1.65rem) * ${nameScale})`,
                      }}
                    >
                      {item.activeTimer ? item.activeTimer.name || 'Untitled Cue' : 'No Cues in List'}
                    </div>
                    {(slideTextCfg?.visible !== false && item.activeTimer?.notes) && (
                      <div
                        className="text-xs text-cyan-400 font-medium truncate"
                        style={{
                          fontFamily: resolveFontFamily(slideTextCfg?.font),
                          ...resolveFontStyleCss(slideTextCfg?.fontStyle),
                        }}
                      >
                        {item.activeTimer.notes}
                      </div>
                    )}
                  </div>
                )}

                {/* Main Timer Readout */}
                {countdownCfg?.visible !== false && (
                  <div
                    className={`tracking-tighter tabular-nums leading-none my-1 ${
                      localPrefs.smoothTransitions !== false ? 'transition-colors duration-300' : ''
                    } ${
                      listBackgroundUrl && !textShadowStyle
                        ? 'drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]'
                        : ''
                    } ${
                      isOvertime
                        ? 'animate-overtime-blink'
                        : item.alertOnOff
                        ? 'animate-overtime-blink'
                        : item.alertFlash && localPrefs.flashAlertsEnabled !== false
                        ? 'animate-pulse'
                        : ''
                    }`}
                    style={{
                      fontSize: `calc(${getBaseTimerFontCss(totalLists)} * ${countdownScale})`,
                      color: resolvedItemDigitColor,
                      fontFamily: resolveFontFamily(countdownCfg?.font),
                      ...resolveFontStyleCss(countdownCfg?.fontStyle),
                      textShadow: textShadowStyle,
                      transform: getElementOffsetTransform(countdownCfg, 2.5),
                    }}
                  >
                    {renderTimeWithColonOffset(displayTime, mtElements.colon?.vert)}
                  </div>
                )}
              </div>

              {/* Progress Bar & Next Cue Footer */}
              <div className="relative z-10 pt-2 border-t border-white/10">
                {showProgressBar && (
                  <div
                    className="bg-neutral-900/90 rounded-full overflow-hidden mb-2.5 border border-white/5 mx-auto"
                    style={{
                      height: `${Math.max(4, Math.min(18, Math.round((localPrefs.progressBarHeightPx ?? 12) * 0.7)))}px`,
                      width: `${Math.min(100, Math.max(15, progressBarCfg?.sizePercent ?? 100))}%`,
                    }}
                  >
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
                )}

                <div
                  className="flex items-center justify-between text-xs text-neutral-300 gap-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                  style={{
                    fontFamily: resolveFontFamily(nameCfg?.font),
                  }}
                >
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

      {/* Stage Messages Overlay */}
      <MessageOverlay
        message={payload.activeMessage}
        config={mtElements.message}
        textShadow={textShadowStyle}
      />
    </div>
  );
};
