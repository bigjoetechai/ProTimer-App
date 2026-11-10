/**
 * Fullscreen Output Display.
 * Dedicated borderless video output for external monitors, projectors, and confidence displays.
 * - Shows the uploaded background image for the active list (or default background image) when uploaded.
 * - Shows a pure black background (#000000) when no image is uploaded or when the image is removed.
 * - Synchronizes with the central timer engine and allows exiting via Escape key without stopping timers.
 */

import React, { useEffect, useState } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';
import { storageService } from '../services/storageService';
import { AppPreferences, resolveBackgroundImageForList } from '../types';
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
  const [localPrefs, setLocalPrefs] = useState<AppPreferences>(() =>
    storageService.getPreferences()
  );

  // Sync preferences immediately when background images are uploaded or removed
  useEffect(() => {
    const refreshPrefs = () => {
      setLocalPrefs({ ...storageService.getPreferences() });
    };
    window.addEventListener('protimer-prefs-updated', refreshPrefs);
    window.addEventListener('storage', refreshPrefs);
    return () => {
      window.removeEventListener('protimer-prefs-updated', refreshPrefs);
      window.removeEventListener('storage', refreshPrefs);
    };
  }, []);

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

  // Resolve active list's independent background image (or global default; '' when none or removed -> pure black)
  const activeListId = payload.activeListId || 'list_1';
  const resolvedFromPrefs = resolveBackgroundImageForList(localPrefs, activeListId);
  const activeBackgroundImageUrl =
    (payload.backgroundImageUrl !== undefined && payload.backgroundImageUrl !== ''
      ? payload.backgroundImageUrl
      : resolvedFromPrefs) || '';
  const backgroundFit = payload.backgroundFit || localPrefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? localPrefs.backgroundImageOpacity ?? 100;
  const activeLogoUrl = payload.logoImageUrl ?? localPrefs.logoImageDataUrl ?? '';

  // Clock Mode: Large Broadcast Time of Day
  if (payload.isClockMode) {
    return (
      <div
        className="h-screen w-screen bg-black text-white flex flex-col items-center justify-center select-none font-mono relative overflow-hidden"
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

        <div className="relative z-10 text-8xl sm:text-9xl md:text-[15rem] lg:text-[19rem] font-black tracking-tight text-white tabular-nums leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
          {payload.clockTimeFormatted}
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

        <MessageOverlay message={payload.activeMessage} />
      </div>
    );
  }

  const isOvertime = payload.isOvertime;

  return (
    <div
      className="h-screen w-screen bg-black text-white flex flex-col justify-between p-6 sm:p-10 md:p-14 select-none font-mono relative overflow-hidden"
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

      {/* Top Header: Cue Name, Optional Logo & System Time */}
      <div
        className={`relative z-10 flex items-center justify-between border-b pb-4 ${
          activeBackgroundImageUrl
            ? 'border-white/20 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]'
            : 'border-neutral-800/80'
        }`}
      >
        <div className="flex flex-col max-w-[65%]">
          <span className="text-xs uppercase tracking-widest text-neutral-300 font-semibold mb-1">
            CURRENT CUE
          </span>
          <span className="text-2xl sm:text-4xl font-black text-white truncate">
            {payload.activeTimer?.name || 'STANDBY'}
          </span>
          {payload.activeTimer?.endTime && (
            <span className="text-sm text-neutral-300 font-mono mt-0.5">
              Ends at: <span className="text-white font-bold">{payload.activeTimer.endTime}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {activeLogoUrl && (
            <img
              src={activeLogoUrl}
              alt="Logo"
              className="h-10 sm:h-14 w-auto max-w-[160px] object-contain pointer-events-none select-none"
            />
          )}
          <div className="text-right">
            <span className="text-xs uppercase tracking-widest text-neutral-300 font-semibold mb-1 block">
              LOCAL TIME
            </span>
            <span className="text-2xl sm:text-4xl font-bold text-neutral-100 tabular-nums">
              {payload.clockTimeFormatted}
            </span>
          </div>
        </div>
      </div>

      {/* Fullscreen Countdown / Count-up / Overtime Timer Display */}
      <div className="relative z-10 flex-1 flex items-center justify-center my-4">
        <div
          className={`text-8xl sm:text-[13rem] md:text-[18rem] lg:text-[22rem] font-black tracking-tighter tabular-nums leading-none ${
            activeBackgroundImageUrl ? 'drop-shadow-[0_6px_28px_rgba(0,0,0,0.9)]' : ''
          } ${
            isOvertime
              ? 'text-red-500 animate-overtime-blink'
              : payload.alertOnOff
              ? 'animate-overtime-blink'
              : payload.alertFlash
              ? 'animate-pulse'
              : 'text-white'
          }`}
          style={payload.alertColor ? { color: payload.alertColor } : undefined}
        >
          {isOvertime
            ? `+${payload.formattedTime.replace(/^[+-]/, '')}`
            : payload.formattedTime.replace(/^-/, '+')}
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
      <MessageOverlay message={payload.activeMessage} />
    </div>
  );
};
