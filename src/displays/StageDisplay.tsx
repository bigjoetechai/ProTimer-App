/**
 * Stage Display (LAN / Web Display).
 * Optimized for stage crew, backstage monitors, and band/audio engineers.
 * Applies all Preferences: Fonts, Font Styles, Sizes & Positions (web_display_lan target),
 * Colon Offset, Shadow, Crop & Scale, Colors & Animations, Progress Bar, and Images.
 */

import React from 'react';
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

export const StageDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);
  const localPrefs = useLivePreferences(payload?.preferences);

  if (!payload || payload.isBlackout) {
    return <div className="h-screen w-screen bg-black" />;
  }

  const isOvertime = payload.isOvertime;
  const webElements = getTargetElements(localPrefs, 'web_display_lan');
  const webExtras = getTargetExtras(localPrefs, 'web_display_lan');
  const textShadowStyle = getTargetShadowCss(webExtras);

  const countdownCfg = webElements.countdown;
  const nameCfg = webElements.name;
  const clockCfg = webElements.clock;
  const dateCfg = webElements.date;
  const progressBarCfg = webElements.progress_bar;
  const logoCfg = webElements.logo;
  const slideTextCfg = webElements.slide_text;

  const countdownScale = Math.max(0.2, (countdownCfg?.sizePercent ?? 113) / 113);
  const nameScale = Math.max(0.2, (nameCfg?.sizePercent ?? 33) / 33);
  const clockScale = Math.max(0.2, (clockCfg?.sizePercent ?? 33) / 33);
  const dateScale = Math.max(0.2, (dateCfg?.sizePercent ?? 33) / 33);
  const logoScale = Math.max(0.2, (logoCfg?.sizePercent ?? 20) / 20);

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

  const resolvedDigitColor = resolveDisplayDigitColor({
    isOvertime,
    isPaused: payload.status === 'paused',
    activeAlertLevel: payload.activeAlertLevel,
    alertColor: payload.alertColor,
    prefs: localPrefs,
  });

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
    webExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  return (
    <div
      className={`h-screen w-screen bg-[#08090b] text-white flex flex-col p-6 font-mono select-none relative overflow-hidden ${
        webElements.border?.visible ? 'border-4 border-cyan-500/80' : ''
      }`}
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
          className={`absolute z-20 object-contain pointer-events-none select-none ${getLogoLocationClasses(
            logoCfg?.location
          )}`}
          style={{
            height: `${Math.round(48 * logoScale)}px`,
            maxWidth: `${Math.round(180 * logoScale)}px`,
            transform: getElementOffsetTransform(logoCfg, 3),
          }}
        />
      )}

      <div className="relative z-10 grid grid-cols-2 gap-4 pb-4 border-b border-neutral-800">
        <div>
          {nameCfg?.visible !== false && (
            <div
              style={{
                fontFamily: resolveFontFamily(nameCfg?.font),
                ...resolveFontStyleCss(nameCfg?.fontStyle),
                textShadow: textShadowStyle,
                transform: getElementOffsetTransform(nameCfg, 2.5),
              }}
            >
              <span className="text-xs text-neutral-400 uppercase tracking-widest block font-semibold">
                CUE
              </span>
              <span
                className="text-white truncate block"
                style={{
                  fontSize: `calc(clamp(1.25rem, 2.5vw, 2.25rem) * ${nameScale})`,
                }}
              >
                {payload.activeTimer?.name || 'STANDBY'}
              </span>
              {payload.activeTimer?.endTime && (
                <span className="text-xs text-neutral-400 font-mono">
                  Ends at: <span className="text-neutral-200 font-bold">{payload.activeTimer.endTime}</span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs text-neutral-500 uppercase tracking-widest block">TIME OF DAY</span>
          <span
            className="text-white tabular-nums block"
            style={{
              fontFamily: resolveFontFamily(clockCfg?.font),
              ...resolveFontStyleCss(clockCfg?.fontStyle || 'Bold'),
              fontSize: `calc(clamp(1.25rem, 2.5vw, 2.25rem) * ${clockScale})`,
              textShadow: textShadowStyle,
            }}
          >
            {formattedClock}
          </span>
          {dateCfg?.visible && (
            <span
              className="text-neutral-300 block mt-0.5"
              style={{
                fontFamily: resolveFontFamily(dateCfg?.font),
                ...resolveFontStyleCss(dateCfg?.fontStyle),
                fontSize: `calc(clamp(0.85rem, 1.5vw, 1.25rem) * ${dateScale})`,
                textShadow: textShadowStyle,
              }}
            >
              {formattedDate}
            </span>
          )}
        </div>
      </div>

      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-center"
        style={innerTransformStyle}
      >
        {countdownCfg?.visible !== false && (
          <div
            className={`tabular-nums tracking-tighter leading-none ${
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
            style={{
              fontSize: `calc(clamp(4rem, 14vw, 14rem) * ${countdownScale})`,
              color: resolvedDigitColor,
              fontFamily: resolveFontFamily(countdownCfg?.font),
              ...resolveFontStyleCss(countdownCfg?.fontStyle),
              textShadow: textShadowStyle,
              transform: getElementOffsetTransform(countdownCfg, 3.5),
            }}
          >
            {renderTimeWithColonOffset(displayTime, webElements.colon?.vert)}
          </div>
        )}

        {slideTextCfg?.visible && payload.activeTimer?.notes && (
          <div
            className="text-cyan-300 mt-2 text-center max-w-[85vw] truncate"
            style={{
              fontFamily: resolveFontFamily(slideTextCfg?.font),
              ...resolveFontStyleCss(slideTextCfg?.fontStyle),
              fontSize: `calc(clamp(1rem, 2vw, 1.75rem) * ${(slideTextCfg.sizePercent ?? 33) / 33})`,
              textShadow: textShadowStyle,
            }}
          >
            {payload.activeTimer.notes}
          </div>
        )}

        {showProgressBar && (
          <div
            className="bg-neutral-900 rounded-full overflow-hidden mt-4 mx-auto border border-white/10"
            style={{
              width: `${Math.min(100, Math.max(15, progressBarCfg?.sizePercent ?? 100))}%`,
              height: `${localPrefs.progressBarHeightPx ?? 12}px`,
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
        )}

        <div className="mt-4 flex items-center gap-4 text-sm text-neutral-400">
          <span>PROGRESS: {Math.round(payload.progressPercent)}%</span>
          <span>•</span>
          <span>SPEED: {payload.speed}%</span>
          <span>•</span>
          <span className="text-emerald-400 uppercase font-bold">{payload.status}</span>
        </div>
      </div>

      <div
        className="relative z-10 border-t border-neutral-800 pt-4 flex items-center justify-between text-xs text-neutral-400"
        style={{
          fontFamily: resolveFontFamily(nameCfg?.font),
        }}
      >
        <span>NEXT: {payload.nextTimer?.name || 'None'}</span>
        <span>PROTIMER STAGE OUTPUT</span>
      </div>

      <MessageOverlay
        message={payload.activeMessage}
        config={webElements.message}
        textShadow={textShadowStyle}
      />
    </div>
  );
};
