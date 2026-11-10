/**
 * Presenter Pop-Out Display (Confidence Monitor).
 * Designed for 360x240 compact always-on-top presenter windows and scales smoothly when resized.
 * Has NO playback/duration controls at the top (clean confidence view for the speaker).
 * Applies all Preferences: Fonts, Font Styles, Sizes & Positions (presenter_window target),
 * Colon Offset, Shadow, Crop & Scale, Colors & Animations, Progress Bar, Background Image, and Logo.
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
import { Pin } from 'lucide-react';

export const PresenterDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);
  const localPrefs = useLivePreferences(payload?.preferences);

  if (!payload) {
    return (
      <div className="h-screen w-screen bg-black text-neutral-400 flex items-center justify-center font-mono text-xs select-none">
        Loading Presenter...
      </div>
    );
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

  const resolvedDigitColor = resolveDisplayDigitColor({
    isOvertime,
    isPaused,
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
    presExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const showProgressBar =
    localPrefs.showProgressBar !== undefined
      ? localPrefs.showProgressBar || Boolean(progressBarCfg?.visible)
      : true;

  return (
    <div
      className={`h-screen w-screen bg-black text-white flex flex-col justify-between p-3 font-mono select-none overflow-hidden relative border ${
        presElements.border?.visible ? 'border-2 border-cyan-400' : 'border-[#222d3d]'
      }`}
    >
      {/* Clean Header Bar (Cue Name & Time of Day — NO playback controls) */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#1c2536] shrink-0 z-20">
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
              {payload.activeTimer?.name || 'STANDBY'}
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
                  fontSize: `calc(clamp(2.25rem, 15vw, 9rem) * ${countdownScale})`,
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
      <div className="pt-1.5 border-t border-[#1c2536] shrink-0 z-20">
        {showProgressBar && (
          <div
            className="bg-neutral-900 rounded-full overflow-hidden mb-1.5 mx-auto"
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
