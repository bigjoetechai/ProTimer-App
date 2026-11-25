/**
 * Precision Digital Timer Display (Main Operator Console).
 * Renders large broadcast-grade tabular digits and applies user Preferences:
 * - Countdown Font family & Font style ('Normal', 'Bold', 'Italic', 'Bold Italic')
 * - Colon vertical offset (`colon.vert`)
 * - Digit colors (`normalDigitsColor`, `warningDigitsColor`, `dangerDigitsColor`, `overtimeDigitsColor`)
 * - Smooth transitions & flash alert toggles
 */

import React from 'react';
import {
  getTargetElements,
  renderTimeWithColonOffset,
  resolveDisplayDigitColor,
  resolveFontFamily,
  resolveFontStyleCss,
  useLivePreferences,
} from '../utilities/displayStyleHelper';

interface DigitDisplayProps {
  timeStr: string;
  isOvertime?: boolean;
  status?: string;
  alertColor?: string;
  isFlash?: boolean;
  isOnOff?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  onClick?: () => void;
  title?: string;
}

export const DigitDisplay: React.FC<DigitDisplayProps> = ({
  timeStr,
  isOvertime = false,
  status = 'idle',
  alertColor,
  isFlash = false,
  isOnOff = false,
  size = 'lg',
  onClick,
  title,
}) => {
  const localPrefs = useLivePreferences();
  const fsElements = getTargetElements(localPrefs, 'fullscreen_ndi_preview');
  const countdownCfg = fsElements.countdown;

  const sizeClasses = {
    sm: 'text-2xl px-3 py-1',
    md: 'text-4xl px-4 py-2',
    lg: 'text-5xl md:text-6xl px-6 py-2 tracking-tight',
    hero: 'text-7xl md:text-9xl px-8 py-4 tracking-tighter',
  };

  const isPaused = status === 'paused';
  // Format overtime as clean positive digits with a leading + sign (e.g., +00:00:15)
  const rawTime = timeStr || '00:00:00';
  const cleanTime = rawTime.replace(/^[+-]/, '');
  const showPlus = isOvertime || rawTime.startsWith('+') || rawTime.startsWith('-');
  const displayTime = showPlus ? `+${cleanTime}` : cleanTime;

  const resolvedDigitColor = isPaused && !alertColor && !isOvertime
    ? '#fbbf24'
    : resolveDisplayDigitColor({
        isOvertime,
        isPaused,
        alertColor,
        prefs: localPrefs,
      });

  const borderGlowColor = alertColor || (isOvertime ? localPrefs.overtimeDigitsColor || '#ef4444' : undefined);

  return (
    <div
      onClick={onClick}
      title={title}
      className={`relative inline-flex items-center justify-center bg-[#09090b] rounded-2xl border select-none tabular-nums ${
        localPrefs.smoothTransitions !== false ? 'transition-all duration-200' : ''
      } ${onClick ? 'cursor-pointer hover:border-cyan-500/80' : ''} ${sizeClasses[size]}`}
      style={{
        borderColor: borderGlowColor ? `${borderGlowColor}aa` : 'rgba(255, 255, 255, 0.14)',
        boxShadow: borderGlowColor
          ? `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 18px ${borderGlowColor}26, 0 8px 20px rgba(0,0,0,0.48)`
          : 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -6px 14px rgba(0,0,0,0.65), 0 8px 20px rgba(0,0,0,0.45)',
      }}
    >
      <span
        className={`${
          isOvertime || isOnOff
            ? 'animate-overtime-blink'
            : isFlash && localPrefs.flashAlertsEnabled !== false
            ? 'animate-pulse'
            : ''
        }`}
        style={{
          color: resolvedDigitColor,
          fontFamily: resolveFontFamily(countdownCfg?.font),
          ...resolveFontStyleCss(countdownCfg?.fontStyle),
        }}
      >
        {renderTimeWithColonOffset(
          displayTime,
          fsElements.colon?.vert,
          fsElements.countdown?.spacing,
          fsElements.colon?.horiz
        )}
      </span>
    </div>
  );
};
