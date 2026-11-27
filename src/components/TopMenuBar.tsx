/**
 * Top Menu Bar matching ProTimer layout with pro AV styling and interactive menus.
 * Fully supports both Dark and Light broadcast console themes.
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Undo2, 
  Redo2, 
  Moon, 
  Sun, 
  Cloud, 
  Edit3, 
  Settings, 
  ChevronDown,
  User,
  Bell,
  Monitor,
  Keyboard,
  Check,
  CheckCircle2,
  Wifi,
  Maximize2,
  Info,
  Mail,
  FileText,
  Lock,
  RotateCcw,
  Download,
  ExternalLink,
  X,
} from 'lucide-react';
import { useWindowManager } from '../hooks';
import { APP_VERSION_TAG } from '../constants/appVersion';
import { UpdateStatusInfo } from '../types';
import { updateService } from '../services/updateService';

interface TopMenuBarProps {
  currentListName: string;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts?: () => void;
  onOpenLanModal?: () => void;
  onNewTimer: () => void;
  onAddTimerType?: (type: 'countdown' | 'count_up' | 'end_time' | 'stopwatch' | 'clock' | 'empty' | 'spacer') => void;
  onQuickAddDuration: (durationSec: number, name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoLabel?: string | null;
  redoLabel?: string | null;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  canPaste?: boolean;
  onClearCompleted?: () => void;
  onRenameList?: (newName: string) => void;
  onOpenListManager?: () => void;
  onNewList?: () => void;
  onExportActiveList?: () => void;
  onExportAllLists?: () => void;
  onImportList?: (content?: string) => void;
  onExportCsv?: () => void;
  onImportCsv?: (csvText: string) => void;
  onRunIndependenceTest?: () => void;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  currentListName,
  isDark,
  onToggleTheme,
  onOpenSettings,
  onOpenShortcuts,
  onOpenLanModal,
  onNewTimer,
  onAddTimerType,
  onQuickAddDuration,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  undoLabel,
  redoLabel,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  canPaste = false,
  onRenameList,
  onNewList,
  onExportActiveList,
  onImportList,
  onExportCsv,
  onImportCsv,
  onRunIndependenceTest,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isEditingListName, setIsEditingListName] = useState(false);
  const [listNameInput, setListNameInput] = useState(currentListName);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showCloudMenu, setShowCloudMenu] = useState(false);
  const [operatorName, setOperatorName] = useState('Production Lead');
  const [cloudStatus] = useState<'local' | 'synced'>('local');
  const [activeBrandDialog, setActiveBrandDialog] = useState<
    'about' | 'support' | 'guide' | 'activation' | 'updates' | null
  >(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateStatusInfo>(() =>
    updateService.getStatus()
  );

  useEffect(() => {
    return updateService.subscribe((st) => {
      setUpdateInfo(st);
    });
  }, []);

  const triggerManualUpdateCheck = async () => {
    await updateService.checkForUpdates(false);
  };

  const hasPendingUpdate =
    updateInfo.status === 'available' ||
    updateInfo.status === 'downloading' ||
    updateInfo.status === 'downloaded';

  const {
    toggleMaximize,
    toggleAppFullscreen,
    resetToDefaultSize,
  } = useWindowManager();

  const menuRef = useRef<HTMLDivElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportList) {
      try {
        const text = await file.text();
        onImportList(text);
      } catch (err) {
        console.error('Failed to read JSON file', err);
      }
    }
    if (e.target) e.target.value = '';
  };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportCsv) {
      try {
        const text = await file.text();
        onImportCsv(text);
      } catch (err) {
        console.error('Failed to read CSV file', err);
      }
    }
    if (e.target) e.target.value = '';
  };

  useEffect(() => {
    setListNameInput(currentListName);
  }, [currentListName]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
        setShowProfileMenu(false);
        setShowCloudMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleListNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (listNameInput.trim() && onRenameList) {
      onRenameList(listNameInput.trim());
    }
    setIsEditingListName(false);
  };

  // Dynamic Theme Helpers (Frosted Glass)
  const headerClass = isDark
    ? 'h-10 glass-surface border-b border-white/[0.08] text-neutral-300'
    : 'h-10 glass-surface border-b border-slate-300/80 text-slate-800 shadow-2xs';

  const menuBtnClass = (isActive: boolean) =>
    `flex items-center gap-1 px-3 py-1 rounded-full transition-all cursor-pointer select-none ${
      isActive
        ? 'glass-btn glass-btn-subtle text-white'
        : isDark
          ? 'text-neutral-300 hover:text-white hover:bg-white/[0.08] border border-transparent hover:border-white/[0.12]'
          : 'text-slate-700 hover:text-slate-900 hover:bg-white/60 border border-transparent hover:border-slate-300/60'
    }`;

  const dropdownBaseClass = (width = 'w-48') =>
    `glass-card absolute top-full left-0 mt-1.5 ${width} rounded-2xl py-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 z-50 ${
      isDark ? 'text-neutral-200' : 'text-slate-800'
    }`;

  const dropdownItemClass =
    `w-full text-left px-3.5 py-1.5 flex items-center transition-colors cursor-pointer ${
      isDark ? 'hover:bg-white/[0.08] text-neutral-200 hover:text-white' : 'hover:bg-slate-200/70 text-slate-800 hover:text-slate-900'
    }`;

  const dropdownDividerClass = `border-t my-1 ${isDark ? 'border-white/[0.08]' : 'border-slate-300/80'}`;
  const separatorBorder = isDark ? 'border-white/[0.09]' : 'border-slate-300';

  return (
    <header 
      ref={menuRef}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'HEADER' || target.classList.contains('titlebar-drag-region')) {
          toggleMaximize();
        }
      }}
      className={`${headerClass} flex items-center justify-between px-3 text-xs select-none relative z-50 titlebar-drag-region transition-colors duration-150`}
    >
      {/* LEFT: Logo & Menus */}
      <div className="flex items-center gap-1">
        {/* Brand Logo & PROTIMER Dropdown Menu */}
        <div className="relative mr-1">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'brand' ? null : 'brand')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold select-none transition-all cursor-pointer ${
              activeMenu === 'brand'
                ? 'glass-btn glass-btn-subtle'
                : isDark
                  ? 'hover:bg-white/[0.08] border border-transparent hover:border-white/[0.12]'
                  : 'hover:bg-white/60 border border-transparent hover:border-slate-300/60'
            }`}
          >
            <img
              src="/assets/aistudio/icon_ec9a41ea.png"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith('/icon.png')) {
                  target.src = './icon.png';
                }
              }}
              alt="ProTimer Logo"
              draggable={false}
              className="w-5 h-5 object-contain shrink-0"
            />
            <span className={`font-bold tracking-wider text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
              PRO<span className="text-cyan-500">TIMER</span>
            </span>
            {hasPendingUpdate && (
              <span
                title={
                  updateInfo.status === 'downloaded'
                    ? `Update v${updateInfo.availableVersion || 'new'} ready to install`
                    : `Update v${updateInfo.availableVersion || 'new'} available`
                }
                className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
              />
            )}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {activeMenu === 'brand' && (
            <div className={dropdownBaseClass('w-56')}>
              <button
                type="button"
                onClick={() => {
                  setActiveBrandDialog('about');
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between py-2`}
              >
                <div className="flex items-center gap-2.5">
                  <Info className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
                  <span>About ProTimer</span>
                </div>
                <span className={`text-[11px] font-normal ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                  {APP_VERSION_TAG}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveBrandDialog('support');
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} gap-2.5 py-2`}
              >
                <Mail className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
                <span>Contact / Support</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveBrandDialog('guide');
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} gap-2.5 py-2`}
              >
                <FileText className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
                <span>User Guide</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveBrandDialog('activation');
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} gap-2.5 py-2`}
              >
                <Lock className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
                <span>Activation</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveBrandDialog('updates');
                  setActiveMenu(null);
                  if (updateInfo.status !== 'downloading' && updateInfo.status !== 'downloaded') {
                    triggerManualUpdateCheck();
                  }
                }}
                className={`${dropdownItemClass} justify-between py-2`}
              >
                <div className="flex items-center gap-2.5">
                  <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
                  <span>Check for Updates</span>
                </div>
                {hasPendingUpdate && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">
                    {updateInfo.status === 'downloaded' ? 'Ready' : `v${updateInfo.availableVersion || 'New'}`}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 1. FILE MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
            className={menuBtnClass(activeMenu === 'file')}
          >
            <span>File</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {activeMenu === 'file' && (
            <div className={dropdownBaseClass('w-48')}>
              <button
                type="button"
                onClick={() => {
                  if (onNewList) onNewList();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                New Cue List
              </button>

              <div className={dropdownDividerClass} />

              <button
                type="button"
                onClick={() => {
                  jsonFileInputRef.current?.click();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                Import Cue List...
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onExportActiveList) onExportActiveList();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                Export Cue List
              </button>

              <div className={dropdownDividerClass} />

              <button
                type="button"
                onClick={() => {
                  csvFileInputRef.current?.click();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                Import CSV...
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onExportCsv) onExportCsv();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                Export CSV
              </button>
            </div>
          )}
        </div>

        {/* Hidden inputs for JSON and CSV file pickers */}
        <input
          ref={jsonFileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleJsonFileChange}
        />
        <input
          ref={csvFileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          className="hidden"
          onChange={handleCsvFileChange}
        />

        {/* 2. EDIT MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
            className={menuBtnClass(activeMenu === 'edit')}
          >
            <span>Edit</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {activeMenu === 'edit' && (
            <div className={dropdownBaseClass('w-44')}>
              <button
                type="button"
                onClick={() => {
                  if (onCopy) onCopy();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Copy</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Ctrl+C</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onCut) onCut();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Cut</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Ctrl+X</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onPaste) onPaste();
                  setActiveMenu(null);
                }}
                className={`w-full text-left px-3.5 py-1.5 flex items-center justify-between transition-colors ${
                  canPaste
                    ? isDark ? 'hover:bg-[#1e293b] text-neutral-100 hover:text-white cursor-pointer' : 'hover:bg-slate-100 text-slate-800 hover:text-slate-900 cursor-pointer'
                    : isDark ? 'text-neutral-500 cursor-not-allowed' : 'text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Paste</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>Ctrl+V</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onDelete) onDelete();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Delete</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Del</span>
              </button>

              <div className={dropdownDividerClass} />

              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  onUndo();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between ${!canUndo ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className="truncate max-w-[140px]">
                  {undoLabel ? `Undo (${undoLabel})` : 'Undo'}
                </span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Ctrl+Z</span>
              </button>

              <button
                type="button"
                disabled={!canRedo}
                onClick={() => {
                  onRedo();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between ${!canRedo ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className="truncate max-w-[140px]">
                  {redoLabel ? `Redo (${redoLabel})` : 'Redo'}
                </span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Ctrl+Y</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. NEW TIMER MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'newTimer' ? null : 'newTimer')}
            className={menuBtnClass(activeMenu === 'newTimer')}
          >
            <span>New Timer</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {activeMenu === 'newTimer' && (
            <div className={dropdownBaseClass('w-44')}>
              <button
                type="button"
                onClick={() => {
                  onNewTimer();
                  setActiveMenu(null);
                }}
                className={`w-full text-left px-3.5 py-1.5 font-semibold transition-colors cursor-pointer ${
                  isDark ? 'hover:bg-[#1e293b] text-emerald-400' : 'hover:bg-slate-100 text-emerald-600'
                }`}
              >
                New Timer Menu...
              </button>

              <div className={dropdownDividerClass} />

              <button
                type="button"
                onClick={() => {
                  if (onAddTimerType) {
                    onAddTimerType('countdown');
                  } else {
                    onQuickAddDuration(600, 'Countdown');
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Countdown</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>1</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onAddTimerType) {
                    onAddTimerType('count_up');
                  } else {
                    onQuickAddDuration(0, 'Count Up');
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Count Up</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>2</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onAddTimerType) {
                    onAddTimerType('end_time');
                  } else {
                    onQuickAddDuration(1800, 'End Time');
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>End Time</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>3</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onAddTimerType) {
                    onAddTimerType('stopwatch');
                  } else {
                    onQuickAddDuration(0, 'Stopwatch');
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Stopwatch</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>4</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onAddTimerType) {
                    onAddTimerType('clock');
                  } else {
                    onQuickAddDuration(0, 'Clock');
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Clock</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>5</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onAddTimerType) {
                    onAddTimerType('empty');
                  } else {
                    onQuickAddDuration(0, 'Empty');
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Empty</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>6</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onAddTimerType) {
                    onAddTimerType('spacer');
                  } else {
                    onQuickAddDuration(0, 'Spacer');
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <span>Spacer</span>
                <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>7</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. OPTIONS MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'options' ? null : 'options')}
            className={menuBtnClass(activeMenu === 'options')}
          >
            <Settings className={`w-3 h-3 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
            <span>Options</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {activeMenu === 'options' && (
            <div className={dropdownBaseClass('w-56')}>
              <button
                onClick={() => {
                  onOpenSettings();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} gap-2`}
              >
                <Settings className="w-3.5 h-3.5 text-cyan-500" />
                <span>General Preferences...</span>
              </button>
              <button
                onClick={() => {
                  onOpenSettings();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} gap-2`}
              >
                <Bell className="w-3.5 h-3.5 text-cyan-400" />
                <span>Alerts Configuration...</span>
              </button>
              <button
                onClick={() => {
                  if (onOpenShortcuts) {
                    onOpenShortcuts();
                  } else {
                    onOpenSettings();
                  }
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <div className="flex items-center gap-2">
                  <Keyboard className="w-3.5 h-3.5 text-amber-500" />
                  <span>Keyboard Shortcuts Manager...</span>
                </div>
                <span className={`text-[10px] font-mono ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>Ctrl+K</span>
              </button>
              {onOpenLanModal && (
                <button
                  onClick={() => {
                    onOpenLanModal();
                    setActiveMenu(null);
                  }}
                  className={`${dropdownItemClass} gap-2 text-cyan-600 dark:text-cyan-300 font-medium`}
                >
                  <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                  <span>LAN Remote & QR Codes Hub...</span>
                </button>
              )}
              {onRunIndependenceTest && (
                <>
                  <div className={dropdownDividerClass} />
                  <button
                    onClick={() => {
                      onRunIndependenceTest();
                      setActiveMenu(null);
                    }}
                    className={`${dropdownItemClass} gap-2 text-cyan-600 dark:text-cyan-300`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Test Multi-List Independence</span>
                  </button>
                </>
              )}

              <div className={dropdownDividerClass} />

              {/* Theme Toggle in Menu */}
              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <div className="flex items-center gap-2">
                  {isDark ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-blue-500" />}
                  <span>{isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}</span>
                </div>
                <span className={`text-[10px] font-mono ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>Toggle</span>
              </button>

              <div className={dropdownDividerClass} />

              {/* Mode A: Application Fullscreen */}
              <button
                type="button"
                onClick={() => {
                  toggleAppFullscreen();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Application Fullscreen (Mode A)</span>
                </div>
                <span className={`text-[10px] font-mono ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>F11</span>
              </button>

              {/* Reset to 1200 x 800 Default Size */}
              <button
                type="button"
                onClick={() => {
                  resetToDefaultSize();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} justify-between`}
              >
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-blue-500" />
                  <span>Reset Default Dimensions</span>
                </div>
                <span className={`text-[10px] font-mono ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>1200×800</span>
              </button>
            </div>
          )}
        </div>

        {/* UNDO & REDO ICONS */}
        <div className={`flex items-center gap-1 ml-1 pl-2 border-l ${separatorBorder}`}>
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
            className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
            className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* RIGHT: Active List, User Profile, Theme Toggle, Cloud Status, Window Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Active List Badge with Rename affordance */}
        {isEditingListName ? (
          <form onSubmit={handleListNameSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={listNameInput}
              onChange={(e) => setListNameInput(e.target.value)}
              onBlur={() => setIsEditingListName(false)}
              autoFocus
              className="glass-input px-3 py-0.5 rounded-full text-xs focus:outline-hidden focus:border-cyan-500"
            />
            <button type="submit" className="glass-btn glass-btn-cyan glass-btn-subtle p-1 rounded-full cursor-pointer">
              <Check className="w-3 h-3" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingListName(true)}
            title="Click to rename active list"
            className="glass-btn glass-btn-subtle flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer"
          >
            <Edit3 className={`w-3 h-3 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`} />
            <span className="font-medium tracking-wide">{currentListName}</span>
          </button>
        )}

        {/* User Profile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            title={`Operator: ${operatorName}`}
            className="glass-btn glass-btn-subtle px-2.5 py-1 rounded-full flex items-center gap-1.5 cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline text-[11px] font-medium">{operatorName}</span>
          </button>

          {showProfileMenu && (
            <div className={`glass-card absolute right-0 top-full mt-1.5 w-56 rounded-2xl p-3.5 text-xs animate-in fade-in zoom-in-95 duration-100 z-50 ${
              isDark ? 'text-neutral-200' : 'text-slate-800'
            }`}>
              <div className={`font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Production Operator</div>
              <div className={`text-[11px] mb-2.5 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Role: Director / Stage Cue Master</div>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Operator Name"
                className="glass-input w-full px-3 py-1.5 rounded-full text-xs mb-2.5"
              />
              <button
                onClick={() => setShowProfileMenu(false)}
                className="glass-btn glass-btn-cyan-active w-full py-1.5 rounded-full text-[11px] font-semibold cursor-pointer"
              >
                Update Profile
              </button>
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts Manager Button */}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts Manager (Ctrl+K)"
            aria-label="Open Keyboard Shortcuts Manager"
            className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
          >
            <Keyboard className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </button>
        )}

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
        >
          {isDark ? (
            <Moon className="w-3.5 h-3.5 text-cyan-400" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-500" />
          )}
        </button>

        {/* Cloud Status Icon */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowCloudMenu(!showCloudMenu)}
            title="Local-First Mode (Offline Guaranteed)"
            className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
          >
            <Cloud className={`w-3.5 h-3.5 ${cloudStatus === 'synced' ? 'text-emerald-400' : 'text-cyan-400'}`} />
          </button>

          {showCloudMenu && (
            <div className={`glass-card absolute right-0 top-full mt-1.5 w-60 rounded-2xl p-3.5 text-xs animate-in fade-in zoom-in-95 duration-100 z-50 ${
              isDark ? 'text-neutral-200' : 'text-slate-800'
            }`}>
              <div className={`flex items-center gap-1.5 font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Local-First Storage Active
              </div>
              <p className={`text-[11px] mb-2.5 leading-relaxed ${isDark ? 'text-neutral-400' : 'text-slate-600'}`}>
                All timers and cues are saved locally to your device via IndexedDB. No internet connection is needed.
              </p>
              <div className={`text-[10px] font-mono px-2.5 py-1.5 rounded-xl border ${
                isDark ? 'text-cyan-300 bg-cyan-950/35 border-cyan-500/30' : 'text-cyan-800 bg-cyan-50 border-cyan-200'
              }`}>
                Cross-Window Sync: CONNECTED
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Brand Dropdown Info Modals (About, Contact / Support, User Guide, Activation, Check for Updates) */}
      {activeBrandDialog && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActiveBrandDialog(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`glass-card w-full max-w-md rounded-[28px] overflow-hidden text-xs ${
              isDark ? 'text-neutral-200' : 'text-slate-800'
            }`}
          >
            <div
              className={`flex items-center justify-between px-5 py-3.5 border-b ${
                isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-white/40 border-slate-300/70'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <img
                  src="/assets/aistudio/icon_ec9a41ea.png"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.endsWith('/icon.png')) {
                      target.src = './icon.png';
                    }
                  }}
                  alt="ProTimer"
                  className="w-5 h-5 object-contain"
                />
                <span>
                  {activeBrandDialog === 'about' && 'About ProTimer'}
                  {activeBrandDialog === 'support' && 'Contact / Support'}
                  {activeBrandDialog === 'guide' && 'ProTimer User Guide'}
                  {activeBrandDialog === 'activation' && 'License & Activation'}
                  {activeBrandDialog === 'updates' && 'Software Updates'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveBrandDialog(null)}
                className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-3 leading-relaxed">
              {activeBrandDialog === 'about' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">ProTimer Desktop</div>
                      <div className={`text-[11px] font-medium ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                        Bigjoe Technology
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono font-semibold">
                      {APP_VERSION_TAG}
                    </span>
                  </div>
                  <p className={isDark ? 'text-neutral-400' : 'text-slate-600'}>
                    Professional multi-timer and stage cue management software for live events,
                    broadcast production, NDI workflows, and multi-monitor stage displays.
                  </p>
                  <div className={`pt-2 border-t text-[11px] font-mono space-y-0.5 ${isDark ? 'border-[#1e2636] text-neutral-400' : 'border-slate-300 text-slate-600'}`}>
                    <div>Owner / Company: Bigjoe Technology</div>
                    <div>Build: {APP_VERSION_TAG} (64-bit) • Copyright © 2026 Bigjoe Technology</div>
                  </div>
                </>
              )}

              {activeBrandDialog === 'support' && (
                <>
                  <p className={isDark ? 'text-neutral-300' : 'text-slate-700'}>
                    Need technical assistance or broadcast workflow support?
                  </p>
                  <div className={`p-3 rounded border space-y-1.5 font-mono text-[11px] ${
                    isDark ? 'bg-[#0b0e14] border-[#1e2636]' : 'bg-slate-200/70 border-slate-300'
                  }`}>
                    <div>Company: Bigjoe Technology</div>
                    <div>Support Email: support@protimer.app</div>
                    <div>Version: ProTimer {APP_VERSION_TAG}</div>
                  </div>
                </>
              )}

              {activeBrandDialog === 'guide' && (
                <div className="space-y-2">
                  <div className="font-semibold">Quick Operator Reference:</div>
                  <ul className={`list-disc pl-4 space-y-1 ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                    <li>Double-click any cue row to edit duration, alerts, and end actions.</li>
                    <li>Use <strong>Fullscreen</strong> or <strong>Multi FS</strong> to send live output to an external monitor.</li>
                    <li>Click <strong>Preview</strong> or <strong>Presenter</strong> to toggle floating always-on-top monitors.</li>
                    <li>Open <strong>Options → Preferences</strong> to customize fonts, sizes, positions, and backgrounds.</li>
                  </ul>
                </div>
              )}

              {activeBrandDialog === 'activation' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-emerald-500 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ProTimer {APP_VERSION_TAG} — Activated (Full Production License)</span>
                  </div>
                  <p className={isDark ? 'text-neutral-400' : 'text-slate-600'}>
                    All broadcast features—including Multi-List Fullscreen, NDI Output, and LAN Remote Control—are unlocked and active on this workstation.
                  </p>
                  <div className={`pt-2 border-t text-[11px] font-mono ${isDark ? 'border-[#1e2636] text-neutral-500' : 'border-slate-300 text-slate-500'}`}>
                    Owner / Publisher: Bigjoe Technology
                  </div>
                </div>
              )}

              {activeBrandDialog === 'updates' && (
                <div className="space-y-3">
                  <div className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                    Installed Version: <span className={isDark ? 'text-white font-semibold' : 'text-slate-900 font-semibold'}>v{updateInfo.currentVersion || APP_VERSION_TAG.replace(/^v/, '')}</span>
                  </div>

                  {updateInfo.status === 'checking' && (
                    <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      <span>Checking GitHub Releases for updates...</span>
                    </div>
                  )}

                  {updateInfo.status === 'downloading' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-cyan-400 font-semibold">
                        <span>Downloading ProTimer v{updateInfo.availableVersion || 'latest'}...</span>
                        <span>{Math.round(updateInfo.percent || 0)}%</span>
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#1e2636]' : 'bg-slate-300'}`}>
                        <div
                          className="h-full bg-cyan-500 transition-all duration-200"
                          style={{ width: `${Math.min(100, Math.max(4, Math.round(updateInfo.percent || 0)))}%` }}
                        />
                      </div>
                      {updateInfo.bytesPerSecond ? (
                        <div className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-600'}`}>
                          {(updateInfo.bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s
                        </div>
                      ) : null}
                    </div>
                  )}

                  {updateInfo.status === 'available' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                        <Download className="w-4 h-4" />
                        <span>New version ProTimer v{updateInfo.availableVersion || 'latest'} is available!</span>
                      </div>
                      <p className={isDark ? 'text-neutral-300' : 'text-slate-600'}>
                        {updateInfo.canAutoInstall
                          ? 'Preparing automatic background download from GitHub Releases...'
                          : 'A newer release was published on GitHub. Download the latest installer to upgrade.'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {updateInfo.canAutoInstall ? (
                          <button
                            type="button"
                            onClick={() => updateService.downloadUpdate()}
                            className="glass-btn glass-btn-cyan px-4 py-1.5 rounded-full font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Update
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateService.openExternalReleaseLink(updateInfo.downloadUrl || updateInfo.releaseUrl)}
                            className="glass-btn glass-btn-emerald-active px-4 py-1.5 rounded-full font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download v{updateInfo.availableVersion || 'Latest'}
                          </button>
                        )}
                        {updateInfo.releaseUrl && (
                          <button
                            type="button"
                            onClick={() => updateService.openExternalReleaseLink(updateInfo.releaseUrl)}
                            className="glass-btn glass-btn-subtle px-3.5 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View Release
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {updateInfo.status === 'downloaded' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-emerald-500 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Update v{updateInfo.availableVersion || 'new'} is downloaded and ready!</span>
                      </div>
                      <p className={isDark ? 'text-neutral-400' : 'text-slate-600'}>
                        Restart ProTimer now to install the new update automatically.
                      </p>
                      <button
                        type="button"
                        onClick={() => updateService.quitAndInstall()}
                        className="glass-btn glass-btn-emerald-active px-4 py-1.5 rounded-full font-semibold cursor-pointer"
                      >
                        Restart and Install Now
                      </button>
                    </div>
                  )}

                  {(updateInfo.status === 'idle' || updateInfo.status === 'up-to-date') && (
                    <>
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>You are running the latest version ({APP_VERSION_TAG})</span>
                      </div>
                      <p className={isDark ? 'text-neutral-400' : 'text-slate-600'}>
                        ProTimer checks GitHub Releases automatically on startup and every hour.
                      </p>
                    </>
                  )}

                  {updateInfo.status === 'error' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-semibold">
                        <Info className="w-4 h-4" />
                        <span>Update Check Notice</span>
                      </div>
                      <p className={isDark ? 'text-neutral-300' : 'text-slate-600'}>
                        {updateInfo.error || updateInfo.message || 'Could not reach GitHub Releases update server.'}
                      </p>
                      {updateInfo.releaseUrl && (
                        <button
                          type="button"
                          onClick={() => updateService.openExternalReleaseLink(updateInfo.releaseUrl)}
                          className="glass-btn glass-btn-subtle px-3.5 py-1.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open GitHub Releases
                        </button>
                      )}
                    </div>
                  )}

                  {updateInfo.releaseNotes &&
                    (updateInfo.status === 'available' ||
                      updateInfo.status === 'downloading' ||
                      updateInfo.status === 'downloaded') && (
                      <div
                        className={`p-2.5 rounded-xl border text-[11px] max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed ${
                          isDark
                            ? 'bg-black/30 border-white/[0.08] text-neutral-300'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        {updateInfo.releaseNotes}
                      </div>
                    )}

                  <div className="pt-1 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={triggerManualUpdateCheck}
                      disabled={updateInfo.status === 'checking' || updateInfo.status === 'downloading'}
                      className="glass-btn glass-btn-subtle px-4 py-1.5 rounded-full text-[11px] font-medium cursor-pointer disabled:opacity-50"
                    >
                      {updateInfo.status === 'checking' ? 'Checking...' : 'Check Again'}
                    </button>
                    {updateInfo.checkedAt && (
                      <span className={`text-[10.5px] ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>
                        Checked {new Date(updateInfo.checkedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              className={`px-5 py-3 border-t flex justify-end ${
                isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-white/40 border-slate-300/70'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveBrandDialog(null)}
                className="glass-btn glass-btn-cyan-active px-5 py-1.5 rounded-full font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
