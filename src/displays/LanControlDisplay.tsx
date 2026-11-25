/**
 * LAN Web Remote Control Display.
 * Optimized for mobile smartphones, tablets, and remote AV operators over local network.
 * Supports:
 * - Access PIN security & pairing
 * - Start, Pause, Stop, Restart
 * - Change selected timers from the active rundown
 * - Live duration adjustments (+1m, -1m, +5m, -5m)
 * - Custom stage messages & presets
 * - Display blanking (Blackout) and Clock toggle
 */

import React, { useState, useEffect } from 'react';
import { useDisplaySync } from '../hooks/useDisplaySync';
import { resolveApiUrl } from '../utils/apiUrl';
import {
  getTargetElements,
  renderTimeWithColonOffset,
  resolveDisplayDigitColor,
  resolveFontFamily,
  resolveFontStyleCss,
  useLivePreferences,
} from '../utilities/displayStyleHelper';
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  SkipForward, 
  SkipBack, 
  EyeOff, 
  Clock, 
  Wifi, 
  Lock, 
  Unlock, 
  MessageSquare, 
  ListPlus, 
  Plus, 
  Minus,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Radio,
  Layers
} from 'lucide-react';

export const LanControlDisplay: React.FC = () => {
  const { payload, sendRemoteCommand } = useDisplaySync(true);
  const localPrefs = useLivePreferences(payload?.preferences);

  const pinnedListId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('listId') || ''
      : '';
  const pinStorageKey = pinnedListId
    ? `protimer_lan_pin_${pinnedListId}`
    : 'protimer_lan_pin';

  // Pairing & PIN authentication state
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Message composer state
  const [customMsg, setCustomMsg] = useState<string>('');
  const [msgSentNotice, setMsgSentNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'timers' | 'messages'>('control');

  // Check if PIN is required for this list or if saved PIN is valid on mount
  useEffect(() => {
    let cancelled = false;
    const checkInitialAccess = async () => {
      try {
        const infoRes = await fetch(
          resolveApiUrl(`/api/lan/info${pinnedListId ? `?listId=${encodeURIComponent(pinnedListId)}` : ''}`)
        );
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          if (infoData.pinRequired === false) {
            if (!cancelled) setIsPaired(true);
            return;
          }
        }
      } catch {
        // Proceed to saved PIN check
      }

      const savedPin =
        sessionStorage.getItem(pinStorageKey) || sessionStorage.getItem('protimer_lan_pin');
      if (savedPin && !cancelled) {
        verifyPin(savedPin);
      }
    };
    checkInitialAccess();
    return () => {
      cancelled = true;
    };
  }, [pinnedListId, pinStorageKey]);

  const verifyPin = async (pinToTest: string) => {
    setIsVerifying(true);
    setPinError(null);
    try {
      const res = await fetch(resolveApiUrl('/api/lan/verify-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pinToTest,
          listId: pinnedListId || undefined,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        sessionStorage.setItem(pinStorageKey, pinToTest);
        sessionStorage.setItem('protimer_lan_pin', pinToTest);
        setIsPaired(true);
      } else {
        setPinError('Invalid Access PIN for this list. Check Master Console.');
        sessionStorage.removeItem(pinStorageKey);
        setIsPaired(false);
      }
    } catch {
      // In offline or local fallback, allow default 1234
      if (pinToTest === '1234') {
        sessionStorage.setItem(pinStorageKey, pinToTest);
        sessionStorage.setItem('protimer_lan_pin', pinToTest);
        setIsPaired(true);
      } else {
        setPinError('Could not connect to verify PIN');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) return;
    verifyPin(pinInput.trim());
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem(pinStorageKey);
    sessionStorage.removeItem('protimer_lan_pin');
    setIsPaired(false);
    setPinInput('');
  };

  const effectiveListId = pinnedListId || payload?.activeListId || 'list_1';

  const dispatchCommand = (cmd: string, data?: Record<string, unknown>) => {
    sendRemoteCommand(cmd, {
      ...(data || {}),
      listId: effectiveListId,
    });
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    dispatchCommand('SET_MESSAGE', { text: text.trim(), visible: true });
    setMsgSentNotice(`Message Sent: "${text.trim()}"`);
    setTimeout(() => setMsgSentNotice(null), 3000);
  };

  const handleClearMessage = () => {
    dispatchCommand('CLEAR_MESSAGE');
    setMsgSentNotice('Message Cleared');
    setTimeout(() => setMsgSentNotice(null), 2000);
  };

  // --- 1. PIN PAIRING MODAL / SCREEN ---
  if (!isPaired) {
    return (
      <div className="h-screen w-full overflow-y-auto overflow-x-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#1e1e22_0%,#131316_55%,#0c0c0e_100%)] text-white flex flex-col justify-center items-center p-4 sm:p-6 select-none font-sans">
        <div className="glass-card w-full max-w-sm rounded-[36px] p-6 my-auto">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="glass-btn glass-btn-cyan w-12 h-12 flex items-center justify-center mb-2.5 pointer-events-none">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-wide text-white">PROTIMER REMOTE</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Enter the 4-digit Access PIN displayed on the Master Console to pair this device.
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-3.5">
            <div>
              <div className="flex justify-center gap-2 mb-2.5">
                {[0, 1, 2, 3].map((idx) => {
                  const digit = pinInput[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-11 h-12 rounded-2xl border flex items-center justify-center font-mono text-xl font-bold transition-all ${
                        digit
                          ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300 shadow-[inset_0_1px_0_rgba(165,243,252,0.3)]'
                          : 'glass-input text-neutral-600'
                      }`}
                    >
                      {digit ? '•' : ''}
                    </div>
                  );
                })}
              </div>

              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter PIN (Default: 1234)"
                className="glass-input w-full text-center px-3 py-2 rounded-full text-base font-mono tracking-widest text-white focus:outline-none"
                autoFocus
              />
            </div>

            {pinError && (
              <div className="flex items-center gap-2 text-xs text-red-300 bg-red-950/45 p-2.5 rounded-2xl border border-red-500/40">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {/* Quick Numpad for Phone / Tablet Touch */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    if (pinInput.length < 6) setPinInput((prev) => prev + num);
                  }}
                  className="glass-btn h-11 font-mono text-base font-semibold cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="glass-btn glass-btn-subtle h-11 text-xs font-semibold cursor-pointer"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pinInput.length < 6) setPinInput((prev) => prev + '0');
                }}
                className="glass-btn h-11 font-mono text-base font-semibold cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="glass-btn glass-btn-subtle h-11 text-xs font-semibold cursor-pointer"
              >
                ⌫
              </button>
            </div>

            <button
              type="submit"
              disabled={isVerifying || pinInput.length < 4}
              className={`glass-btn w-full py-2.5 font-bold text-sm tracking-wide cursor-pointer ${
                pinInput.length >= 4 && !isVerifying ? 'glass-btn-cyan-active' : ''
              }`}
            >
              {isVerifying ? 'VERIFYING...' : 'PAIR & CONNECT'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 2. LOADING STATE ---
  if (!payload) {
    return (
      <div className="h-screen w-full overflow-y-auto bg-[radial-gradient(120%_90%_at_50%_0%,#1e1e22_0%,#131316_55%,#0c0c0e_100%)] text-white flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-sm font-medium text-neutral-300">Synchronizing with ProTimer Master...</span>
      </div>
    );
  }

  const listCueSummary = payload.listActiveCues?.find((c) => c.listId === effectiveListId);
  const currentListName =
    listCueSummary?.listName ||
    payload.lists?.find((l) => l.id === effectiveListId)?.name ||
    payload.activeListName ||
    'List 1';
  const currentActiveTimer = listCueSummary ? listCueSummary.activeTimer : payload.activeTimer;
  const currentNextTimer = listCueSummary ? listCueSummary.nextTimer : payload.nextTimer;
  const currentStatus = listCueSummary ? listCueSummary.status : payload.status;
  const currentFormattedTime = listCueSummary ? listCueSummary.formattedTime : payload.formattedTime;
  const currentProgressPercent = listCueSummary
    ? listCueSummary.progressPercent
    : payload.progressPercent;
  const currentIsOvertime = listCueSummary ? listCueSummary.isOvertime : payload.isOvertime;
  const currentAlertLevel = listCueSummary
    ? listCueSummary.activeAlertLevel
    : payload.activeAlertLevel;
  const currentAlertColor = listCueSummary ? listCueSummary.alertColor : payload.alertColor;
  const currentAlertFlash = listCueSummary ? listCueSummary.alertFlash : payload.alertFlash;
  const currentAlertOnOff = listCueSummary ? listCueSummary.alertOnOff : payload.alertOnOff;
  const currentTimerList = listCueSummary?.timerList || payload.timerList || [];

  const isRunning = currentStatus === 'running' || currentStatus === 'overtime';
  const isPaused = currentStatus === 'paused';
  const availableLists = payload.lists && payload.lists.length > 0 ? payload.lists : [];

  return (
    <div className="h-screen w-full overflow-y-auto overflow-x-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#1e1e22_0%,#131316_55%,#0c0c0e_100%)] text-white select-none font-sans">
      <div className="max-w-lg mx-auto min-h-full flex flex-col p-2.5 sm:p-3.5 pb-5">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08] mb-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="text-xs font-bold tracking-wider text-cyan-400 uppercase truncate">
              PROTIMER LAN CONTROL • {currentListName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 font-mono font-semibold">
              {currentListName}
            </span>
            <button
              type="button"
              onClick={handleDisconnect}
              title="Lock & Disconnect"
              aria-label="Lock and Disconnect"
              className="glass-btn glass-btn-subtle w-7 h-7 flex items-center justify-center cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Cue List Selector Strip (only shown if not pinned to a dedicated list tab) */}
        {!pinnedListId && availableLists.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-2 shrink-0 no-scrollbar">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 shrink-0 mr-0.5">
              Cue List:
            </span>
            {availableLists.map((list) => {
              const isCurrentList = list.id === effectiveListId;
              const hasRunning = (list.runningCount || 0) > 0;
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => {
                    if (!isCurrentList) {
                      sendRemoteCommand('SWITCH_LIST', { listId: list.id });
                    }
                  }}
                  className={`glass-btn glass-btn-subtle px-3 py-1 text-[11px] font-semibold whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isCurrentList ? 'glass-btn-cyan-active' : ''
                  }`}
                >
                  {hasRunning && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  <span>{list.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Navigation Tabs: Control | Rundown Timers | Messages */}
        <div className="glass-subcard grid grid-cols-3 gap-1 p-1 rounded-full mb-2.5 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('control')}
            className={`py-1.5 rounded-full transition-all cursor-pointer ${
              activeTab === 'control'
                ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Control
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timers')}
            className={`py-1.5 rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'timers'
                ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span>Timers</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/35 text-neutral-200">
              {currentTimerList.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className={`py-1.5 rounded-full transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'messages'
                ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Messages</span>
          </button>
        </div>

        {/* Notification Toast */}
        {msgSentNotice && (
          <div className="mb-2 px-3.5 py-1.5 bg-emerald-950/75 border border-emerald-500/45 rounded-full text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{msgSentNotice}</span>
          </div>
        )}

        {/* =========================================================================
            TAB 1: PRIMARY OPERATOR CONTROL
           ========================================================================= */}
        {activeTab === 'control' && (
          <div className="flex-1 flex flex-col justify-between gap-2.5">
            {/* Active Cue Card */}
            {(() => {
              const webElements = getTargetElements(localPrefs, 'web_display_lan');
              const countdownCfg = webElements.countdown;
              const nameCfg = webElements.name;
              const resolvedColor = resolveDisplayDigitColor({
                isOvertime: currentIsOvertime,
                isPaused: currentStatus === 'paused',
                activeAlertLevel: currentAlertLevel,
                alertColor: currentAlertColor,
                prefs: localPrefs,
              });
              const formattedStr = payload.isClockMode
                ? payload.clockTimeFormatted
                : currentIsOvertime
                ? `+${currentFormattedTime.replace(/^[+-]/, '')}`
                : currentFormattedTime.replace(/^-/, '+');

              return (
                <div className="glass-card rounded-[28px] p-3.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
                      ACTIVE CUE • {currentListName}
                    </span>
                    {currentActiveTimer?.endTime && (
                      <span className="text-[10px] text-neutral-400 font-mono">
                        End: <span className="text-white font-bold">{currentActiveTimer.endTime}</span>
                      </span>
                    )}
                  </div>

                  {nameCfg?.visible !== false && (
                    <div
                      className="text-base sm:text-lg text-white truncate mb-1"
                      style={{
                        fontFamily: resolveFontFamily(nameCfg?.font),
                        ...resolveFontStyleCss(nameCfg?.fontStyle || 'Bold'),
                      }}
                    >
                      {currentActiveTimer?.name || 'No Active Timer'}
                    </div>
                  )}

                  {/* Big Digits Display */}
                  <div className="bg-[#09090b] border border-white/[0.08] rounded-2xl py-2.5 px-2 text-center my-1.5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.75)]">
                    {countdownCfg?.visible !== false && (
                      <div
                        className={`text-4xl sm:text-5xl tracking-tight tabular-nums leading-none ${
                          currentIsOvertime || currentAlertOnOff
                            ? 'animate-overtime-blink'
                            : currentAlertFlash && localPrefs.flashAlertsEnabled !== false
                            ? 'animate-pulse'
                            : ''
                        }`}
                        style={{
                          color: resolvedColor,
                          fontFamily: resolveFontFamily(countdownCfg?.font),
                          ...resolveFontStyleCss(countdownCfg?.fontStyle),
                        }}
                      >
                        {renderTimeWithColonOffset(
                          formattedStr,
                          webElements.colon?.vert,
                          webElements.countdown?.spacing,
                          webElements.colon?.horiz
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 mt-1.5 font-mono">
                      <span className="uppercase text-neutral-200 font-bold tracking-wider">{currentStatus}</span>
                      <span>•</span>
                      <span>Speed: {currentActiveTimer?.speed || payload.speed}%</span>
                      <span>•</span>
                      <span>{Math.round(currentProgressPercent)}%</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1.5 bg-black/50 border border-white/[0.06] rounded-full overflow-hidden mt-1.5">
                    <div
                      className={`h-full transition-all duration-300 ${
                        currentIsOvertime ? 'bg-red-500' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, currentProgressPercent))}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Transport Controls: Separate START, PAUSE, STOP, RESTART buttons */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => dispatchCommand('START')}
                className={`glass-btn h-13 sm:h-14 rounded-[22px] flex flex-col items-center justify-center gap-0.5 font-bold cursor-pointer ${
                  isRunning ? 'glass-btn-emerald-active' : 'glass-btn-emerald'
                }`}
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">START</span>
              </button>

              <button
                type="button"
                onClick={() => dispatchCommand('PAUSE')}
                className={`glass-btn h-13 sm:h-14 rounded-[22px] flex flex-col items-center justify-center gap-0.5 font-bold cursor-pointer ${
                  isPaused ? 'glass-btn-amber-active' : 'glass-btn-amber'
                }`}
              >
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">PAUSE</span>
              </button>

              <button
                type="button"
                onClick={() => dispatchCommand('STOP')}
                className="glass-btn glass-btn-red h-13 sm:h-14 rounded-[22px] flex flex-col items-center justify-center gap-0.5 font-bold cursor-pointer"
              >
                <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">STOP</span>
              </button>

              <button
                type="button"
                onClick={() => dispatchCommand('RESTART')}
                className="glass-btn glass-btn-blue h-13 sm:h-14 rounded-[22px] flex flex-col items-center justify-center gap-0.5 font-bold cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">RESTART</span>
              </button>
            </div>

            {/* Remote Output Controls: Fullscreen & NDI Stream (Directly below transport controls) */}
            <div className="glass-card rounded-[24px] p-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => dispatchCommand('TOGGLE_FULLSCREEN')}
                  className={`glass-btn glass-btn-subtle py-2 px-3 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer ${
                    payload.isFullscreenActive ? 'glass-btn-cyan-active' : ''
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{payload.isFullscreenActive ? 'FULLSCREEN: ON' : 'FULLSCREEN'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => dispatchCommand('TOGGLE_NDI')}
                  className={`glass-btn glass-btn-subtle py-2 px-3 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer ${
                    payload.isNdiActive && !payload.isNdiMultiActive ? 'glass-btn-emerald-active' : ''
                  }`}
                >
                  <Radio
                    className={`w-3.5 h-3.5 shrink-0 ${
                      payload.isNdiActive && !payload.isNdiMultiActive ? 'animate-pulse' : ''
                    }`}
                  />
                  <span>
                    {payload.isNdiActive && !payload.isNdiMultiActive ? 'NDI: LIVE' : 'NDI STREAM'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => dispatchCommand('TOGGLE_MULTI_FULLSCREEN')}
                  className={`glass-btn glass-btn-subtle py-1.5 px-2.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold cursor-pointer ${
                    payload.isMultiFullscreenActive ? 'glass-btn-cyan-active' : ''
                  }`}
                >
                  <Layers className="w-3 h-3 shrink-0" />
                  <span>{payload.isMultiFullscreenActive ? 'MULTI FS: ON' : 'MULTI FS'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => dispatchCommand('TOGGLE_NDI_MULTI')}
                  className={`glass-btn glass-btn-subtle py-1.5 px-2.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold cursor-pointer ${
                    payload.isNdiActive && payload.isNdiMultiActive ? 'glass-btn-emerald-active' : ''
                  }`}
                >
                  <Radio
                    className={`w-3 h-3 shrink-0 ${
                      payload.isNdiActive && payload.isNdiMultiActive ? 'animate-pulse text-emerald-300' : ''
                    }`}
                  />
                  <span>
                    {payload.isNdiActive && payload.isNdiMultiActive ? 'NDI MULTI: LIVE' : 'NDI MULTI'}
                  </span>
                </button>
              </div>
            </div>

            {/* Duration Adjustments: -5m, -1m, +1m, +5m */}
            <div className="glass-card rounded-[24px] p-2.5">
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2 px-1">
                ADJUST REMAINING DURATION ({currentListName})
              </span>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => dispatchCommand('ADJUST_DURATION', { secondsDelta: -300 })}
                  className="glass-btn glass-btn-subtle py-2 text-xs font-mono font-bold cursor-pointer"
                >
                  -5m
                </button>
                <button
                  type="button"
                  onClick={() => dispatchCommand('ADJUST_DURATION', { secondsDelta: -60 })}
                  className="glass-btn glass-btn-subtle py-2 text-xs font-mono font-bold cursor-pointer"
                >
                  -1m
                </button>
                <button
                  type="button"
                  onClick={() => dispatchCommand('ADJUST_DURATION', { secondsDelta: 60 })}
                  className="glass-btn glass-btn-cyan glass-btn-subtle py-2 text-xs font-mono font-bold cursor-pointer"
                >
                  +1m
                </button>
                <button
                  type="button"
                  onClick={() => dispatchCommand('ADJUST_DURATION', { secondsDelta: 300 })}
                  className="glass-btn glass-btn-cyan glass-btn-subtle py-2 text-xs font-mono font-bold cursor-pointer"
                >
                  +5m
                </button>
              </div>
            </div>

            {/* Cue Stepping & Stage Controls combined cleanly */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => dispatchCommand('MOVE_PREV')}
                className="glass-btn glass-btn-subtle py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <SkipBack className="w-3.5 h-3.5" />
                <span>PREV CUE</span>
              </button>
              <button
                type="button"
                onClick={() => dispatchCommand('MOVE_NEXT')}
                className="glass-btn glass-btn-cyan glass-btn-subtle py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <span>NEXT CUE</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => dispatchCommand('TOGGLE_BLACKOUT')}
                className={`glass-btn glass-btn-subtle py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer ${
                  payload.isBlackout ? 'glass-btn-red-active animate-pulse' : ''
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>{payload.isBlackout ? 'UNBLANK SCREEN' : 'BLANK DISPLAY'}</span>
              </button>
              <button
                type="button"
                onClick={() => dispatchCommand('TOGGLE_CLOCK')}
                className={`glass-btn glass-btn-subtle py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer ${
                  payload.isClockMode ? 'glass-btn-cyan-active' : ''
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>{payload.isClockMode ? 'SHOW TIMER' : 'SHOW CLOCK'}</span>
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: CHANGE SELECTED TIMERS (RUNDOWN LIST)
           ========================================================================= */}
        {activeTab === 'timers' && (
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">
                {currentListName} TIMERS
              </span>
              <span className="text-[11px] text-neutral-500 font-mono">
                Tap any timer to select/cue
              </span>
            </div>

            {currentTimerList.length > 0 ? (
              <div className="space-y-2">
                {currentTimerList.map((t, idx) => {
                  const strictActiveId = listCueSummary
                    ? listCueSummary.activeTimerId
                    : payload.activeTimerId;
                  const isCurrentActive =
                    strictActiveId !== undefined
                      ? t.id === strictActiveId
                      : (isRunning || isPaused) && t.id === currentActiveTimer?.id;
                  const isCued = t.isCued;
                  return (
                    <div
                      key={t.id}
                      onClick={() => dispatchCommand('SELECT_TIMER', { timerId: t.id })}
                      className={`p-3 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${
                        isCurrentActive
                          ? 'bg-red-950/55 border-red-500/70 text-white shadow-md ring-1 ring-red-500/35'
                          : isCued
                          ? 'bg-cyan-950/55 border-cyan-400/70 text-cyan-100 ring-1 ring-cyan-500/30'
                          : 'glass-subcard text-neutral-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-xs font-mono text-neutral-500 w-5">
                          #{idx + 1}
                        </span>
                        <div className="truncate">
                          <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                            <span>{t.name}</span>
                            {isCurrentActive && (
                              <span className="text-[9px] uppercase px-2 py-0.2 rounded-full bg-red-600 text-white font-bold">
                                ACTIVE
                              </span>
                            )}
                            {isCued && !isCurrentActive && (
                              <span className="text-[9px] uppercase px-2 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/50 font-bold">
                                NEXT
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-neutral-400 font-mono">
                            Duration: {t.durationFormatted}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatchCommand('START', { timerId: t.id });
                          }}
                          title="Start this timer immediately"
                          className="glass-btn glass-btn-emerald glass-btn-subtle w-9 h-9 flex items-center justify-center cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card p-8 text-center text-neutral-400 rounded-[24px]">
                No timers available in {currentListName}.
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 3: STAGE MESSAGES & ALERTS
           ========================================================================= */}
        {activeTab === 'messages' && (
          <div className="space-y-3 flex-1">
            {/* Current Message Status */}
            <div className="glass-card rounded-[24px] p-3.5">
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider block mb-1.5">
                LIVE STAGE MESSAGE STATUS
              </span>
              {payload.activeMessage?.visible ? (
                <div className="flex items-center justify-between bg-amber-950/45 border border-amber-500/50 rounded-2xl p-2.5">
                  <span className="font-bold text-amber-300 text-sm truncate mr-2">
                    "{payload.activeMessage.text}"
                  </span>
                  <button
                    type="button"
                    onClick={handleClearMessage}
                    className="glass-btn glass-btn-red glass-btn-subtle px-3 py-1 text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    CLEAR
                  </button>
                </div>
              ) : (
                <span className="text-xs text-neutral-500 font-mono">
                  No active message on stage display
                </span>
              )}
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider block mb-2 px-1">
                QUICK STAGE ALERTS
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  '5 MIN REMAINING',
                  'WRAP UP NOW',
                  'Q&A STARTING',
                  'MICROPHONE READY',
                  'STANDBY',
                  'BREAK IN 2 MIN',
                ].map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    onClick={() => handleSendMessage(msg)}
                    className="glass-btn glass-btn-subtle px-3 py-2.5 text-xs font-semibold text-left truncate cursor-pointer"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Message Input */}
            <div className="glass-card rounded-[24px] p-3.5 space-y-2.5">
              <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider block">
                CUSTOM STAGE MESSAGE
              </span>
              <input
                type="text"
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                placeholder="e.g. Next speaker please take stage"
                className="glass-input w-full px-3.5 py-2 rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleSendMessage(customMsg);
                    setCustomMsg('');
                  }}
                  disabled={!customMsg.trim()}
                  className="glass-btn glass-btn-cyan-active flex-1 py-2 font-bold text-xs cursor-pointer"
                >
                  SEND TO STAGE
                </button>
                <button
                  type="button"
                  onClick={handleClearMessage}
                  className="glass-btn glass-btn-subtle px-4 py-2 font-semibold text-xs cursor-pointer"
                >
                  CLEAR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Up Next Preview Footer */}
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-xs shrink-0">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">NEXT IN RUNDOWN</span>
          <span className="text-neutral-300 font-medium truncate max-w-[65%]">
            {currentNextTimer ? currentNextTimer.name : 'End of Run of Show'}
          </span>
        </div>
      </div>
    </div>
  );
};
