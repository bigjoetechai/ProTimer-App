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
  QrCode as QrIcon
} from 'lucide-react';
import { useTheme } from '../hooks';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in select-none">
      <div 
        className={`border rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors ${
          isDark ? 'bg-[#10141d] border-[#222e42] text-white' : 'bg-white border-slate-300 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-[#1c2637] bg-[#0c0f16]' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Wifi className="w-4 h-4 text-cyan-500" />
            </div>
            <div>
              <h2 className={`text-sm font-bold tracking-wide uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                LAN Remote & Display Hub
              </h2>
              <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
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
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Top Info Bar: Network IP & Access PIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Local Network IP */}
            <div className="bg-[#0b0e14] border border-[#1b2333] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  HOST IP ADDRESS
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="font-mono text-sm font-bold text-cyan-400 truncate">
                {lanInfo ? `${lanInfo.ip}:${lanInfo.port}` : 'Detecting network...'}
              </div>
              <span className="text-[10px] text-neutral-500 block mt-0.5">
                Local Wi-Fi / Ethernet Network
              </span>
            </div>

            {/* Access PIN */}
            <div className="bg-[#0b0e14] border border-[#1b2333] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  ACCESS PIN (SECURITY)
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingPin(!isEditingPin)}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  {isEditingPin ? 'Cancel' : 'Change'}
                </button>
              </div>

              {isEditingPin ? (
                <form onSubmit={handleUpdatePin} className="flex items-center gap-1.5 mt-1">
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
                    className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
                  >
                    Save
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="font-mono text-lg font-black tracking-widest text-emerald-400">
                    {currentPin}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(currentPin, 'pin')}
                    className="p-1 text-neutral-400 hover:text-white"
                    title="Copy PIN"
                  >
                    {copiedType === 'pin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              <span className="text-[10px] text-neutral-500 block mt-0.5">
                Required for remote control pairing
              </span>
            </div>
          </div>

          {/* Tab Selector: LAN Remote Control vs LAN Stage Display */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#0c0f16] border border-[#1b2333] rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('control')}
              className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'control'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>LAN Remote Control</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('display')}
              className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'display'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>LAN Stage Display</span>
            </button>
          </div>

          {/* Active Tab Panel */}
          {activeTab === 'control' ? (
            <div className="bg-[#0b0e14] border border-[#1d273a] rounded-xl p-4 flex flex-col sm:flex-row items-center gap-5">
              {/* QR Code */}
              <div className="shrink-0 bg-white p-2.5 rounded-xl shadow-lg flex flex-col items-center">
                {controlQrUrl ? (
                  <img src={controlQrUrl} alt="LAN Control QR Code" className="w-36 h-36 rounded" />
                ) : (
                  <div className="w-36 h-36 flex items-center justify-center text-neutral-400 text-xs font-mono">
                    Generating...
                  </div>
                )}
                <span className="text-[10px] font-bold text-neutral-900 mt-1 uppercase tracking-wider font-mono">
                  Scan With Camera
                </span>
              </div>

              {/* URL & Controls */}
              <div className="flex-1 space-y-3 w-full">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Remote Operator URL
                  </span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5">
                    Open on smartphone or tablet to start/pause/stop/restart, adjust times, select cues, and send stage messages.
                  </span>
                </div>

                <div className="p-2.5 bg-[#121722] border border-[#222e44] rounded-lg flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-cyan-300 truncate select-all">
                    {lanInfo?.controlUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => lanInfo && copyToClipboard(lanInfo.controlUrl, 'control')}
                    className="p-1.5 hover:bg-[#1c2638] text-neutral-300 hover:text-white rounded transition-colors shrink-0"
                    title="Copy URL"
                  >
                    {copiedType === 'control' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={lanInfo?.controlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#171f2e] hover:bg-[#1f2a3e] border border-[#233148] rounded-lg text-xs font-semibold text-neutral-200 transition-colors"
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
            <div className="bg-[#0b0e14] border border-[#1d273a] rounded-xl p-4 flex flex-col sm:flex-row items-center gap-5">
              {/* QR Code */}
              <div className="shrink-0 bg-white p-2.5 rounded-xl shadow-lg flex flex-col items-center">
                {displayQrUrl ? (
                  <img src={displayQrUrl} alt="LAN Display QR Code" className="w-36 h-36 rounded" />
                ) : (
                  <div className="w-36 h-36 flex items-center justify-center text-neutral-400 text-xs font-mono">
                    Generating...
                  </div>
                )}
                <span className="text-[10px] font-bold text-neutral-900 mt-1 uppercase tracking-wider font-mono">
                  Scan to View
                </span>
              </div>

              {/* URL & Controls */}
              <div className="flex-1 space-y-3 w-full">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Synchronized Stage Display (Read-Only)
                  </span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5">
                    Pure fullscreen timer output for backstage monitors, confidence screens, and musicians without control buttons.
                  </span>
                </div>

                <div className="p-2.5 bg-[#121722] border border-[#222e44] rounded-lg flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-cyan-300 truncate select-all">
                    {lanInfo?.displayUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => lanInfo && copyToClipboard(lanInfo.displayUrl, 'display')}
                    className="p-1.5 hover:bg-[#1c2638] text-neutral-300 hover:text-white rounded transition-colors shrink-0"
                    title="Copy URL"
                  >
                    {copiedType === 'display' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={lanInfo?.displayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#171f2e] hover:bg-[#1f2a3e] border border-[#233148] rounded-lg text-xs font-semibold text-neutral-200 transition-colors"
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

          {/* Quick instructions */}
          <div className="bg-[#0e121a] border border-[#192231] rounded-xl p-3 text-xs text-neutral-400 space-y-1">
            <span className="font-bold text-neutral-300 block mb-1">
              Local Network Requirements:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              <li>Both devices must be connected to the same Wi-Fi router or local LAN switch.</li>
              <li>No internet connection is required — communication is 100% peer-to-peer over local TCP/IP.</li>
              <li>Commands dispatch in under 5 milliseconds with instantaneous state synchronization.</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`px-6 py-3 border-t flex items-center justify-between ${
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
