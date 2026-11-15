/**
 * LAN Desktop Operator Console Display (`/?display=lan_desktop`).
 * Provides the full ProTimer Desktop Operator Console (matching the main desktop window)
 * over the local network with per-list Access PIN authentication and real-time bidirectional
 * LAN synchronization.
 */

import React, { useState, useEffect } from 'react';
import { MainConsolePage } from '../pages/MainConsolePage';
import { displaySyncService } from '../services/displaySyncService';
import { Lock, Monitor, AlertCircle } from 'lucide-react';

export const LanDesktopDisplay: React.FC = () => {
  const pinnedListId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('listId') || ''
      : '';
  const pinStorageKey = pinnedListId
    ? `protimer_lan_pin_${pinnedListId}`
    : 'protimer_lan_pin';

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [pinRequired, setPinRequired] = useState<boolean>(true);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [listLabel, setListLabel] = useState<string>(pinnedListId ? 'Cue List' : 'All Lists');

  useEffect(() => {
    displaySyncService.initAsClient();

    const checkAuth = async () => {
      try {
        const infoUrl = pinnedListId
          ? `/api/lan/info?listId=${encodeURIComponent(pinnedListId)}`
          : '/api/lan/info';
        const res = await fetch(infoUrl);
        if (res.ok) {
          const data = await res.json();
          const reqPin = data.pinRequired !== false;
          setPinRequired(reqPin);
          if (!reqPin) {
            setIsAuthenticated(true);
            setIsCheckingAuth(false);
            return;
          }
          const savedPin =
            sessionStorage.getItem(pinStorageKey) ||
            sessionStorage.getItem('protimer_lan_pin');
          if (savedPin) {
            const verifyRes = await fetch('/api/lan/verify-pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin: savedPin,
                listId: pinnedListId || undefined,
              }),
            });
            if (verifyRes.ok) {
              setIsAuthenticated(true);
              setIsCheckingAuth(false);
              return;
            }
          }
        } else {
          setIsAuthenticated(true);
        }
      } catch {
        setIsAuthenticated(true);
      }
      setIsCheckingAuth(false);
    };

    checkAuth();

    const unsubscribe = displaySyncService.subscribe((payload) => {
      if (pinnedListId && payload.lists) {
        const matched = payload.lists.find((l) => l.id === pinnedListId);
        if (matched) {
          setListLabel(matched.name);
        }
      } else if (payload.activeListName) {
        setListLabel(payload.activeListName);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [pinnedListId, pinStorageKey]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    try {
      const res = await fetch('/api/lan/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pinInput.trim(),
          listId: pinnedListId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        sessionStorage.setItem(pinStorageKey, pinInput.trim());
        sessionStorage.setItem('protimer_lan_pin', pinInput.trim());
        setIsAuthenticated(true);
      } else {
        setPinError(data.error || 'Invalid Access PIN. Check the ProTimer console.');
      }
    } catch {
      sessionStorage.setItem(pinStorageKey, pinInput.trim());
      sessionStorage.setItem('protimer_lan_pin', pinInput.trim());
      setIsAuthenticated(true);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <Monitor className="w-5 h-5 text-cyan-400 animate-pulse" />
          <span>Connecting to ProTimer Desktop LAN Console...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && pinRequired) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col items-center justify-center p-6 select-none">
        <div className="w-full max-w-md bg-[#0f1623] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <img
                  src="/assets/aistudio/ProTimer_icon_ec9a41ea.png"
                  alt="ProTimer"
                  className="w-4 h-4 object-contain"
                />
                <h1 className="text-base font-bold text-white tracking-tight">
                  PROTIMER DESKTOP LAN CONSOLE
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Enter the Access PIN for <strong className="text-slate-200">{listLabel}</strong> to unlock the full desktop console
              </p>
            </div>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.4em] text-white focus:outline-hidden"
              />
            </div>

            {pinError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-cyan-950/50 cursor-pointer"
            >
              Unlock Desktop Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <MainConsolePage />;
};
