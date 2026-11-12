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
  
  // Pairing & PIN authentication state
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Message composer state
  const [customMsg, setCustomMsg] = useState<string>('');
  const [msgSentNotice, setMsgSentNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'timers' | 'messages'>('control');

  // Check saved PIN on mount
  useEffect(() => {
    const savedPin = sessionStorage.getItem('protimer_lan_pin');
    if (savedPin) {
      verifyPin(savedPin);
    }
  }, []);

  const verifyPin = async (pinToTest: string) => {
    setIsVerifying(true);
    setPinError(null);
    try {
      const res = await fetch('/api/lan/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinToTest }),
      });
      const data = await res.json();
      if (data.valid) {
        sessionStorage.setItem('protimer_lan_pin', pinToTest);
        setIsPaired(true);
      } else {
        setPinError('Invalid Access PIN. Check Master Console.');
        sessionStorage.removeItem('protimer_lan_pin');
        setIsPaired(false);
      }
    } catch {
      // In offline or local fallback, allow default 1234
      if (pinToTest === '1234') {
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
    sessionStorage.removeItem('protimer_lan_pin');
    setIsPaired(false);
    setPinInput('');
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    sendRemoteCommand('SET_MESSAGE', { text: text.trim(), visible: true });
    setMsgSentNotice(`Message Sent: "${text.trim()}"`);
    setTimeout(() => setMsgSentNotice(null), 3000);
  };

  const handleClearMessage = () => {
    sendRemoteCommand('CLEAR_MESSAGE');
    setMsgSentNotice('Message Cleared');
    setTimeout(() => setMsgSentNotice(null), 2000);
  };

  // --- 1. PIN PAIRING MODAL / SCREEN ---
  if (!isPaired) {
    return (
      <div className="h-screen w-full overflow-y-auto overflow-x-hidden bg-[#07090e] text-white flex flex-col justify-center items-center p-4 sm:p-6 select-none font-sans">
        <div className="w-full max-w-sm bg-[#101520] border border-[#1f293b] rounded-2xl p-5 sm:p-6 shadow-2xl my-auto">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-2.5">
              <Lock className="w-6 h-6 text-cyan-400" />
            </div>
            <h1 className="text-lg font-bold tracking-wide text-white">PROTIMER REMOTE</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Enter the 4-digit Access PIN displayed on the Master Console to pair this device.
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-3.5">
            <div>
              <div className="flex justify-center gap-2 mb-2">
                {[0, 1, 2, 3].map((idx) => {
                  const digit = pinInput[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-11 h-12 rounded-xl border flex items-center justify-center font-mono text-xl font-bold transition-all ${
                        digit
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300'
                          : 'border-[#222e44] bg-[#0b0e16] text-neutral-600'
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
                className="w-full text-center px-3 py-2 bg-[#0a0d14] border border-[#232e42] rounded-xl text-base font-mono tracking-widest text-white focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            </div>

            {pinError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 p-2 rounded-lg border border-red-800/50">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {/* Quick Numpad for Phone / Tablet Touch */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    if (pinInput.length < 6) setPinInput((prev) => prev + num);
                  }}
                  className="h-11 bg-[#141b27] hover:bg-[#1a2436] active:bg-cyan-950 active:text-cyan-300 border border-[#202c3e] rounded-xl font-mono text-base font-semibold transition-all active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="h-11 bg-[#141b27] text-neutral-400 hover:text-white border border-[#202c3e] rounded-xl text-xs font-semibold"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pinInput.length < 6) setPinInput((prev) => prev + '0');
                }}
                className="h-11 bg-[#141b27] hover:bg-[#1a2436] active:bg-cyan-950 active:text-cyan-300 border border-[#202c3e] rounded-xl font-mono text-base font-semibold transition-all active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="h-11 bg-[#141b27] text-neutral-400 hover:text-white border border-[#202c3e] rounded-xl text-xs font-semibold"
              >
                ⌫
              </button>
            </div>

            <button
              type="submit"
              disabled={isVerifying || pinInput.length < 4}
              className={`w-full py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg ${
                pinInput.length >= 4 && !isVerifying
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white active:scale-98'
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
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
      <div className="h-screen w-full overflow-y-auto bg-[#0a0d14] text-white flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-sm font-medium text-neutral-300">Synchronizing with ProTimer Master...</span>
      </div>
    );
  }

  const isRunning = payload.status === 'running' || payload.status === 'overtime';
  const isPaused = payload.status === 'paused';
  const availableLists = payload.lists && payload.lists.length > 0 ? payload.lists : [];

  return (
    <div className="h-screen w-full overflow-y-auto overflow-x-hidden bg-[#07090e] text-white select-none font-sans">
      <div className="max-w-lg mx-auto min-h-full flex flex-col p-2.5 sm:p-3.5 pb-5">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#1b2333] mb-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="text-xs font-bold tracking-wider text-cyan-400 uppercase truncate">
              PROTIMER LAN CONTROL
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-semibold">
              CONNECTED
            </span>
            <button
              type="button"
              onClick={handleDisconnect}
              title="Lock & Disconnect"
              className="p-1 text-neutral-400 hover:text-white cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          </div>
        </div>

        {/* Cue List Selector Strip (prevents cue list ambiguity and allows clean switching) */}
        {availableLists.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-2 shrink-0 no-scrollbar">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 shrink-0 mr-0.5">
              Cue List:
            </span>
            {availableLists.map((list) => {
              const isCurrentList = list.id === payload.activeListId;
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
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap border flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    isCurrentList
                      ? 'bg-cyan-950/90 border-cyan-500 text-cyan-300 shadow-xs'
                      : 'bg-[#0f141f] border-[#1e2738] text-neutral-400 hover:text-white hover:border-[#2c3a52]'
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
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#0f141f] border border-[#1e2738] rounded-xl mb-2 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('control')}
            className={`py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'control'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Control
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timers')}
            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'timers'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span>Timers</span>
            {payload.timerList && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-800 text-neutral-200">
                {payload.timerList.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'messages'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Messages</span>
          </button>
        </div>

        {/* Notification Toast */}
        {msgSentNotice && (
          <div className="mb-2 px-3 py-1.5 bg-emerald-950/80 border border-emerald-600 rounded-lg text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{msgSentNotice}</span>
          </div>
        )}

        {/* =========================================================================
            TAB 1: PRIMARY OPERATOR CONTROL
           ========================================================================= */}
        {activeTab === 'control' && (
          <div className="flex-1 flex flex-col justify-between gap-2">
            {/* Active Cue Card */}
            {(() => {
              const webElements = getTargetElements(localPrefs, 'web_display_lan');
              const countdownCfg = webElements.countdown;
              const nameCfg = webElements.name;
              const resolvedColor = resolveDisplayDigitColor({
                isOvertime: payload.isOvertime,
                isPaused: payload.status === 'paused',
                activeAlertLevel: payload.activeAlertLevel,
                alertColor: payload.alertColor,
                prefs: localPrefs,
              });
              const formattedStr = payload.isClockMode
                ? payload.clockTimeFormatted
                : payload.isOvertime
                ? `+${payload.formattedTime.replace(/^[+-]/, '')}`
                : payload.formattedTime.replace(/^-/, '+');

              return (
                <div className="border rounded-2xl p-3 shadow-xl bg-[#0f1420] border-[#1f2b3e]">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
                      ACTIVE CUE {payload.activeListName ? `• ${payload.activeListName}` : ''}
                    </span>
                    {payload.activeTimer?.endTime && (
                      <span className="text-[10px] text-neutral-400 font-mono">
                        End: <span className="text-white font-bold">{payload.activeTimer.endTime}</span>
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
                      {payload.activeTimer?.name || 'No Active Timer'}
                    </div>
                  )}

                  {/* Big Digits Display */}
                  <div className="bg-[#080b11] border border-[#182232] rounded-xl py-2.5 px-2 text-center my-1.5 shadow-inner">
                    {countdownCfg?.visible !== false && (
                      <div
                        className={`text-4xl sm:text-5xl tracking-tight tabular-nums leading-none ${
                          payload.isOvertime || payload.alertOnOff
                            ? 'animate-overtime-blink'
                            : payload.alertFlash && localPrefs.flashAlertsEnabled !== false
                            ? 'animate-pulse'
                            : ''
                        }`}
                        style={{
                          color: resolvedColor,
                          fontFamily: resolveFontFamily(countdownCfg?.font),
                          ...resolveFontStyleCss(countdownCfg?.fontStyle),
                        }}
                      >
                        {renderTimeWithColonOffset(formattedStr, webElements.colon?.vert)}
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 mt-1.5 font-mono">
                      <span className="uppercase text-neutral-200 font-bold tracking-wider">{payload.status}</span>
                      <span>•</span>
                      <span>Speed: {payload.speed}%</span>
                      <span>•</span>
                      <span>{Math.round(payload.progressPercent)}%</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1.5 bg-[#182232] rounded-full overflow-hidden mt-1.5">
                    <div
                      className={`h-full transition-all duration-300 ${
                        payload.isOvertime ? 'bg-red-500' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, payload.progressPercent))}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Transport Controls: Separate START, PAUSE, STOP, RESTART buttons */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => sendRemoteCommand('START')}
                className={`h-13 sm:h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 font-bold transition-all active:scale-95 shadow-md cursor-pointer ${
                  isRunning
                    ? 'bg-emerald-600/35 border-emerald-400 text-emerald-300 ring-1 ring-emerald-400/50'
                    : 'bg-emerald-600/20 hover:bg-emerald-600/30 active:bg-emerald-600/40 border-emerald-500/60 text-emerald-400'
                }`}
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">START</span>
              </button>

              <button
                type="button"
                onClick={() => sendRemoteCommand('PAUSE')}
                className={`h-13 sm:h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 font-bold transition-all active:scale-95 shadow-md cursor-pointer ${
                  isPaused
                    ? 'bg-amber-600/35 border-amber-400 text-amber-300 ring-1 ring-amber-400/50'
                    : 'bg-amber-600/20 hover:bg-amber-600/30 active:bg-amber-600/40 border-amber-500/60 text-amber-400'
                }`}
              >
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">PAUSE</span>
              </button>

              <button
                type="button"
                onClick={() => sendRemoteCommand('STOP')}
                className="h-13 sm:h-14 bg-red-600/20 hover:bg-red-600/30 active:bg-red-600/40 border border-red-500/60 rounded-xl flex flex-col items-center justify-center gap-0.5 text-red-400 font-bold transition-all active:scale-95 shadow-md cursor-pointer"
              >
                <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-red-400" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">STOP</span>
              </button>

              <button
                type="button"
                onClick={() => sendRemoteCommand('RESTART')}
                className="h-13 sm:h-14 bg-blue-600/20 hover:bg-blue-600/30 active:bg-blue-600/40 border border-blue-500/60 rounded-xl flex flex-col items-center justify-center gap-0.5 text-blue-400 font-bold transition-all active:scale-95 shadow-md cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[10px] sm:text-[11px] tracking-wide">RESTART</span>
              </button>
            </div>

            {/* Remote Output Controls: Fullscreen & NDI Stream (Directly below transport controls) */}
            <div className="bg-[#0d121c] border border-[#1b2434] rounded-xl p-2 space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => sendRemoteCommand('TOGGLE_FULLSCREEN')}
                  className={`py-2 px-2.5 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                    payload.isFullscreenActive
                      ? 'bg-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-950/50'
                      : 'bg-[#141b26] hover:bg-[#1a2333] text-neutral-200 border-[#243247]'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{payload.isFullscreenActive ? 'FULLSCREEN: ON' : 'FULLSCREEN'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => sendRemoteCommand('TOGGLE_NDI')}
                  className={`py-2 px-2.5 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                    payload.isNdiActive && !payload.isNdiMultiActive
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950/50'
                      : 'bg-[#141b26] hover:bg-[#1a2333] text-neutral-200 border-[#243247]'
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

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => sendRemoteCommand('TOGGLE_MULTI_FULLSCREEN')}
                  className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
                    payload.isMultiFullscreenActive
                      ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500'
                      : 'bg-[#111620] hover:bg-[#182030] text-neutral-400 border-[#1e293b]'
                  }`}
                >
                  <Layers className="w-3 h-3 shrink-0" />
                  <span>{payload.isMultiFullscreenActive ? 'MULTI FS: ON' : 'MULTI FS'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => sendRemoteCommand('TOGGLE_NDI_MULTI')}
                  className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
                    payload.isNdiActive && payload.isNdiMultiActive
                      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500'
                      : 'bg-[#111620] hover:bg-[#182030] text-neutral-400 border-[#1e293b]'
                  }`}
                >
                  <Radio
                    className={`w-3 h-3 shrink-0 ${
                      payload.isNdiActive && payload.isNdiMultiActive ? 'animate-pulse text-emerald-400' : ''
                    }`}
                  />
                  <span>
                    {payload.isNdiActive && payload.isNdiMultiActive ? 'NDI MULTI: LIVE' : 'NDI MULTI'}
                  </span>
                </button>
              </div>
            </div>

            {/* Duration Adjustments: -5m, -1m, +1m, +5m */}
            <div className="bg-[#0d121c] border border-[#1b2434] rounded-xl p-2">
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">
                ADJUST REMAINING DURATION
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => sendRemoteCommand('ADJUST_DURATION', { secondsDelta: -300 })}
                  className="py-2 bg-[#141b26] hover:bg-[#1a2333] active:bg-[#202d42] border border-[#202c3e] rounded-lg text-xs font-mono font-bold text-neutral-300 active:scale-95 transition-all cursor-pointer"
                >
                  -5m
                </button>
                <button
                  type="button"
                  onClick={() => sendRemoteCommand('ADJUST_DURATION', { secondsDelta: -60 })}
                  className="py-2 bg-[#141b26] hover:bg-[#1a2333] active:bg-[#202d42] border border-[#202c3e] rounded-lg text-xs font-mono font-bold text-neutral-300 active:scale-95 transition-all cursor-pointer"
                >
                  -1m
                </button>
                <button
                  type="button"
                  onClick={() => sendRemoteCommand('ADJUST_DURATION', { secondsDelta: 60 })}
                  className="py-2 bg-[#141b26] hover:bg-[#1a2333] active:bg-[#202d42] border border-[#202c3e] rounded-lg text-xs font-mono font-bold text-cyan-400 active:scale-95 transition-all cursor-pointer"
                >
                  +1m
                </button>
                <button
                  type="button"
                  onClick={() => sendRemoteCommand('ADJUST_DURATION', { secondsDelta: 300 })}
                  className="py-2 bg-[#141b26] hover:bg-[#1a2333] active:bg-[#202d42] border border-[#202c3e] rounded-lg text-xs font-mono font-bold text-cyan-400 active:scale-95 transition-all cursor-pointer"
                >
                  +5m
                </button>
              </div>
            </div>

            {/* Cue Stepping & Stage Controls combined cleanly */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => sendRemoteCommand('MOVE_PREV')}
                className="py-2.5 bg-[#111622] hover:bg-[#182030] active:bg-[#202c40] border border-[#202c3e] rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-300 active:scale-95 transition-all cursor-pointer"
              >
                <SkipBack className="w-3.5 h-3.5" />
                <span>PREV CUE</span>
              </button>
              <button
                type="button"
                onClick={() => sendRemoteCommand('MOVE_NEXT')}
                className="py-2.5 bg-[#111622] hover:bg-[#182030] active:bg-[#202c40] border border-[#202c3e] rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-cyan-400 active:scale-95 transition-all cursor-pointer"
              >
                <span>NEXT CUE</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => sendRemoteCommand('TOGGLE_BLACKOUT')}
                className={`py-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  payload.isBlackout
                    ? 'bg-red-950/80 text-red-300 border-red-700 animate-pulse'
                    : 'bg-[#111622] text-neutral-300 border-[#202c3e] hover:bg-[#182030]'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>{payload.isBlackout ? 'UNBLANK SCREEN' : 'BLANK DISPLAY'}</span>
              </button>
              <button
                type="button"
                onClick={() => sendRemoteCommand('TOGGLE_CLOCK')}
                className={`py-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  payload.isClockMode
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                    : 'bg-[#111622] text-neutral-300 border-[#202c3e] hover:bg-[#182030]'
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
                {payload.activeListName || 'RUN OF SHOW'} TIMERS
              </span>
              <span className="text-[11px] text-neutral-500 font-mono">
                Tap any timer to select/cue
              </span>
            </div>

            {payload.timerList && payload.timerList.length > 0 ? (
              <div className="space-y-1.5">
                {payload.timerList.map((t, idx) => {
                  const isCurrentActive = t.id === payload.activeTimer?.id;
                  const isCued = t.isCued;
                  return (
                    <div
                      key={t.id}
                      onClick={() => sendRemoteCommand('SELECT_TIMER', { timerId: t.id })}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                        isCurrentActive
                          ? 'bg-cyan-950/50 border-cyan-500 text-white shadow-md'
                          : isCued
                          ? 'bg-amber-950/30 border-amber-500 text-amber-200'
                          : 'bg-[#101420] border-[#1f283a] text-neutral-300 hover:bg-[#161c2c]'
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
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-cyan-500 text-black font-bold">
                                ACTIVE
                              </span>
                            )}
                            {isCued && !isCurrentActive && (
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500 text-black font-bold">
                                CUED
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
                            sendRemoteCommand('START', { timerId: t.id });
                          }}
                          title="Start this timer immediately"
                          className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg border border-emerald-500/40 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-emerald-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-neutral-500 bg-[#0f1420] rounded-xl border border-[#1f283a]">
                No timers available in the active list.
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
            <div className="bg-[#0f1420] border border-[#1f283a] rounded-xl p-3">
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider block mb-1">
                LIVE STAGE MESSAGE STATUS
              </span>
              {payload.activeMessage?.visible ? (
                <div className="flex items-center justify-between bg-amber-950/40 border border-amber-600/60 rounded-lg p-2">
                  <span className="font-bold text-amber-300 text-sm truncate mr-2">
                    "{payload.activeMessage.text}"
                  </span>
                  <button
                    type="button"
                    onClick={handleClearMessage}
                    className="px-2 py-1 bg-red-900/60 hover:bg-red-800 text-white rounded text-xs font-semibold shrink-0 cursor-pointer"
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
              <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider block mb-1.5">
                QUICK STAGE ALERTS
              </span>
              <div className="grid grid-cols-2 gap-1.5">
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
                    className="p-2.5 bg-[#121724] hover:bg-[#1a2336] active:bg-cyan-950 border border-[#202d42] hover:border-cyan-500/50 rounded-xl text-xs font-semibold text-neutral-200 text-left truncate active:scale-95 transition-all cursor-pointer"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Message Input */}
            <div className="bg-[#0f1420] border border-[#1f283a] rounded-xl p-3 space-y-2.5">
              <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider block">
                CUSTOM STAGE MESSAGE
              </span>
              <input
                type="text"
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                placeholder="e.g. Next speaker please take stage"
                className="w-full px-3 py-2 bg-[#090c12] border border-[#232e42] rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleSendMessage(customMsg);
                    setCustomMsg('');
                  }}
                  disabled={!customMsg.trim()}
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white font-bold rounded-lg text-xs transition-all cursor-pointer"
                >
                  SEND TO STAGE
                </button>
                <button
                  type="button"
                  onClick={handleClearMessage}
                  className="px-4 py-2 bg-[#182030] hover:bg-[#202b40] text-neutral-300 font-semibold rounded-lg text-xs transition-all cursor-pointer"
                >
                  CLEAR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Up Next Preview Footer */}
        <div className="mt-2 pt-2 border-t border-[#1b2333] flex items-center justify-between text-xs shrink-0">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">NEXT IN RUNDOWN</span>
          <span className="text-neutral-300 font-medium truncate max-w-[65%]">
            {payload.nextTimer ? payload.nextTimer.name : 'End of Run of Show'}
          </span>
        </div>
      </div>
    </div>
  );
};
