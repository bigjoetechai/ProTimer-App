/**
 * Precision Digital Timer Display.
 * Renders large broadcast-grade tabular digits.
 */

import React from 'react';

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

  // Dynamic text color: alertColor takes priority, then overtime red, then paused amber, else white
  const effectiveColor = alertColor || (isOvertime ? '#ef4444' : undefined);

  return (
    <div
      onClick={onClick}
      title={title}
      className={`relative inline-flex items-center justify-center bg-black rounded-sm border font-mono font-bold select-none tabular-nums shadow-inner transition-colors duration-200 ${
        onClick ? 'cursor-pointer hover:border-cyan-500 transition-colors' : ''
      } ${sizeClasses[size]}`}
      style={{
        borderColor: effectiveColor ? `${effectiveColor}99` : '#2b2f38',
        boxShadow: effectiveColor ? `inset 0 0 16px ${effectiveColor}25, 0 0 12px ${effectiveColor}33` : undefined,
      }}
    >
      <span
        className={`${!effectiveColor ? (isPaused ? 'text-amber-400' : 'text-white') : ''} ${
          isOvertime || isOnOff ? 'animate-overtime-blink' : isFlash ? 'animate-pulse' : ''
        }`}
        style={effectiveColor ? { color: effectiveColor } : undefined}
      >
        {displayTime}
      </span>
    </div>
  );
};
