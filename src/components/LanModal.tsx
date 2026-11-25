/**
 * LAN Control & Display Dialog (Independent per List Tab with Access PIN Security).
 * Supports two distinct LAN Control tabs:
 * - First tab: "Mobile" (Mobile/Tablet touch remote control with its own link & details)
 * - Second tab: "Desktop" (Full ProTimer Desktop Operator Console with its own link & details)
 */

import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { resolveApiUrl } from '../utils/apiUrl';
import {
  Check,
  Lock,
  Unlock,
  RefreshCw,
  X,
  Maximize2,
  Minimize2,
  Smartphone,
  Monitor,
} from 'lucide-react';

interface NetworkInterfaceInfo {
  name: string;
  address: string;
}

interface LanInfoResponse {
  ip: string;
  ips: string[];
  port: number;
  listId: string;
  pin: string;
  pinRequired: boolean;
  sessionToken: string;
  desktopSessionToken?: string;
  interfaces?: NetworkInterfaceInfo[];
  controlUrl: string;
  mobileControlUrl?: string;
  desktopControlUrl?: string;
  displayUrl: string;
  hasMaster: boolean;
  connectedClients: number;
  controlPagesOnList?: number;
  mobileControlPagesOnList?: number;
  desktopControlPagesOnList?: number;
  controlPagesByList?: Record<string, number>;
}

interface LanModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeListId?: string;
  activeListName?: string;
  mode?: 'lan_control' | 'lan_display';
}

const LOCAL_LIST_LAN_CFG_PREFIX = 'protimer_lan_list_cfg_v1_';

interface StoredListLanCfg {
  pin: string;
  pinRequired: boolean;
  sessionToken?: string;
  desktopSessionToken?: string;
}

