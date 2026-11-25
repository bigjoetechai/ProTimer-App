/**
 * NDI Broadcast Output Display.
 * Designed for IP video switchers (vMix, OBS, TriCaster, Wirecast) with transparency,
 * chroma key options, and broadcast safe margins.
 * Applies all Preferences: Fonts, Font Styles, Sizes & Positions (fullscreen_ndi_preview target),
 * Colon Offset, Shadow, Crop & Scale, Colors & Animations, Progress Bar, Images, and NDI settings.
 */

import React, { useState } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { MessageOverlay } from '../messages/MessageOverlay';
import {
  formatListNdiSourceName,
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
  useLivePreferences,
} from '../utilities/displayStyleHelper';
import { Radio, Layers, LayoutGrid } from 'lucide-react';

export const NdiDisplay: React.FC = () => {
  const { payload } = useDisplaySync(true);
  const prefs = useLivePreferences(payload?.preferences);
  const urlParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialKeyParam = urlParams?.get('key');
  const [bgMode, setBgMode] = useState<'transparent' | 'black' | 'green'>(
    initialKeyParam === 'transparent' || initialKeyParam === 'green' || initialKeyParam === 'black'
      ? initialKeyParam
      : 'black'
  );
  const [showSafeMargins, setShowSafeMargins] = useState(false);
  const urlMode = urlParams?.get('mode') || null;
  const [multiViewOverride, setMultiViewOverride] = useState<boolean | null>(
    urlMode === 'multi' ? true : urlMode === 'single' ? false : null
  );

  const effectiveBgMode = prefs.ndiAlphaChannel ? 'transparent' : bgMode;

  if (!payload || payload.isBlackout) {
    const blackoutBg =
      effectiveBgMode === 'transparent'
        ? 'bg-transparent'
        : effectiveBgMode === 'green'
        ? 'bg-[#00b140]'
        : 'bg-black';
    return <div className={`h-screen w-screen ${blackoutBg}`} />;
  }

  const requestedListId = urlParams?.get('listId') || urlParams?.get('id') || null;

  const listActiveCues = payload.listActiveCues || [];
  const targetCueSummary = requestedListId
    ? listActiveCues.find((c) => c.listId === requestedListId)
    : listActiveCues.find((c) => c.listId === payload.activeListId) || listActiveCues[0];

  // Strictly prevent leaking another list's timer when a specific listId was pinned in the URL
  const canFallbackToPayload = !requestedListId || requestedListId === payload.activeListId;

  const activeListId =
    targetCueSummary?.listId ||
    requestedListId ||
    payload.activeListId ||
    'list_1';
  const activeListName =
    targetCueSummary?.listName ||
    payload.lists?.find((l) => l.id === activeListId)?.name ||
    (canFallbackToPayload ? payload.activeListName : null) ||
    'List 1';
  const activeTimer = targetCueSummary
    ? targetCueSummary.activeTimer
    : canFallbackToPayload
    ? payload.activeTimer
    : null;
  const nextTimer = targetCueSummary
    ? targetCueSummary.nextTimer
    : canFallbackToPayload
    ? payload.nextTimer
    : null;
  const secondsRemaining = targetCueSummary
    ? targetCueSummary.secondsRemaining
    : canFallbackToPayload
    ? payload.secondsRemaining
    : 0;
  const isOvertime = targetCueSummary
    ? targetCueSummary.isOvertime
    : canFallbackToPayload
    ? payload.isOvertime
    : false;
  const status = targetCueSummary
    ? targetCueSummary.status
    : canFallbackToPayload
    ? payload.status
    : 'idle';
  const activeAlertLevel = targetCueSummary
    ? targetCueSummary.activeAlertLevel
    : canFallbackToPayload
    ? payload.activeAlertLevel
    : 'none';
  const alertColor = targetCueSummary
    ? targetCueSummary.alertColor
    : canFallbackToPayload
    ? payload.alertColor
    : undefined;
  const alertFlash = targetCueSummary
    ? targetCueSummary.alertFlash
    : canFallbackToPayload
    ? payload.alertFlash
    : false;
  const alertOnOff = targetCueSummary
    ? targetCueSummary.alertOnOff
    : canFallbackToPayload
    ? payload.alertOnOff
    : false;
  const progressPercent = targetCueSummary
    ? targetCueSummary.progressPercent
    : canFallbackToPayload
    ? payload.progressPercent
    : 0;

  const ndiRes = prefs.ndiResolution || 'HD - 1920 x 1080';
  const ndiFps = prefs.ndiFrameRate || 30;
  const ndiSourceName =
    payload.ndiSourceNamesByList?.[activeListId] ||
    formatListNdiSourceName(activeListName, prefs.ndiSourceName);
  const isMultiDisplay =
    multiViewOverride !== null
      ? multiViewOverride
      : Boolean(payload.isNdiMultiActive && !requestedListId && listActiveCues.length > 1);
  const ndiGroupLabel =
    prefs.ndiUseCustomGroups && prefs.ndiCustomGroups
      ? `Groups: ${prefs.ndiCustomGroups}`
      : 'Groups: Public';

  const fsElements = getTargetElements(prefs, 'fullscreen_ndi_preview');
  const fsExtras = getTargetExtras(prefs, 'fullscreen_ndi_preview');
  const textShadowStyle = getTargetShadowCss(fsExtras);

  const countdownCfg = fsElements.countdown;
  const nameCfg = fsElements.name;
  const clockCfg = fsElements.clock;
  const dateCfg = fsElements.date;
  const logoCfg = fsElements.logo;
  const progressBarCfg = fsElements.progress_bar;

  const countdownScale = Math.max(0.2, (countdownCfg?.sizePercent ?? 113) / 113);
  const nameScale = Math.max(0.2, (nameCfg?.sizePercent ?? 33) / 33);
  const clockScale = Math.max(0.2, (clockCfg?.sizePercent ?? 33) / 33);
  const dateScale = Math.max(0.2, (dateCfg?.sizePercent ?? 33) / 33);
  const logoScale = Math.max(0.2, (logoCfg?.sizePercent ?? 20) / 20);

  const formattedClock = formatClock(new Date(), undefined, prefs);
  const formattedDate = payload.dateFormatted || formatDate(new Date(), prefs);
  const formattedCountdown = formatSeconds(
    secondsRemaining,
    true,
    isOvertime,
    prefs
  );

  const isDigitalClockCue = activeTimer?.type === 'digital_clock';
  const isEmptyCue = activeTimer?.type === 'empty';
  const displayTime =
    payload.isClockMode || isDigitalClockCue
      ? formattedClock
      : isEmptyCue
      ? '--:--:--'
      : isOvertime
      ? `+${formattedCountdown.replace(/^[+-]/, '')}`
      : formattedCountdown.replace(/^-/, '+');

  const resolvedDigitColor = resolveDisplayDigitColor({
    isOvertime,
    isPaused: status === 'paused',
    activeAlertLevel,
    alertColor,
    prefs,
  });

  const resolvedFromPrefs = resolveBackgroundImageForList(prefs, activeListId);
  const hasLocalListBgMap = Boolean(
    prefs.listBackgroundImages && Object.keys(prefs.listBackgroundImages).length > 0
  );
  const rawBgImageUrl =
    resolvedFromPrefs ||
    targetCueSummary?.backgroundImageUrl ||
    (!hasLocalListBgMap && activeListId === payload.activeListId
      ? payload.backgroundImageUrl || ''
      : '');
  const activeBackgroundImageUrl = prefs.ndiAlphaChannel ? '' : rawBgImageUrl;
  const backgroundFit = payload.backgroundFit || prefs.backgroundFit || 'cover';
  const backgroundOpacity =
    payload.backgroundImageOpacity ?? prefs.backgroundImageOpacity ?? 100;
  const resolvedLogoFromPrefs = resolveLogoImageForList(prefs, activeListId);
  const hasLocalListLogoMap = Boolean(
    prefs.listLogoImages && Object.keys(prefs.listLogoImages).length > 0
  );
  const activeLogoUrl =
    resolvedLogoFromPrefs ||
    targetCueSummary?.logoImageUrl ||
    (!hasLocalListLogoMap && activeListId === payload.activeListId
      ? payload.logoImageUrl || ''
      : '');

  const { outerStyle, innerTransformStyle } = getTargetCanvasStyles(
    fsExtras,
    Boolean(activeBackgroundImageUrl)
  );

  const bgClasses = {
    transparent: 'bg-transparent',
    black: 'bg-black',
    green: 'bg-[#00b140]',
  }[effectiveBgMode];

  const showProgressBar = Boolean(prefs.showProgressBar || progressBarCfg?.visible);

  return (
    <div
      className={`h-screen w-screen ${bgClasses} text-white flex flex-col justify-between p-8 font-mono select-none relative overflow-hidden ${
        fsElements.border?.visible ? 'border-4 border-cyan-500/80' : ''
      }`}
      style={{
        ...(effectiveBgMode === 'black' ? outerStyle : {}),
        borderRadius: outerStyle.borderRadius,
        clipPath: outerStyle.clipPath,
      }}
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
            height: `${Math.round(52 * logoScale)}px`,
            maxWidth: `${Math.round(200 * logoScale)}px`,
            transform: getElementOffsetTransform(logoCfg, 3),
          }}
        />
      )}

      {/* Safe Title Margins Overlay */}
      {showSafeMargins && (
        <div className="absolute inset-12 border border-dashed border-cyan-500/40 pointer-events-none flex items-start justify-end p-2 z-20">
          <span className="text-[10px] text-cyan-400 bg-black/60 px-1 rounded">ACTION / TITLE SAFE 90%</span>
        </div>
      )}

      {/* Top NDI Metadata Toolbar (Hidden by default for clean broadcast capture; visible on hover) */}
      <div className="flex items-center justify-between opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-20">
        <div className="flex items-center gap-2 text-xs">
          <Radio className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="font-bold text-red-400">
            NDI|HX OUT:{' '}
            {isMultiDisplay
              ? listActiveCues
                  .map((c) => formatListNdiSourceName(c.listName, prefs.ndiSourceName))
                  .join(' • ')
              : ndiSourceName}
          </span>
          <span className="text-neutral-400">
            {ndiRes} @ {ndiFps} FPS • {ndiGroupLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {listActiveCues.length > 1 && (
            <button
              type="button"
              onClick={() => setMultiViewOverride(!isMultiDisplay)}
              className="px-2 py-1 bg-black/70 hover:bg-black rounded text-[11px] text-emerald-300 border border-emerald-700/60 flex items-center gap-1 cursor-pointer"
            >
              <LayoutGrid className="w-3 h-3 text-emerald-400" />
              {isMultiDisplay ? 'Multi NDI Grid' : `Single (${activeListName})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSafeMargins(!showSafeMargins)}
            className="px-2 py-1 bg-black/70 hover:bg-black rounded text-[11px] text-neutral-300 border border-neutral-700 cursor-pointer"
          >
            Safe Area
          </button>
          <button
            type="button"
            onClick={() => {
              const nextMode = bgMode === 'black' ? 'transparent' : bgMode === 'transparent' ? 'green' : 'black';
              setBgMode(nextMode);
            }}
            className="px-2 py-1 bg-black/70 hover:bg-black rounded text-[11px] text-neutral-300 border border-neutral-700 flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3 h-3 text-cyan-400" />
            Key: {effectiveBgMode.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Center Digital Clock / Counter or Multi-NDI Display Grid */}
      {isMultiDisplay && listActiveCues.length > 0 ? (
        <div
          className={`relative z-10 my-auto grid gap-4 w-full h-[78vh] ${
            listActiveCues.length === 1
              ? 'grid-cols-1'
              : listActiveCues.length === 2
              ? 'grid-cols-2'
              : listActiveCues.length <= 4
              ? 'grid-cols-2 grid-rows-2'
              : 'grid-cols-3'
          }`}
        >
          {listActiveCues.map((cueItem) => {
            const tileSourceName =
              payload.ndiSourceNamesByList?.[cueItem.listId] ||
              formatListNdiSourceName(cueItem.listName, prefs.ndiSourceName);
            const tileTime = formatSeconds(
              cueItem.secondsRemaining,
              true,
              cueItem.isOvertime,
              prefs
            );
            const tileDisplayTime = payload.isClockMode
              ? formattedClock
              : cueItem.isOvertime
              ? `+${tileTime.replace(/^[+-]/, '')}`
              : tileTime.replace(/^-/, '+');
            const tileDigitColor = resolveDisplayDigitColor({
              isOvertime: cueItem.isOvertime,
              isPaused: cueItem.status === 'paused',
              activeAlertLevel: cueItem.activeAlertLevel,
              alertColor: cueItem.alertColor,
              prefs,
            });
            return (
              <div
                key={cueItem.listId}
                className="rounded-xl border border-emerald-500/40 bg-black/65 p-4 flex flex-col justify-between relative overflow-hidden"
              >
                <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    {tileSourceName}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] uppercase tracking-wider text-neutral-300">
                    {cueItem.status}
                  </span>
                </div>

                <div className="my-auto text-center">
                  {cueItem.activeTimer && (
                    <div className="text-cyan-300 uppercase tracking-wider font-semibold text-sm sm:text-base mb-1 truncate">
                      {cueItem.activeTimer.name}
                    </div>
                  )}
                  <div
                    className="font-bold tabular-nums tracking-tighter leading-none"
                    style={{
                      fontSize: 'clamp(2.5rem, 6vw, 6.5rem)',
                      color: tileDigitColor,
                      fontFamily: resolveFontFamily(countdownCfg?.font),
                    }}
                  >
                    {renderTimeWithColonOffset(
                      tileDisplayTime,
                      fsElements.colon?.vert,
                      fsElements.countdown?.spacing,
                      fsElements.colon?.horiz
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-400 border-t border-white/10 pt-2">
                  <span>LIST: {cueItem.listName}</span>
                  <span>NEXT: {cueItem.nextTimer?.name || 'STANDBY'}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="relative z-10 my-auto flex flex-col items-center justify-center text-center"
          style={innerTransformStyle}
        >
          {(clockCfg?.visible || dateCfg?.visible) && (
            <div className="flex items-center gap-4 mb-3">
              {clockCfg?.visible && (
                <span
                  className="text-neutral-200 tabular-nums"
                  style={{
                    fontFamily: resolveFontFamily(clockCfg?.font),
                    ...resolveFontStyleCss(clockCfg?.fontStyle),
                    fontSize: `calc(clamp(1.25rem, 2.5vw, 2.5rem) * ${clockScale})`,
                    textShadow: textShadowStyle,
                  }}
                >
                  {formattedClock}
                </span>
              )}
              {dateCfg?.visible && (
                <span
                  className="text-neutral-300"
                  style={{
                    fontFamily: resolveFontFamily(dateCfg?.font),
                    ...resolveFontStyleCss(dateCfg?.fontStyle),
                    fontSize: `calc(clamp(1.1rem, 2.2vw, 2.2rem) * ${dateScale})`,
                    textShadow: textShadowStyle,
                  }}
                >
                  {formattedDate}
                </span>
              )}
            </div>
          )}

          {nameCfg?.visible !== false && activeTimer && (
            <div
              className="tracking-wider uppercase text-cyan-300 mb-2 drop-shadow-md"
              style={{
                fontFamily: resolveFontFamily(nameCfg?.font),
                ...resolveFontStyleCss(nameCfg?.fontStyle),
                fontSize: `calc(clamp(1.35rem, 3vw, 2.75rem) * ${nameScale})`,
                textShadow: textShadowStyle,
                transform: getElementOffsetTransform(nameCfg, 3),
              }}
            >
              {activeTimer.name}
            </div>
          )}

          {countdownCfg?.visible !== false && (
            <div
              className={`tracking-tighter tabular-nums leading-none drop-shadow-2xl ${
                prefs.smoothTransitions !== false ? 'transition-colors duration-300' : ''
              } ${
                isOvertime
                  ? 'animate-overtime-blink'
                  : alertOnOff
                  ? 'animate-overtime-blink'
                  : alertFlash && prefs.flashAlertsEnabled !== false
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{
                fontSize: `calc(clamp(4.5rem, 15vw, 16rem) * ${countdownScale})`,
                color: resolvedDigitColor,
                fontFamily: resolveFontFamily(countdownCfg?.font),
                ...resolveFontStyleCss(countdownCfg?.fontStyle),
                textShadow: textShadowStyle,
                transform: getElementOffsetTransform(countdownCfg, 4),
              }}
            >
              {renderTimeWithColonOffset(
                displayTime,
                fsElements.colon?.vert,
                fsElements.countdown?.spacing,
                fsElements.colon?.horiz
              )}
            </div>
          )}

          {showProgressBar && (
            <div
              className="bg-neutral-900/85 rounded-full overflow-hidden border border-white/10 mt-6 mx-auto"
              style={{
                width: `${Math.min(100, Math.max(15, progressBarCfg?.sizePercent ?? 100))}%`,
                height: `${prefs.progressBarHeightPx ?? 12}px`,
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
          )}
        </div>
      )}

      {/* Bottom Info Bar (Hidden by default for clean broadcast capture; visible on hover) */}
      <div
        className="relative z-10 flex items-center justify-between text-xs text-neutral-400 border-t border-neutral-800/60 pt-2 opacity-0 hover:opacity-100 transition-opacity duration-200"
        style={{
          fontFamily: resolveFontFamily(nameCfg?.font),
        }}
      >
        <span>STATUS: {status.toUpperCase()}</span>
        <span>SPEED: {activeTimer?.speed ?? payload.speed}%</span>
        <span>NEXT: {nextTimer?.name || 'STANDBY'}</span>
      </div>

      <MessageOverlay
        message={payload.activeMessage}
        config={fsElements.message}
        textShadow={textShadowStyle}
      />
    </div>
  );
};
