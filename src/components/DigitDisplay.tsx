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
      className={`relative inline-flex items-center justify-center bg-black rounded-sm border select-none tabular-nums shadow-inner ${
        localPrefs.smoothTransitions !== false ? 'transition-colors duration-200' : ''
      } ${onClick ? 'cursor-pointer hover:border-cyan-500 transition-colors' : ''} ${sizeClasses[size]}`}
      style={{
        borderColor: borderGlowColor ? `${borderGlowColor}99` : '#2b2f38',
        boxShadow: borderGlowColor
          ? `inset 0 0 16px ${borderGlowColor}25, 0 0 12px ${borderGlowColor}33`
          : undefined,
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
        {renderTimeWithColonOffset(displayTime, fsElements.colon?.vert)}
      </span>
    </div>
  );
};