function getLocalListLanCfg(listId: string): StoredListLanCfg | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_LIST_LAN_CFG_PREFIX}${listId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalListLanCfg(listId: string, cfg: StoredListLanCfg): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_LIST_LAN_CFG_PREFIX}${listId}`, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}

export const LanModal: React.FC<LanModalProps> = ({
  isOpen,
  onClose,
  activeListId = 'list_1',
  activeListName = 'List 1',
  mode = 'lan_control',
}) => {
  const [controlTab, setControlTab] = useState<'mobile' | 'desktop'>('mobile');
  const [lanInfo, setLanInfo] = useState<LanInfoResponse | null>(null);
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('1234');
  const [pinRequired, setPinRequired] = useState<boolean>(true);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [desktopSessionToken, setDesktopSessionToken] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [pinSavedToast, setPinSavedToast] = useState<boolean>(false);
  const [isQrEnlarged, setIsQrEnlarged] = useState<boolean>(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const fetchLanInfoForList = async (targetListId: string, syncLocalToServer = false) => {
    try {
      const localCfg = getLocalListLanCfg(targetListId);
      if (syncLocalToServer && localCfg) {
        await fetch(resolveApiUrl('/api/lan/pin'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-ProTimer-Console': '1' },
          body: JSON.stringify({
            listId: targetListId,
            pin: localCfg.pin,
            pinRequired: localCfg.pinRequired,
          }),
        }).catch(() => {});
      }

      const res = await fetch(resolveApiUrl(`/api/lan/info?listId=${encodeURIComponent(targetListId)}`), {
        headers: { 'X-ProTimer-Console': '1' },
      });
      if (res.ok) {
        const data: LanInfoResponse = await res.json();
        setLanInfo(data);
        setSelectedIp((prev) => (prev && data.ips?.includes(prev) ? prev : data.ip));
        if (syncLocalToServer) {
          const resolvedPin = localCfg?.pin || data.pin || '1234';
          const resolvedReq =
            typeof localCfg?.pinRequired === 'boolean' ? localCfg.pinRequired : data.pinRequired;
          setPinInput(resolvedPin);
          setPinRequired(resolvedReq);
          setSessionToken(data.sessionToken || '');
          setDesktopSessionToken(data.desktopSessionToken || '');
          saveLocalListLanCfg(targetListId, {
            pin: resolvedPin,
            pinRequired: resolvedReq,
            sessionToken: data.sessionToken,
            desktopSessionToken: data.desktopSessionToken,
          });
        } else {
          if (!sessionToken && data.sessionToken) {
            setSessionToken(data.sessionToken);
          }
          if (!desktopSessionToken && data.desktopSessionToken) {
            setDesktopSessionToken(data.desktopSessionToken);
          }
        }
      }
    } catch {
      // Fallback when running in preview without LAN server
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setIsQrEnlarged(false);
      return;
    }
    fetchLanInfoForList(activeListId, true);
    const interval = setInterval(() => {
      fetchLanInfoForList(activeListId, false);
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen, activeListId]);

  if (!isOpen) return null;

  const getBaseOrigin = () => {
    const activePort =
      lanInfo?.port ||
      (typeof window !== 'undefined' && (window as any).electronAPI?.getLanPort?.()) ||
      3000;
    const targetIp = selectedIp || lanInfo?.ip || '127.0.0.1';

    if (typeof window === 'undefined') {
      return `http://${targetIp}:${activePort}`;
    }

    const currentOrigin = window.location.origin || '';
    const isFileOrLocal =
      window.location.protocol === 'file:' ||
      currentOrigin === 'null' ||
      currentOrigin.startsWith('file:') ||
      currentOrigin.includes('localhost') ||
      currentOrigin.includes('127.0.0.1');

    if (isFileOrLocal) {
      const port = window.location.port || String(activePort);
      return `http://${targetIp}:${port}`;
    }

    return currentOrigin;
  };

  const baseOrigin = getBaseOrigin();
  const mobileTokenParam = sessionToken ? `&id=${encodeURIComponent(sessionToken)}` : '';
  const resolvedDesktopToken =
    desktopSessionToken || (sessionToken ? `${sessionToken}-desktop` : 'desktop-console');
  const desktopTokenParam = resolvedDesktopToken
    ? `&id=${encodeURIComponent(resolvedDesktopToken)}`
    : '';

  const mobileControlUrl = `${baseOrigin}/?display=lan_control&listId=${encodeURIComponent(activeListId)}${mobileTokenParam}`;
  const desktopControlUrl = `${baseOrigin}/?display=lan_desktop&listId=${encodeURIComponent(activeListId)}${desktopTokenParam}`;
  const lanDisplayUrl = `${baseOrigin}/?display=lan_display&listId=${encodeURIComponent(activeListId)}${mobileTokenParam}`;

  const isDesktopControlTab = mode === 'lan_control' && controlTab === 'desktop';
  const activeUrl =
    mode === 'lan_display'
      ? lanDisplayUrl
      : isDesktopControlTab
      ? desktopControlUrl
      : mobileControlUrl;

  const matchedInterface =
    lanInfo?.interfaces?.find((i) => i.address === selectedIp) ||
    lanInfo?.interfaces?.[0] || {
      name: 'Ethernet',
      address: selectedIp || lanInfo?.ip || '127.0.0.1',
    };

  const mobileControlPagesCount =
    lanInfo?.mobileControlPagesOnList ?? lanInfo?.controlPagesOnList ?? 0;
  const desktopControlPagesCount = lanInfo?.desktopControlPagesOnList ?? 0;

  const handleCopyUrl = () => {
    if (urlInputRef.current) {
      urlInputRef.current.select();
    }
    navigator.clipboard.writeText(activeUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  const updateListPinConfig = async (nextPin: string, nextPinRequired: boolean) => {
    const cleanPin = nextPin.trim() || '1234';
    setPinInput(cleanPin);
    setPinRequired(nextPinRequired);
    saveLocalListLanCfg(activeListId, {
      pin: cleanPin,
      pinRequired: nextPinRequired,
      sessionToken,
      desktopSessionToken,
    });

    try {
      const res = await fetch(resolveApiUrl('/api/lan/pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ProTimer-Console': '1' },
        body: JSON.stringify({
          listId: activeListId,
          pin: cleanPin,
          pinRequired: nextPinRequired,
        }),
      });
      if (res.ok) {
        setPinSavedToast(true);
        setTimeout(() => setPinSavedToast(false), 1500);
      }
    } catch {
      // Saved locally
    }
  };

  const handleGenerateRandomPin = () => {
    const arr = new Uint32Array(1);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(arr);
      const randomPin = String(1000 + (arr[0] % 9000));
      updateListPinConfig(randomPin, true);
    } else {
      const randomPin = String(Math.floor(1000 + Math.random() * 9000));
      updateListPinConfig(randomPin, true);
    }
  };

  const handleOpenInBrowser = () => {
    window.open(activeUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="glass-card w-[500px] max-w-[96vw] rounded-[28px] p-5 text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. HEADER ROW: "LAN Control" on left, Active List Name (e.g. "List 2") on right */}
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-[15px] font-bold tracking-tight text-white">
            {mode === 'lan_display' ? 'LAN Display' : 'LAN Control'}
          </span>
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] text-neutral-400 font-normal">
              {activeListName}
            </span>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 1B. TWO TABS FOR LAN CONTROL: "Mobile" (1st tab) and "Desktop" (2nd tab) */}
        {mode === 'lan_control' && (
          <div className="glass-subcard grid grid-cols-2 gap-1.5 p-1 mb-4 rounded-full">
            <button
              type="button"
              onClick={() => {
                setControlTab('mobile');
                setCopiedUrl(false);
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-[12.5px] font-semibold transition-all cursor-pointer ${
                controlTab === 'mobile'
                  ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setControlTab('desktop');
                setCopiedUrl(false);
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-[12.5px] font-semibold transition-all cursor-pointer ${
                controlTab === 'desktop'
                  ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Desktop</span>
            </button>
          </div>
        )}

        {/* 2. URL BAR ROW: Blue-bordered URL input + Copy button */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <input
              ref={urlInputRef}
              type="text"
              readOnly
              value={activeUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="glass-input w-full border-[1.5px] border-cyan-500/70 focus:border-cyan-400 rounded-full px-3.5 py-1.5 text-[12px] font-mono text-white selection:bg-[#0369a1] selection:text-white focus:outline-hidden cursor-text"
            />
          </div>
          <button
            type="button"
            onClick={handleCopyUrl}
            className={`glass-btn px-4 py-1.5 rounded-full text-[12.5px] font-medium flex items-center gap-1.5 shrink-0 cursor-pointer ${
              copiedUrl ? 'glass-btn-emerald-active' : ''
            }`}
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-200" />
                <span>Copied</span>
              </>
            ) : (
              <span>Copy</span>
            )}
          </button>
        </div>

        {/* 3. MAIN BODY ROW: QR Code (left) + Network, List Status & Access PIN Security (right) */}
        {isQrEnlarged ? (
          <div className="flex flex-col items-center justify-center py-2 space-y-3">
            <div
              onClick={() => setIsQrEnlarged(false)}
              title="Click to shrink QR code"
              className="bg-white p-4 rounded-xl shadow-lg cursor-pointer relative group transition-transform"
            >
              <QRCodeSVG
                value={activeUrl}
                size={250}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
              <div className="absolute bottom-2 right-2 bg-black/75 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Minimize2 className="w-3 h-3" />
                <span>Shrink</span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 text-center">
              {isDesktopControlTab ? (
                <>
                  Scan or copy link to open the <strong className="text-white">Desktop Console ({activeListName})</strong>. Click the QR code to return.
                </>
              ) : (
                <>
                  Scan to open <strong className="text-white">{activeListName}</strong> on your phone or tablet. Click the QR code to return.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            {/* Left: White rounded QR Code Card */}
            <div
              onClick={() => setIsQrEnlarged(true)}
              title="Click the code to enlarge it"
              className="bg-white p-2.5 rounded-xl shadow-md shrink-0 cursor-pointer relative group hover:ring-2 hover:ring-[#0284c7] transition-all"
            >
              <QRCodeSVG
                value={activeUrl}
                size={136}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
              <div className="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-2.5 h-2.5" />
                <span>Enlarge</span>
              </div>
            </div>

            {/* Right: Tab-Specific Instructions, Interface Info, Page Count, Access PIN Security & Open in browser */}
            <div className="flex-1 min-w-0 space-y-2.5 text-[13px] leading-snug">
              {isDesktopControlTab ? (
                <>
                  <p className="text-neutral-200">
                    Open this link on a desktop or laptop browser on your network for the full ProTimer operator console.
                  </p>

                  <div className="text-neutral-400">
                    <span>
                      Works for computers on the same network as this computer (
                      {matchedInterface.name}, {matchedInterface.address}).
                    </span>
                    {lanInfo && lanInfo.ips && lanInfo.ips.length > 1 && (
                      <div className="mt-1">
                        <select
                          value={selectedIp}
                          onChange={(e) => setSelectedIp(e.target.value)}
                          className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-1.5 py-0.5 text-[11px] text-neutral-200 focus:outline-hidden focus:border-[#0284c7]"
                        >
                          {(lanInfo.interfaces || lanInfo.ips.map((ip) => ({ name: 'LAN', address: ip }))).map(
                            (iface) => (
                              <option key={iface.address} value={iface.address}>
                                {iface.name} ({iface.address})
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    )}
                  </div>

                  <p className="text-[11.5px] text-neutral-400">
                    Includes full cue list table, transport &amp; duration controls, speed %, stage messaging, history logs, and display routing.
                  </p>

                  <p className="font-bold text-white">
                    {desktopControlPagesCount} desktop control {desktopControlPagesCount === 1 ? 'page' : 'pages'} on this list.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-neutral-200">
                    Scan with a phone or tablet, or click the code to enlarge it.
                  </p>

                  <div className="text-neutral-400">
                    <span>
                      Works for devices on the same network as this computer (
                      {matchedInterface.name}, {matchedInterface.address}).
                    </span>
                    {lanInfo && lanInfo.ips && lanInfo.ips.length > 1 && (
                      <div className="mt-1">
                        <select
                          value={selectedIp}
                          onChange={(e) => setSelectedIp(e.target.value)}
                          className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-1.5 py-0.5 text-[11px] text-neutral-200 focus:outline-hidden focus:border-[#0284c7]"
                        >
                          {(lanInfo.interfaces || lanInfo.ips.map((ip) => ({ name: 'LAN', address: ip }))).map(
                            (iface) => (
                              <option key={iface.address} value={iface.address}>
                                {iface.name} ({iface.address})
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    )}
                  </div>

                  <p className="font-bold text-white">
                    {mobileControlPagesCount} control {mobileControlPagesCount === 1 ? 'page' : 'pages'} on this list.
                  </p>
                </>
              )}

              {/* Security Notice matching screenshot + Access PIN Security Controls */}
              {pinRequired ? (
                <p className="text-[#f59e0b] text-[12.5px]">
                  Protected by Access PIN <span className="font-mono font-bold text-amber-300">{pinInput}</span> for {activeListName}.
                </p>
              ) : (
                <p className="text-[#f59e0b] text-[13px]">
                  Anyone with this link can control the show.
                </p>
              )}

              {/* Per-List Access PIN Security Controls */}
              <div className="glass-subcard rounded-2xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11.5px] font-medium text-neutral-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pinRequired}
                      onChange={(e) => updateListPinConfig(pinInput, e.target.checked)}
                      className="rounded border-neutral-600 bg-neutral-800 text-[#0284c7] focus:ring-0 cursor-pointer"
                    />
                    {pinRequired ? (
                      <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                    ) : (
                      <Unlock className="w-3 h-3 text-neutral-400 shrink-0" />
                    )}
                    <span>Access PIN Security ({activeListName})</span>
                  </label>
                  {pinSavedToast && (
                    <span className="text-[10px] text-emerald-400 font-medium">Saved</span>
                  )}
                </div>

                {pinRequired && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-neutral-400">PIN:</span>
                    <input
                      type="text"
                      maxLength={6}
                      value={pinInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
                        setPinInput(val);
                      }}
                      onBlur={() => updateListPinConfig(pinInput, pinRequired)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateListPinConfig(pinInput, pinRequired);
                        }
                      }}
                      placeholder="1234"
                      className="glass-input w-20 rounded-full px-2.5 py-0.5 text-[12px] font-mono font-bold tracking-widest text-amber-300 text-center focus:outline-hidden focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => updateListPinConfig(pinInput, pinRequired)}
                      className="glass-btn glass-btn-subtle px-3 py-0.5 rounded-full text-[11px] cursor-pointer"
                    >
                      Set
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateRandomPin}
                      title="Generate Random 4-Digit PIN"
                      className="glass-btn glass-btn-subtle w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Open in browser button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleOpenInBrowser}
                  className="glass-btn px-4 py-1.5 rounded-full text-[12.5px] font-medium cursor-pointer"
                >
                  Open in browser
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
