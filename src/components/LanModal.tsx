/**
 * LAN Connection & Device Pairing Modal.
 * Displays local network IP addresses, scannable QR codes for phones/tablets,
 * and allows the operator to configure the access PIN for LAN Remote Control.
 */

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  Wifi, 
  Smartphone, 
  Monitor, 
  Key, 
  Copy, 
  Check, 
  ExternalLink, 
  RefreshCw,
  ShieldCheck,
  QrCode as QrIcon,
  Play,
  Pause,
  Square,
  RotateCcw,
  Maximize2,
  Radio
} from 'lucide-react';
import { useTheme, useDisplaySync } from '../hooks';

interface LanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LanInfo {
  ip: string;
  port: number;
  pin: string;
  interfaces: Array<{ name: string; address: string }>;
  controlUrl: string;
  displayUrl: string;
}

export const LanModal: React.FC<LanModalProps> = ({ isOpen, onClose }) => {
  const { payload, sendRemoteCommand } = useDisplaySync(false);
  const [lanInfo, setLanInfo] = useState<LanInfo | null>(null);
  const [controlQrUrl, setControlQrUrl] = useState<string>('');
  const [displayQrUrl, setDisplayQrUrl] = useState<string>('');
  const [currentPin, setCurrentPin] = useState<string>('1234');
  const [isEditingPin, setIsEditingPin] = useState<boolean>(false);
  const [newPinInput, setNewPinInput] = useState<string>('1234');
  const [copiedType, setCopiedType] = useState<'control' | 'display' | 'pin' | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'display'>('control');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchLanInfo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/lan/info');
      if (res.ok) {
        const data = await res.json();
        setLanInfo(data);
        setCurrentPin(data.pin || '1234');
        setNewPinInput(data.pin || '1234');

        // Generate QR codes
        const ctrlQr = await QRCode.toDataURL(data.controlUrl, {
          width: 256,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setControlQrUrl(ctrlQr);

        const dispQr = await QRCode.toDataURL(data.displayUrl, {
          width: 256,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setDisplayQrUrl(dispQr);
      } else {
        fallbackLanInfo();
      }
    } catch {
      fallbackLanInfo();
    } finally {
      setIsLoading(false);
    }
  };

  const fallbackLanInfo = async () => {
    const host = window.location.hostname || 'localhost';
    const port = window.location.port ? `:${window.location.port}` : '';
    const origin = `${window.location.protocol}//${host}${port}`;
    const ctrl = `${origin}/?display=lan_control`;
    const disp = `${origin}/?display=lan_display`;

    setLanInfo({
      ip: host,
      port: 3000,
      pin: currentPin,
      interfaces: [{ name: 'Default', address: host }],
      controlUrl: ctrl,
      displayUrl: disp,
    });

    try {
      const ctrlQr = await QRCode.toDataURL(ctrl, { width: 256, margin: 1 });
      setControlQrUrl(ctrlQr);
      const dispQr = await QRCode.toDataURL(disp, { width: 256, margin: 1 });
      setDisplayQrUrl(dispQr);
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchLanInfo();
    }
  }, [isOpen]);

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPinInput.trim() || newPinInput.length < 4) return;

    try {
      const res = await fetch('/api/lan/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPinInput.trim() }),
      });
      if (res.ok) {
        setCurrentPin(newPinInput.trim());
        setIsEditingPin(false);
      }
    } catch {
      setCurrentPin(newPinInput.trim());
      setIsEditingPin(false);
    }
  };

  const copyToClipboard = (text: string, type: 'control' | 'display' | 'pin') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const { isDark } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in select-none">
      <div 
        className={`border rounded-2xl w-full max-w-xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden transition-colors ${
          isDark ? 'bg-[#10141d] border-[#222e42] text-white' : 'bg-white border-slate-300 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
          isDark ? 'border-[#1c2637] bg-[#0c0f16]' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Wifi className="w-3.5 h-3.5 text-cyan-500" />
            </div>
            <div>
              <h2 className={`text-xs sm:text-sm font-bold tracking-wide uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                LAN Remote & Display Hub
              </h2>
              <span className={`text-[11px] block leading-tight ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                Connect smartphones, tablets, and stage screens over local Wi-Fi
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-[#1a2332]' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-3">
          {/* Top Info Bar: Network IP & Access PIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Local Network IP */}
            <div className="bg-[#0b0e14] border border-[#1b2333] rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  HOST IP ADDRESS
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="font-mono text-sm font-bold text-cyan-400 truncate">
                {lanInfo ? `${lanInfo.ip}:${lanInfo.port}` : 'Detecting network...'}
              </div>
              <span className="text-[10px] text-neutral-500 block">
                Local Wi-Fi / Ethernet Network
              </span>
            </div>

            {/* Access PIN */}
            <div className="bg-[#0b0e14] border border-[#1b2333] rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  ACCESS PIN (SECURITY)
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingPin(!isEditingPin)}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                >
                  {isEditingPin ? 'Cancel' : 'Change'}
                </button>
              </div>

              {isEditingPin ? (
                <form onSubmit={handleUpdatePin} className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="text"
                    maxLength={6}
                    value={newPinInput}
                    onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                    className="w-20 px-2 py-0.5 bg-[#151c27] border border-cyan-500 rounded font-mono text-sm text-white text-center font-bold"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="font-mono text-base font-black tracking-widest text-emerald-400">
                    {currentPin}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(currentPin, 'pin')}
                    className="p-1 text-neutral-400 hover:text-white cursor-pointer"
                    title="Copy PIN"
                  >
                    {copiedType === 'pin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              <span className="text-[10px] text-neutral-500 block">
                Required for remote control pairing
              </span>
            </div>
          </div>

          {/* Tab Selector: LAN Remote Control vs LAN Stage Display */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0c0f16] border border-[#1b2333] rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('control')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'control'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>LAN Remote Control</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('display')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'display'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>LAN Stage Display</span>
            </button>
          </div>

          {/* Active Tab Panel */}
          {activeTab === 'control' ? (
            <div className="bg-[#0b0e14] border border-[#1d273a] rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4">
              {/* QR Code */}
              <div className="shrink-0 bg-white p-2 rounded-xl shadow-lg flex flex-col items-center">
                {controlQrUrl ? (
                  <img src={controlQrUrl} alt="LAN Control QR Code" className="w-28 h-28 rounded" />
                ) : (
                  <div className="w-28 h-28 flex items-center justify-center text-neutral-400 text-xs font-mono">
                    Generating...
                  </div>
                )}
                <span className="text-[9px] font-bold text-neutral-900 mt-1 uppercase tracking-wider font-mono">
                  Scan With Camera
                </span>
              </div>

              {/* URL & Controls */}
              <div className="flex-1 space-y-2 w-full min-w-0">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Remote Operator URL
                  </span>
                  <span className="text-[11px] text-neutral-400 block leading-snug">
                    Open on smartphone or tablet to start/pause/stop/restart, switch cue lists, adjust times, and send messages.
                  </span>
                </div>

                <div className="p-2 bg-[#121722] border border-[#222e44] rounded-lg flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-cyan-300 truncate select-all">
                    {lanInfo?.controlUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => lanInfo && copyToClipboard(lanInfo.controlUrl, 'control')}
                    className="p-1 hover:bg-[#1c2638] text-neutral-300 hover:text-white rounded transition-colors shrink-0 cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedType === 'control' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={lanInfo?.controlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#171f2e] hover:bg-[#1f2a3e] border border-[#233148] rounded-lg text-xs font-semibold text-neutral-200 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Open in New Tab</span>
                  </a>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    PIN Required: <strong className="text-emerald-400 font-bold">{currentPin}</strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#0b0e14] border border-[#1d273a] rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4">
              {/* QR Code */}
              <div className="shrink-0 bg-white p-2 rounded-xl shadow-lg flex flex-col items-center">
                {displayQrUrl ? (
                  <img src={displayQrUrl} alt="LAN Display QR Code" className="w-28 h-28 rounded" />
                ) : (
                  <div className="w-28 h-28 flex items-center justify-center text-neutral-400 text-xs font-mono">
                    Generating...
                  </div>
                )}
                <span className="text-[9px] font-bold text-neutral-900 mt-1 uppercase tracking-wider font-mono">
                  Scan to View
                </span>
              </div>

              {/* URL & Controls */}
              <div className="flex-1 space-y-2 w-full min-w-0">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Synchronized Stage Display (Read-Only)
                  </span>
                  <span className="text-[11px] text-neutral-400 block leading-snug">
                    Pure fullscreen timer output for backstage monitors, confidence screens, and musicians without control buttons.
                  </span>
                </div>

                <div className="p-2 bg-[#121722] border border-[#222e44] rounded-lg flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-cyan-300 truncate select-all">
                    {lanInfo?.displayUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => lanInfo && copyToClipboard(lanInfo.displayUrl, 'display')}
                    className="p-1 hover:bg-[#1c2638] text-neutral-300 hover:text-white rounded transition-colors shrink-0 cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedType === 'display' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={lanInfo?.displayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#171f2e] hover:bg-[#1f2a3e] border border-[#233148] rounded-lg text-xs font-semibold text-neutral-200 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Open in New Tab</span>
                  </a>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    ● No PIN required (View Only)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Hub Transport & Output Controls (Separate Start/Pause + Fullscreen & NDI below) */}
          <div className="bg-[#0b0e14] border border-[#1d273a] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-400 truncate">
                QUICK HUB CONTROLS ({payload?.activeListName ? `${payload.activeListName}: ` : ''}{payload?.activeTimer?.name || 'Active Cue'})
              </span>
              <span className="font-mono text-xs font-bold text-neutral-200 shrink-0">
                {payload?.formattedTime || '00:00:00'} •{' '}
                <span className="uppercase text-cyan-300">{payload?.status || 'idle'}</span>
              </span>
            </div>

            {/* Separate START, PAUSE, STOP, RESTART */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => sendRemoteCommand('START')}
                className={`py-2 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  payload?.status === 'running' || payload?.status === 'overtime'
                    ? 'bg-emerald-600/35 border-emerald-400 text-emerald-300'
                    : 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/60 text-emerald-400'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>START</span>
              </button>

              <button
                type="button"
                onClick={() => sendRemoteCommand('PAUSE')}
                className={`py-2 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  payload?.status === 'paused'
                    ? 'bg-amber-600/35 border-amber-400 text-amber-300'
                    : 'bg-amber-600/20 hover:bg-amber-600/30 border-amber-500/60 text-amber-400'
                }`}
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>PAUSE</span>
              </button>

              <button
                type="button"
                onClick={() => sendRemoteCommand('STOP')}
                className="py-2 px-2 rounded-lg border bg-red-600/20 hover:bg-red-600/30 border-red-500/60 text-red-400 flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>STOP</span>
              </button>

              <button
                type="button"
                onClick={() => sendRemoteCommand('RESTART')}
                className="py-2 px-2 rounded-lg border bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/60 text-blue-400 flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESTART</span>
              </button>
            </div>

            {/* FULLSCREEN & NDI Below Controls */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => sendRemoteCommand('TOGGLE_FULLSCREEN')}
                className={`py-1.5 px-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  payload?.isFullscreenActive
                    ? 'bg-cyan-600 text-white border-cyan-400'
                    : 'bg-[#141b26] hover:bg-[#1a2333] text-neutral-200 border-[#243247]'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                <span>{payload?.isFullscreenActive ? 'FULLSCREEN: ON' : 'FULLSCREEN'}</span>
              </button>

              <button
                type="button"
                onClick={() => sendRemoteCommand('TOGGLE_NDI')}
                className={`py-1.5 px-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  payload?.isNdiActive
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : 'bg-[#141b26] hover:bg-[#1a2333] text-neutral-200 border-[#243247]'
                }`}
              >
                <Radio className={`w-3.5 h-3.5 shrink-0 ${payload?.isNdiActive ? 'animate-pulse' : ''}`} />
                <span>{payload?.isNdiActive ? 'NDI: LIVE' : 'NDI STREAM'}</span>
              </button>
            </div>
          </div>

          {/* Quick instructions */}
          <div className="bg-[#0e121a] border border-[#192231] rounded-xl p-2.5 text-xs text-neutral-400">
            <span className="font-bold text-neutral-300 block mb-0.5 text-[11px]">
              Local Network Requirements:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              <li>Both devices must be connected to the same Wi-Fi router or local LAN switch.</li>
              <li>Commands dispatch in under 5ms with instantaneous SSE synchronization.</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`px-4 py-2.5 border-t flex items-center justify-between shrink-0 ${
          isDark ? 'border-[#1c2637] bg-[#0c0f16]' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            type="button"
            onClick={fetchLanInfo}
            disabled={isLoading}
            className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-cyan-300' : 'text-slate-600 hover:text-cyan-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Network IP</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              isDark ? 'bg-[#182030] hover:bg-[#202b40] text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
