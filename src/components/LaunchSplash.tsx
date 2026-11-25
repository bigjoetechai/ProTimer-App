import React, { useEffect, useState, useCallback } from 'react';
import { useTheme } from '../context';

interface LaunchSplashProps {
  onComplete: () => void;
}

const BRAND_LETTERS: Array<{ char: string; accent: boolean }> = [
  { char: 'P', accent: false },
  { char: 'R', accent: false },
  { char: 'O', accent: false },
  { char: 'T', accent: true },
  { char: 'I', accent: true },
  { char: 'M', accent: true },
  { char: 'E', accent: true },
  { char: 'R', accent: true },
];

export const LaunchSplash: React.FC<LaunchSplashProps> = ({ onComplete }) => {
  const { isDark } = useTheme();
  const [isExiting, setIsExiting] = useState(false);
  const [logoFallbackSvg, setLogoFallbackSvg] = useState(false);

  const beginExit = useCallback(() => {
    setIsExiting(true);
  }, []);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const holdMs = prefersReducedMotion ? 550 : 1650;
    const holdTimer = window.setTimeout(() => {
      setIsExiting(true);
    }, holdMs);

    return () => {
      window.clearTimeout(holdTimer);
    };
  }, []);

  useEffect(() => {
    if (!isExiting) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fadeDurationMs = prefersReducedMotion ? 180 : 480;
    const finishTimer = window.setTimeout(() => {
      onComplete();
    }, fadeDurationMs);

    return () => {
      window.clearTimeout(finishTimer);
    };
  }, [isExiting, onComplete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        beginExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [beginExit]);

  return (
    <div
      role="status"
      aria-label="Launching ProTimer"
      onClick={beginExit}
      className={`fixed inset-0 z-[10000] flex flex-col items-center justify-center select-none overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isExiting ? 'opacity-0 scale-[1.03] pointer-events-none' : 'opacity-100 scale-100'
      }`}
      style={{
        background: isDark
          ? 'radial-gradient(90% 80% at 50% 42%, #222329 0%, #141418 52%, #0c0c0f 100%)'
          : 'radial-gradient(90% 80% at 50% 42%, #eef2f8 0%, #dde4ef 55%, #cfd8e6 100%)',
      }}
    >
      {/* Subtle ambient cyan radial bloom behind emblem */}
      <div
        aria-hidden="true"
        className="splash-glow-breathe pointer-events-none absolute w-[360px] h-[360px] rounded-full"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(6,182,212,0.16) 0%, rgba(6,182,212,0.04) 44%, transparent 72%)'
            : 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, rgba(6,182,212,0.05) 45%, transparent 72%)',
        }}
      />

      {/* Centered Brand Lockup */}
      <div className="relative flex flex-col items-center">
        {/* Precision Dial Ring + Frosted Glass Logo Tile */}
        <div className="relative flex items-center justify-center w-[136px] h-[136px]">
          <svg
            aria-hidden="true"
            viewBox="0 0 132 132"
            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
          >
            {/* Subtle recessed outer dial track */}
            <circle
              cx="66"
              cy="66"
              r="60"
              fill="none"
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)'}
              strokeWidth="1.5"
            />
            {/* Animated precision timer sweep arc */}
            <circle
              cx="66"
              cy="66"
              r="60"
              fill="none"
              stroke="url(#protimerSplashArc)"
              strokeWidth="2.25"
              strokeLinecap="round"
              className="splash-ring-sweep"
            />
            <defs>
              <linearGradient id="protimerSplashArc" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="60%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor={isDark ? 'rgba(255,255,255,0.85)' : '#0284c7'} />
              </linearGradient>
            </defs>
          </svg>

          {/* Frosted Glass Emblem Housing */}
          <div className="splash-logo-enter glass-card relative w-[96px] h-[96px] rounded-[26px] p-2.5 flex items-center justify-center overflow-hidden">
            {!logoFallbackSvg ? (
              <img
                src="/assets/aistudio/icon_ec9a41ea.png"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.endsWith('/icon.png')) {
                    target.src = './icon.png';
                  } else {
                    setLogoFallbackSvg(true);
                  }
                }}
                alt="ProTimer Logo"
                draggable={false}
                className="relative z-10 w-full h-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <svg
                viewBox="0 0 64 64"
                aria-label="ProTimer Logo"
                className="relative z-10 w-full h-full"
              >
                <rect x="2" y="2" width="60" height="60" rx="16" fill="#072146" stroke="#06b6d4" strokeWidth="2" />
                <circle cx="32" cy="32" r="20" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
                <line x1="32" y1="32" x2="43" y2="25" stroke="#06b6d4" strokeWidth="4" strokeLinecap="round" />
              </svg>
            )}

            {/* Diagonal Glass Sheen Sweep */}
            <div
              aria-hidden="true"
              className="splash-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 z-20"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)',
              }}
            />
          </div>
        </div>

        {/* Animated Wordmark: PRO + TIMER */}
        <h1
          className="mt-6 flex items-baseline font-bold tracking-[0.22em] pl-[0.22em] text-[30px] sm:text-[34px] leading-none"
          style={{
            textShadow: isDark
              ? '0 4px 18px rgba(0, 0, 0, 0.55)'
              : '0 2px 10px rgba(15, 23, 42, 0.12)',
          }}
        >
          {BRAND_LETTERS.map((item, idx) => (
            <span
              key={`${item.char}-${idx}`}
              className={`splash-letter-rise inline-block ${
                item.accent
                  ? isDark
                    ? 'text-cyan-400'
                    : 'text-cyan-600'
                  : isDark
                    ? 'text-neutral-100'
                    : 'text-slate-900'
              }`}
              style={{ animationDelay: `${300 + idx * 45}ms` }}
            >
              {item.char}
            </span>
          ))}
        </h1>

        {/* Precision Center-Expanding Hairline Rule */}
        <div
          aria-hidden="true"
          className="splash-divider-expand mt-3.5 h-px w-32"
          style={{
            background: isDark
              ? 'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.65) 50%, transparent 100%)'
              : 'linear-gradient(90deg, transparent 0%, rgba(8,145,178,0.55) 50%, transparent 100%)',
          }}
        />

        {/* Quiet Subtitle */}
        <p
          className={`splash-subtitle-fade mt-3 text-[12px] font-medium tracking-[0.16em] ${
            isDark ? 'text-neutral-400' : 'text-slate-600'
          }`}
        >
          Multi-Timer Management
        </p>
      </div>
    </div>
  );
};
