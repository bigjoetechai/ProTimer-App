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
} from 'lucide-react';
import { useWindowManager } from '../hooks';

interface TopMenuBarProps {
  currentListName: string;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
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

  // Dynamic Theme Helpers
  const headerClass = isDark
    ? 'h-9 bg-[#0e1117] border-b border-[#1e2533] text-neutral-300'
    : 'h-9 bg-[#e2e7f0] border-b border-slate-300 text-slate-800 shadow-2xs';

  const menuBtnClass = (isActive: boolean) =>
    `flex items-center gap-1 px-2.5 py-1 rounded transition-colors cursor-pointer select-none ${
      isActive
        ? isDark ? 'bg-[#1e293b] text-white' : 'bg-slate-300 text-slate-900 font-semibold'
        : isDark ? 'hover:bg-[#161c27] text-neutral-300 hover:text-white' : 'hover:bg-[#d5dce7] text-slate-700 hover:text-slate-900'
    }`;

  const dropdownBaseClass = (width = 'w-48') =>
    `absolute top-full left-0 mt-1 ${width} rounded-md py-1 text-xs animate-in fade-in zoom-in-95 duration-100 z-50 ${
      isDark ? 'bg-[#111622] border border-[#222e42] text-neutral-200 shadow-2xl' : 'bg-[#e6ebf3] border border-slate-300 text-slate-800 shadow-xl'
    }`;

  const dropdownItemClass =
    `w-full text-left px-3.5 py-1.5 flex items-center transition-colors cursor-pointer ${
      isDark ? 'hover:bg-[#1e293b] text-neutral-100 hover:text-white' : 'hover:bg-[#d5dce7] text-slate-800 hover:text-slate-900'
    }`;

  const dropdownDividerClass = `border-t my-1 ${isDark ? 'border-[#1e2533]' : 'border-slate-300'}`;
  const separatorBorder = isDark ? 'border-[#1e2533]' : 'border-slate-300';

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
        {/* Brand Logo */}
        <div className="flex items-center mr-2 font-bold select-none">
          <span className={`font-bold tracking-wider text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
            PRO<span className="text-cyan-500">TIMER</span>
          </span>
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
          accept=".csv"
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
                  onOpenSettings();
                  setActiveMenu(null);
                }}
                className={`${dropdownItemClass} gap-2`}
              >
                <Keyboard className="w-3.5 h-3.5 text-amber-500" />
                <span>Keyboard Shortcuts Cheatsheet</span>
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
        <div className={`flex items-center gap-0.5 ml-1 pl-2 border-l ${separatorBorder}`}>
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
            className={`p-1 rounded transition-colors ${
              !canUndo
                ? 'opacity-35 cursor-not-allowed text-neutral-500'
                : isDark
                  ? 'hover:bg-[#1a202c] text-neutral-300 hover:text-white cursor-pointer'
                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
            className={`p-1 rounded transition-colors ${
              !canRedo
                ? 'opacity-35 cursor-not-allowed text-neutral-500'
                : isDark
                  ? 'hover:bg-[#1a202c] text-neutral-300 hover:text-white cursor-pointer'
                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* RIGHT: Active List, User Profile, Theme Toggle, Cloud Status, Window Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Active List Badge with Rename affordance */}
        {isEditingListName ? (
          <form onSubmit={handleListNameSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={listNameInput}
              onChange={(e) => setListNameInput(e.target.value)}
              onBlur={() => setIsEditingListName(false)}
              autoFocus
              className={`px-2 py-0.5 border border-cyan-500 rounded text-xs focus:outline-hidden ${
                isDark ? 'bg-[#161c26] text-white' : 'bg-white text-slate-900 shadow-xs'
              }`}
            />
            <button type="submit" className="p-1 text-cyan-500 hover:text-cyan-400 cursor-pointer">
              <Check className="w-3 h-3" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingListName(true)}
            title="Click to rename active list"
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
              isDark 
                ? 'bg-[#151a24] hover:bg-[#1c2331] border-[#232d3f] text-neutral-200' 
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
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
            className={`p-1 px-1.5 rounded border flex items-center gap-1 transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#161c26] hover:bg-[#1f2838] border-[#232d3f] text-neutral-300 hover:text-white'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5 text-cyan-500" />
            <span className="hidden md:inline text-[11px] font-medium">{operatorName}</span>
          </button>

          {showProfileMenu && (
            <div className={`absolute right-0 top-full mt-1 w-52 rounded-md shadow-xl p-3 text-xs animate-in fade-in zoom-in-95 duration-100 z-50 ${
              isDark ? 'bg-[#111622] border border-[#222e42] text-neutral-200' : 'bg-white border border-slate-300 text-slate-800'
            }`}>
              <div className={`font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Production Operator</div>
              <div className={`text-[11px] mb-2 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Role: Director / Stage Cue Master</div>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Operator Name"
                className={`w-full px-2 py-1 border rounded text-xs mb-2 ${
                  isDark ? 'bg-[#0c0f16] border-[#26334a] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
              >
                Update Profile
              </button>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            isDark 
              ? 'text-neutral-400 hover:text-white hover:bg-[#1a202c]' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
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
            className={`p-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-cyan-400 hover:bg-[#1a202c]' : 'text-slate-600 hover:text-cyan-600 hover:bg-slate-200'
            }`}
          >
            <Cloud className={`w-3.5 h-3.5 ${cloudStatus === 'synced' ? 'text-emerald-500' : 'text-cyan-500'}`} />
          </button>

          {showCloudMenu && (
            <div className={`absolute right-0 top-full mt-1 w-56 rounded-md shadow-xl p-3 text-xs animate-in fade-in zoom-in-95 duration-100 z-50 ${
              isDark ? 'bg-[#111622] border border-[#222e42] text-neutral-200' : 'bg-white border border-slate-300 text-slate-800'
            }`}>
              <div className={`flex items-center gap-1.5 font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Local-First Storage Active
              </div>
              <p className={`text-[11px] mb-2 leading-relaxed ${isDark ? 'text-neutral-400' : 'text-slate-600'}`}>
                All timers and cues are saved locally to your device via IndexedDB. No internet connection is needed.
              </p>
              <div className={`text-[10px] font-mono p-1.5 rounded border ${
                isDark ? 'text-cyan-400 bg-cyan-950/40 border-cyan-800/40' : 'text-cyan-800 bg-cyan-50 border-cyan-200'
              }`}>
                Cross-Window Sync: CONNECTED
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
