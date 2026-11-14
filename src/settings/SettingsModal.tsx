/**
 * Preferences Modal matching the broadcast Preferences structure and App Theme:
 * - Top bar: "Preferences" on the left; Export, Import, Reset Defaults, and Close icons on the right.
 * - Left sidebar: Style, Timer List, NDI, Updates.
 * - Style top sub-tabs: General Settings, Sizes & Positions, Progress Bar, Images, Alerts, Colors & Animations.
 * - Timer List section:
 *   * DEFAULT NEW LIST SETTINGS: Link cue edit, Single timer mode, Auto schedule
 *   * DEFAULT NEW TIMER SETTINGS:
 *     - TIMER: Timer type (Countdown, etc.), End action (Overtime, etc.), Duration ([x] 00 : 10 : 00)
 *     - ALERTS: Alert 1 ([x] 01 : 30), Alert 2 ([ ] 00 : 30)
 * - Responsive to the App Theme (Dark Studio Pro & Light Daylight).
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Download, RotateCcw, Check, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import {
  AppPreferences,
  DEFAULT_PREFERENCES,
  SizesPositionTargetTab,
  SizesPositionElementId,
  SizesPositionElementConfig,
  SizesPositionTargetExtras,
  DEFAULT_TARGET_ELEMENTS_CONFIG,
  DEFAULT_TARGET_EXTRAS_CONFIG,
  createDefaultSizesAndPositions,
  createDefaultSizesAndPositionsExtras,
  TimerList,
} from '../types';
import { useTheme } from '../hooks';
import { timerManagerService } from '../services/timerManager';
import { ndiStreamService, NdiStreamStatus } from '../services/ndiStreamService';
import {
  COMMON_SYSTEM_FONTS,
  resolveFontFamily,
  useSystemFonts,
} from '../utilities/displayStyleHelper';

interface SettingsModalProps {
  isOpen: boolean;
  preferences: AppPreferences;
  lists?: TimerList[];
  activeListId?: string;
  onClose: () => void;
  onSave: (prefs: AppPreferences) => void;
}

/**
 * Reads an image file as a Data URL and optimizes large images (> 500 KB)
 * to max 1920x1080 so multiple per-list backgrounds persist reliably in localStorage
 * and sync instantaneously across Fullscreen / Multi FS display windows.
 */
function readAndOptimizeImageFile(file: File, maxDimension = 1600): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = String(ev.target?.result || '');
      if (!rawDataUrl) {
        resolve('');
        return;
      }
      // Keep SVGs, GIFs, or already-compact images (< 220 KB) untouched
      if (
        file.type === 'image/svg+xml' ||
        file.type === 'image/gif' ||
        rawDataUrl.length < 220_000
      ) {
        resolve(rawDataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const mime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
          const optimized = canvas.toDataURL(mime, 0.8);
          resolve(optimized && optimized.length < rawDataUrl.length ? optimized : rawDataUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

type SidePanelSection = 'style' | 'timer_list' | 'ndi' | 'updates';
type StyleSubTab =
  | 'general_settings'
  | 'sizes_positions'
  | 'progress_bar'
  | 'images'
  | 'alerts'
  | 'colors_animations';

interface PrefCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  isDark: boolean;
}

const PrefCheckbox: React.FC<PrefCheckboxProps> = ({ checked, onChange, label, isDark }) => {
  return (
    <label
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 cursor-pointer select-none group py-0.5"
    >
      <span
        className={`w-4 h-4 rounded-[3px] flex items-center justify-center transition-colors shrink-0 ${
          checked
            ? isDark
              ? 'bg-[#2b8cff] border border-[#2b8cff] text-white'
              : 'bg-cyan-600 border border-cyan-600 text-white'
            : isDark
            ? 'bg-transparent border border-[#526077] group-hover:border-cyan-400'
            : 'bg-white border border-slate-400 group-hover:border-cyan-600'
        }`}
      >
        {checked && <Check className="w-3 h-3 stroke-[3]" />}
      </span>
      {label !== undefined && (
        <span
          className={`text-[13px] transition-colors ${
            isDark
              ? 'text-neutral-200 group-hover:text-white'
              : 'text-slate-700 group-hover:text-slate-900'
          }`}
        >
          {label}
        </span>
      )}
    </label>
  );
};

interface TimeBoxInputProps {
  seconds: number;
  mode: 'hhmmss' | 'mmss';
  disabled?: boolean;
  isDark: boolean;
  onChange: (newSeconds: number) => void;
}

function formatSpacedTime(totalSec: number, mode: 'hhmmss' | 'mmss'): string {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (mode === 'hhmmss') {
    return `${pad(h)} : ${pad(m)} : ${pad(s)}`;
  }
  const totalMins = Math.floor(sec / 60);
  return `${pad(totalMins)} : ${pad(s)}`;
}

function parseSpacedTime(raw: string, mode: 'hhmmss' | 'mmss', fallback: number): number {
  const cleaned = raw.replace(/\s+/g, '');
  const parts = cleaned.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => isNaN(n) || n < 0)) return fallback;
  if (mode === 'hhmmss') {
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 1) {
      return parts[0] * 60;
    }
  } else {
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 1) {
      return parts[0];
    }
  }
  return fallback;
}

const TimeBoxInput: React.FC<TimeBoxInputProps> = ({
  seconds,
  mode,
  disabled = false,
  isDark,
  onChange,
}) => {
  const [text, setText] = useState(() => formatSpacedTime(seconds, mode));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(formatSpacedTime(seconds, mode));
    }
  }, [seconds, mode, isFocused]);

  const commitValue = () => {
    setIsFocused(false);
    const parsed = parseSpacedTime(text, mode, seconds);
    onChange(parsed);
    setText(formatSpacedTime(parsed, mode));
  };

  return (
    <input
      type="text"
      disabled={disabled}
      value={text}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-[104px] text-center font-mono text-[13px] px-2.5 py-1.5 rounded border transition-colors focus:outline-hidden ${
        disabled
          ? isDark
            ? 'bg-[#0d1118]/60 border-[#1e2636] text-neutral-600 cursor-not-allowed'
            : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
          : isDark
          ? 'bg-[#121722] hover:bg-[#161d2b] border-[#263246] text-neutral-100 focus:border-cyan-400'
          : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600'
      }`}
    />
  );
};

interface NumericStepperProps {
  value: number;
  min?: number;
  max?: number;
  isDark: boolean;
  boxClassName?: string;
  inputClassName?: string;
  onChange: (newValue: number) => void;
}

const NumericStepper: React.FC<NumericStepperProps> = ({
  value,
  min = -200,
  max = 500,
  isDark,
  boxClassName = 'w-[62px] h-[26px]',
  inputClassName = 'w-8 text-[12px]',
  onChange,
}) => {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  return (
    <div
      className={`inline-flex items-center justify-between ${boxClassName} px-2 rounded border transition-colors ${
        isDark
          ? 'bg-[#121722] hover:bg-[#161d2b] border-[#2a364b] text-neutral-100 focus-within:border-cyan-400'
          : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-900 focus-within:border-cyan-600'
      }`}
    >
      <input
        type="text"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '' || raw === '-') return;
          const parsed = parseInt(raw, 10);
          if (!isNaN(parsed)) {
            onChange(clamp(parsed));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(clamp(value + 1));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(value - 1));
          }
        }}
        className={`${inputClassName} flex-1 min-w-0 bg-transparent text-right font-mono focus:outline-hidden pr-1.5`}
      />
      <div className="flex flex-col items-center justify-center -mr-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          className={`leading-none p-0 cursor-pointer ${
            isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-400 hover:text-slate-800'
          }`}
          tabIndex={-1}
        >
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          className={`leading-none p-0 cursor-pointer ${
            isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-400 hover:text-slate-800'
          }`}
          tabIndex={-1}
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

const SIZES_POSITION_TARGET_TABS: Array<{ id: SizesPositionTargetTab; label: string }> = [
  { id: 'fullscreen_ndi_preview', label: 'Fullscreen / NDI / Preview' },
  { id: 'presenter_window', label: 'Presenter Window' },
  { id: 'multitimer', label: 'Multitimer' },
  { id: 'web_display_lan', label: 'Web display (LAN)' },
];

const SIZES_POSITION_ROWS: Array<{
  id: SizesPositionElementId;
  label: string;
  indented?: boolean;
  hasVisible?: boolean;
  locationOptions?: string[];
  hasVert?: boolean;
  hasHoriz?: boolean;
  hasSize?: boolean;
  hasFont?: boolean;
  hasStyle?: boolean;
}> = [
  {
    id: 'timer_list',
    label: 'Timer List',
    hasVisible: true,
    locationOptions: ['Top', 'Middle', 'Bottom', 'Left', 'Right'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: true,
    hasStyle: true,
  },
  {
    id: 'message',
    label: 'Message',
    hasVisible: true,
    locationOptions: ['Top', 'Middle', 'Bottom'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: true,
    hasStyle: true,
  },
  {
    id: 'countdown',
    label: 'Countdown',
    hasVisible: true,
    locationOptions: ['Middle', 'Top', 'Bottom'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: true,
    hasStyle: true,
  },
  {
    id: 'colon',
    label: 'Colon',
    indented: true,
    hasVisible: false,
    hasVert: true,
    hasHoriz: false,
    hasSize: false,
    hasFont: false,
    hasStyle: false,
  },
  {
    id: 'name',
    label: 'Name',
    hasVisible: true,
    locationOptions: ['Bottom', 'Middle', 'Top'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: true,
    hasStyle: true,
  },
  {
    id: 'clock',
    label: 'Clock',
    hasVisible: true,
    locationOptions: ['Top', 'Middle', 'Bottom'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: true,
    hasStyle: true,
  },
  {
    id: 'date',
    label: 'Date',
    hasVisible: true,
    locationOptions: ['Top', 'Middle', 'Bottom'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: true,
    hasStyle: true,
  },
  {
    id: 'progress_bar',
    label: 'Progress Bar',
    hasVisible: true,
    locationOptions: ['Bottom', 'Top', 'Middle'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: false,
    hasStyle: false,
  },
  {
    id: 'border',
    label: 'Border',
    hasVisible: true,
  },
  {
    id: 'background',
    label: 'Background',
    hasVisible: true,
  },
  {
    id: 'logo',
    label: 'Logo',
    hasVisible: true,
    locationOptions: ['TopRight', 'TopLeft', 'BottomRight', 'BottomLeft', 'Top', 'Middle', 'Bottom'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: false,
    hasStyle: false,
  },
  {
    id: 'slide_text',
    label: 'Slide Text',
    hasVisible: true,
    locationOptions: ['Top', 'Middle', 'Bottom'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: true,
    hasStyle: true,
  },
  {
    id: 'slide_progress',
    label: 'Slide Progress',
    hasVisible: true,
    locationOptions: ['High', 'Low', 'Top', 'Middle', 'Bottom'],
    hasVert: true,
    hasHoriz: true,
    hasSize: true,
    hasFont: false,
    hasStyle: false,
  },
];

const FONT_FAMILY_OPTIONS = COMMON_SYSTEM_FONTS;

const FONT_STYLE_OPTIONS = ['Normal', 'Bold', 'Italic', 'Bold Italic'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  preferences,
  lists,
  activeListId,
  onClose,
  onSave,
}) => {
  const { isDark, setTheme } = useTheme();
  const systemFonts = useSystemFonts();
  const [prefs, setPrefs] = useState<AppPreferences>({
    ...DEFAULT_PREFERENCES,
    ...preferences,
  });
  const [activeSection, setActiveSection] = useState<SidePanelSection>('style');
  const [activeStyleTab, setActiveStyleTab] = useState<StyleSubTab>('general_settings');
  const [activeSizesTargetTab, setActiveSizesTargetTab] =
    useState<SizesPositionTargetTab>('fullscreen_ndi_preview');
  const [hasUnappliedChanges, setHasUnappliedChanges] = useState(false);
  const [appliedFeedback, setAppliedFeedback] = useState(false);
  const [ndiStatus, setNdiStatus] = useState<NdiStreamStatus>(() =>
    ndiStreamService.getStatus()
  );
  const applyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listBgImageInputRef = useRef<HTMLInputElement>(null);
  const pendingListBgTargetIdRef = useRef<string | null>(null);
  const listLogoImageInputRef = useRef<HTMLInputElement>(null);
  const pendingListLogoTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = ndiStreamService.subscribe((status) => {
      setNdiStatus(status);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPrefs({
        ...DEFAULT_PREFERENCES,
        ...preferences,
      });
      setHasUnappliedChanges(false);
      setAppliedFeedback(false);
    }
  }, [isOpen, preferences]);

  useEffect(() => {
    return () => {
      if (applyFeedbackTimerRef.current) {
        clearTimeout(applyFeedbackTimerRef.current);
      }
    };
  }, []);

  const availableLists: TimerList[] =
    lists && lists.length > 0 ? lists : timerManagerService.getAllLists();
  const currentActiveListId =
    activeListId || timerManagerService.getSnapshot().activeListId || availableLists[0]?.id || 'list_1';

  if (!isOpen) return null;

  const stagePreferences = (updated: AppPreferences) => {
    setPrefs(updated);
    setHasUnappliedChanges(true);
    setAppliedFeedback(false);
  };

  const updatePref = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    const updated = { ...prefs, [key]: value };
    stagePreferences(updated);
  };

  const handleApply = () => {
    onSave(prefs);
    if (prefs.theme === 'dark' || prefs.theme === 'light') {
      setTheme(prefs.theme);
    }
    setHasUnappliedChanges(false);
    setAppliedFeedback(true);
    if (applyFeedbackTimerRef.current) {
      clearTimeout(applyFeedbackTimerRef.current);
    }
    applyFeedbackTimerRef.current = setTimeout(() => {
      setAppliedFeedback(false);
    }, 2200);
  };

  const handleClose = () => {
    onClose();
  };

  const handleResetDefaults = () => {
    const reset = { ...DEFAULT_PREFERENCES };
    stagePreferences(reset);
  };

  const handleExportPreferences = () => {
    const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'protimer-preferences.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportPreferences = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || '{}'));
        if (parsed && typeof parsed === 'object') {
          const merged = { ...DEFAULT_PREFERENCES, ...parsed };
          stagePreferences(merged);
        }
      } catch {
        // Ignore invalid JSON file
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sideNavItems: Array<{ id: SidePanelSection; label: string }> = [
    { id: 'style', label: 'Style' },
    { id: 'timer_list', label: 'Timer List' },
    { id: 'ndi', label: 'NDI' },
    { id: 'updates', label: 'Updates' },
  ];

  const styleSubTabs: Array<{ id: StyleSubTab; label: string }> = [
    { id: 'general_settings', label: 'General Settings' },
    { id: 'sizes_positions', label: 'Sizes & Positions' },
    { id: 'progress_bar', label: 'Progress Bar' },
    { id: 'images', label: 'Images' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'colors_animations', label: 'Colors & Animations' },
  ];

  // App-matched theme classes
  const outerShellCls = isDark
    ? 'bg-[#0f131a] border-[#222d3d] text-neutral-200'
    : 'bg-white border-slate-300 text-slate-800';
  const topHeaderCls = isDark
    ? 'bg-[#0b0e14] border-[#1b2333]'
    : 'bg-slate-100 border-slate-200';
  const sideBarCls = isDark
    ? 'bg-[#0b0e14] border-[#1b2333]'
    : 'bg-slate-100/90 border-slate-200';
  const rightAreaCls = isDark ? 'bg-[#0f131a]' : 'bg-slate-50';
  const subTabBarCls = isDark
    ? 'bg-[#0c1017] border-[#1b2333]'
    : 'bg-slate-100 border-slate-200';
  const contentCardCls = isDark
    ? 'bg-[#0b0e14] border-[#1a2333]'
    : 'bg-white border-slate-200 shadow-2xs';
  const sectionHeadingCls = isDark
    ? 'text-[13px] font-semibold uppercase tracking-wide text-[#4ea8ff]'
    : 'text-[13px] font-semibold uppercase tracking-wide text-cyan-700';
  const selectCls = isDark
    ? 'appearance-none bg-[#121722] hover:bg-[#171e2c] border border-[#263246] rounded px-3 py-1.5 pr-8 text-[13px] text-neutral-100 focus:outline-hidden focus:border-cyan-400 cursor-pointer'
    : 'appearance-none bg-white hover:bg-slate-50 border border-slate-300 rounded px-3 py-1.5 pr-8 text-[13px] text-slate-900 focus:outline-hidden focus:border-cyan-600 cursor-pointer';
  const inputCls = isDark
    ? 'w-full px-3 py-1.5 bg-[#121722] border border-[#263246] rounded text-[13px] text-white focus:outline-hidden focus:border-cyan-400'
    : 'w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-[13px] text-slate-900 focus:outline-hidden focus:border-cyan-600';
  const iconBtnCls = isDark
    ? 'p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#182030] transition-colors cursor-pointer'
    : 'p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none"
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-[900px] h-[530px] border rounded-lg shadow-2xl flex flex-col overflow-hidden transition-colors duration-150 ${outerShellCls}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* =====================================================================
            TOP HEADER BAR
           ===================================================================== */}
        <div className={`h-12 px-5 border-b flex items-center justify-between shrink-0 ${topHeaderCls}`}>
          <h2 className={`text-[15px] font-semibold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Preferences
          </h2>

          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportPreferences}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleExportPreferences}
              title="Export Preferences"
              className={iconBtnCls}
            >
              <Upload className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import Preferences"
              className={iconBtnCls}
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              title="Reset to Default Preferences"
              className={iconBtnCls}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className={`h-4 w-[1px] mx-1.5 ${isDark ? 'bg-[#222d3d]' : 'bg-slate-300'}`} />

            <button
              type="button"
              onClick={handleClose}
              title="Close Preferences"
              className={iconBtnCls}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            BODY: LEFT SIDE PANEL + RIGHT CONTENT AREA
           ===================================================================== */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT SIDEBAR */}
          <div className={`w-[160px] border-r py-2 flex flex-col shrink-0 ${sideBarCls}`}>
            {sideNavItems.map((item) => {
              const isSelected = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`relative w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? isDark
                        ? 'bg-[#151c28] text-[#4ea8ff]'
                        : 'bg-white text-cyan-700 shadow-2xs'
                      : isDark
                      ? 'text-neutral-400 hover:text-white hover:bg-[#111622]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  {isSelected && (
                    <span
                      className={`absolute left-0 top-0.5 bottom-0.5 w-[3px] rounded-r ${
                        isDark ? 'bg-[#2b8cff]' : 'bg-cyan-600'
                      }`}
                    />
                  )}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* RIGHT CONTENT AREA */}
          <div className={`flex-1 flex flex-col min-w-0 ${rightAreaCls}`}>
            {activeSection === 'style' && (
              <>
                {/* STYLE TOP SUB-TABS */}
                <div className={`px-4 pt-1 border-b flex items-center gap-1 overflow-x-auto shrink-0 ${subTabBarCls}`}>
                  {styleSubTabs.map((tab) => {
                    const isTabActive = activeStyleTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveStyleTab(tab.id)}
                        className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                          isTabActive
                            ? isDark
                              ? 'border-[#2b8cff] text-[#4ea8ff]'
                              : 'border-cyan-600 text-cyan-700'
                            : isDark
                            ? 'border-transparent text-neutral-400 hover:text-white'
                            : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* STYLE TAB CONTENT */}
                <div className="flex-1 p-3 overflow-y-auto">
                  <div className={`h-full border rounded-xs p-5 overflow-y-auto ${contentCardCls}`}>
                    {/* 1. GENERAL SETTINGS */}
                    {activeStyleTab === 'general_settings' && (
                      <div className="space-y-6">
                        {/* GENERAL OPTIONS */}
                        <div className="space-y-2.5">
                          <h3 className={sectionHeadingCls}>GENERAL OPTIONS</h3>
                          <div className="flex flex-col space-y-2">
                            <PrefCheckbox
                              isDark={isDark}
                              checked={Boolean(prefs.hideLeadingZeros)}
                              onChange={(val) => updatePref('hideLeadingZeros', val)}
                              label="Hide zeros in front of numbers (e.g. 2:00 instead of 02:00)"
                            />
                            <PrefCheckbox
                              isDark={isDark}
                              checked={prefs.turnOffAeroShake ?? true}
                              onChange={(val) => updatePref('turnOffAeroShake', val)}
                              label="Turn off aero shake"
                            />
                          </div>
                        </div>

                        {/* TWO COLUMNS: COUNTDOWN OPTIONS & CLOCK/DATE OPTIONS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* LEFT COLUMN: COUNTDOWN OPTIONS */}
                          <div className="space-y-2.5">
                            <h3 className={sectionHeadingCls}>COUNTDOWN OPTIONS</h3>
                            <div className="flex flex-col space-y-2.5">
                              <PrefCheckbox
                                isDark={isDark}
                                checked={prefs.displayHours ?? true}
                                onChange={(val) => updatePref('displayHours', val)}
                                label="Display hours"
                              />
                              <PrefCheckbox
                                isDark={isDark}
                                checked={prefs.displaySeconds ?? true}
                                onChange={(val) => updatePref('displaySeconds', val)}
                                label="Display seconds"
                              />
                              <PrefCheckbox
                                isDark={isDark}
                                checked={Boolean(prefs.hideHoursUnderOneHour)}
                                onChange={(val) => updatePref('hideHoursUnderOneHour', val)}
                                label="Hide hours when counter is less than 1 hour"
                              />
                              <PrefCheckbox
                                isDark={isDark}
                                checked={Boolean(prefs.sumHoursIntoMinutes)}
                                onChange={(val) => updatePref('sumHoursIntoMinutes', val)}
                                label="Sum hours into minutes field"
                              />
                            </div>
                          </div>

                          {/* RIGHT COLUMN: CLOCK OPTIONS & DATE OPTIONS */}
                          <div className="space-y-6">
                            <div className="space-y-2.5">
                              <h3 className={sectionHeadingCls}>CLOCK OPTIONS</h3>
                              <div className="flex flex-col space-y-2.5">
                                <PrefCheckbox
                                  isDark={isDark}
                                  checked={Boolean(prefs.clockDisplaySeconds)}
                                  onChange={(val) => updatePref('clockDisplaySeconds', val)}
                                  label="Display seconds"
                                />
                                <PrefCheckbox
                                  isDark={isDark}
                                  checked={prefs.timeFormat24h ?? true}
                                  onChange={(val) => updatePref('timeFormat24h', val)}
                                  label="Use 24 hour clock"
                                />
                              </div>
                            </div>

                            <div className="space-y-2.5">
                              <h3 className={sectionHeadingCls}>DATE OPTIONS</h3>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-[13px]">Date format</span>
                                <div className="relative">
                                  <select
                                    value={prefs.dateFormat || 'short'}
                                    onChange={(e) =>
                                      updatePref(
                                        'dateFormat',
                                        e.target.value as AppPreferences['dateFormat']
                                      )
                                    }
                                    className={`${selectCls} min-w-[155px]`}
                                  >
                                    <option value="short">Use short format</option>
                                    <option value="long">Use long format</option>
                                    <option value="iso">ISO (YYYY-MM-DD)</option>
                                    <option value="dmy">DD/MM/YYYY</option>
                                    <option value="mdy">MM/DD/YYYY</option>
                                  </select>
                                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* SCHEDULE TIME ZONE */}
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center gap-2">
                            <h3 className={sectionHeadingCls}>SCHEDULE TIME ZONE</h3>
                            <span
                              title="Determines the reference time zone used for scheduled cue start times and wall-clock targets."
                              className={`w-4 h-4 rounded-full text-[10px] font-serif italic flex items-center justify-center cursor-help ${
                                isDark ? 'bg-[#1a2232] text-neutral-400' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              i
                            </span>
                          </div>
                          <PrefCheckbox
                            isDark={isDark}
                            checked={prefs.useComputerTimeZone ?? true}
                            onChange={(val) => updatePref('useComputerTimeZone', val)}
                            label={
                              <span>
                                Use this computer&apos;s time zone&nbsp;&nbsp;
                                <span className={isDark ? 'text-white' : 'text-slate-900 font-medium'}>
                                  {prefs.customTimeZone || 'UTC — UTC+00:00'}
                                </span>
                              </span>
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* 2. SIZES & POSITIONS (Exact match to reference screenshot + App Theme) */}
                    {activeStyleTab === 'sizes_positions' && (() => {
                      const allTargets =
                        prefs.sizesAndPositionsByTarget || createDefaultSizesAndPositions();
                      const currentTargetMap = {
                        ...DEFAULT_TARGET_ELEMENTS_CONFIG,
                        ...(allTargets[activeSizesTargetTab] || {}),
                      };

                      const updateElementConfig = (
                        elementId: SizesPositionElementId,
                        patch: Partial<SizesPositionElementConfig>
                      ) => {
                        const existingElem = {
                          ...DEFAULT_TARGET_ELEMENTS_CONFIG[elementId],
                          ...(currentTargetMap[elementId] || {}),
                        };
                        const updatedElem = { ...existingElem, ...patch };
                        const updatedTargets = {
                          ...allTargets,
                          [activeSizesTargetTab]: {
                            ...currentTargetMap,
                            [elementId]: updatedElem,
                          },
                        };

                        // When editing the primary Fullscreen / NDI / Preview tab, also apply the patch
                        // to Presenter, Multitimer, and Web Display (LAN) so changes apply across all displays
                        // unless the user specifically switches to another target tab to customize it.
                        if (activeSizesTargetTab === 'fullscreen_ndi_preview') {
                          const otherTargets: SizesPositionTargetTab[] = [
                            'presenter_window',
                            'multitimer',
                            'web_display_lan',
                          ];
                          for (const t of otherTargets) {
                            const targetMap = {
                              ...DEFAULT_TARGET_ELEMENTS_CONFIG,
                              ...(allTargets[t] || {}),
                            };
                            const targetElem = {
                              ...DEFAULT_TARGET_ELEMENTS_CONFIG[elementId],
                              ...(targetMap[elementId] || {}),
                              ...patch,
                            };
                            updatedTargets[t] = {
                              ...targetMap,
                              [elementId]: targetElem,
                            };
                          }
                        }

                        const nextPrefs: AppPreferences = {
                          ...prefs,
                          sizesAndPositionsByTarget: updatedTargets,
                        };

                        // Sync primary Fullscreen / NDI / Preview sizes with top-level scale preferences
                        if (activeSizesTargetTab === 'fullscreen_ndi_preview') {
                          if (elementId === 'countdown' && patch.sizePercent !== undefined) {
                            nextPrefs.timerFontSizePercent = patch.sizePercent;
                          }
                          if (elementId === 'name' && patch.sizePercent !== undefined) {
                            nextPrefs.timerNameSizePercent = patch.sizePercent;
                          }
                          if (elementId === 'message' && patch.sizePercent !== undefined) {
                            nextPrefs.messageSizePercent = patch.sizePercent;
                          }
                          if (elementId === 'progress_bar') {
                            if (patch.visible !== undefined) {
                              nextPrefs.showProgressBar = patch.visible;
                            }
                            if (patch.location === 'Top') {
                              nextPrefs.progressBarPosition = 'top';
                            } else if (patch.location === 'Bottom') {
                              nextPrefs.progressBarPosition = 'bottom';
                            }
                          }
                        }

                        stagePreferences(nextPrefs);
                      };

                      const allExtras =
                        prefs.sizesAndPositionsExtrasByTarget ||
                        createDefaultSizesAndPositionsExtras();
                      const currentExtras: SizesPositionTargetExtras = {
                        ...DEFAULT_TARGET_EXTRAS_CONFIG,
                        ...(allExtras[activeSizesTargetTab] || {}),
                      };

                      const updateTargetExtras = (patch: Partial<SizesPositionTargetExtras>) => {
                        const updatedExtrasMap = {
                          ...allExtras,
                          [activeSizesTargetTab]: {
                            ...currentExtras,
                            ...patch,
                          },
                        };

                        if (activeSizesTargetTab === 'fullscreen_ndi_preview') {
                          const otherTargets: SizesPositionTargetTab[] = [
                            'presenter_window',
                            'multitimer',
                            'web_display_lan',
                          ];
                          for (const t of otherTargets) {
                            updatedExtrasMap[t] = {
                              ...DEFAULT_TARGET_EXTRAS_CONFIG,
                              ...(allExtras[t] || {}),
                              ...patch,
                            };
                          }
                        }

                        const nextPrefs: AppPreferences = {
                          ...prefs,
                          sizesAndPositionsExtrasByTarget: updatedExtrasMap,
                        };
                        stagePreferences(nextPrefs);
                      };

                      const compactSelectCls = isDark
                        ? 'appearance-none bg-[#121722] hover:bg-[#171e2c] border border-[#2a364b] rounded px-2 h-[26px] pr-6 text-[12px] text-neutral-100 focus:outline-hidden focus:border-cyan-400 cursor-pointer w-full'
                        : 'appearance-none bg-white hover:bg-slate-50 border border-slate-300 rounded px-2 h-[26px] pr-6 text-[12px] text-slate-900 focus:outline-hidden focus:border-cyan-600 cursor-pointer w-full';

                      const dpadBtnCls = isDark
                        ? 'w-[34px] h-[25px] rounded border border-[#2a364b] bg-[#121722] hover:bg-[#1a2232] active:bg-[#222d42] text-neutral-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-[10px]'
                        : 'w-[34px] h-[25px] rounded border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer text-[10px]';

                      return (
                        <div className="space-y-5">
                          {/* Display Target Selector Buttons */}
                          <div className="flex items-center gap-1.5 flex-wrap pb-1">
                            {SIZES_POSITION_TARGET_TABS.map((targetBtn) => {
                              const isTargetActive = activeSizesTargetTab === targetBtn.id;
                              return (
                                <button
                                  key={targetBtn.id}
                                  type="button"
                                  onClick={() => setActiveSizesTargetTab(targetBtn.id)}
                                  className={`px-3 py-1 rounded text-[12px] font-medium border transition-colors cursor-pointer ${
                                    isTargetActive
                                      ? isDark
                                        ? 'bg-[#0078e7] border-[#2b8cff] text-white font-semibold shadow-2xs'
                                        : 'bg-cyan-600 border-cyan-600 text-white font-semibold shadow-2xs'
                                      : isDark
                                      ? 'bg-transparent hover:bg-[#151c28] border-[#2a364b] text-neutral-300 hover:text-white'
                                      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900'
                                  }`}
                                >
                                  {targetBtn.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Element Layout Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr
                                  className={`border-b text-[12px] font-semibold ${
                                    isDark
                                      ? 'border-[#222d3f] text-neutral-200'
                                      : 'border-slate-300 text-slate-700'
                                  }`}
                                >
                                  <th className="py-1.5 pr-2 min-w-[115px]">Element</th>
                                  <th className="py-1.5 px-2 w-[54px] text-center">Visible</th>
                                  <th className="py-1.5 px-1.5 w-[114px]">Location</th>
                                  <th className="py-1.5 px-1.5 w-[68px]">Vert</th>
                                  <th className="py-1.5 px-1.5 w-[68px]">Horiz</th>
                                  <th className="py-1.5 px-1.5 w-[68px]">Size %</th>
                                  <th className="py-1.5 px-1.5 w-[108px]">Font</th>
                                  <th className="py-1.5 pl-1.5 w-[104px]">Style</th>
                                </tr>
                              </thead>
                              <tbody className="text-[12.5px]">
                                {SIZES_POSITION_ROWS.map((row, idx) => {
                                  const cfg: SizesPositionElementConfig = {
                                    ...DEFAULT_TARGET_ELEMENTS_CONFIG[row.id],
                                    ...(currentTargetMap[row.id] || {}),
                                  };
                                  const isEven = idx % 2 === 0;

                                  return (
                                    <tr
                                      key={row.id}
                                      className={`transition-colors ${
                                        isEven
                                          ? isDark
                                            ? 'bg-[#121722]/75'
                                            : 'bg-slate-100/75'
                                          : 'bg-transparent'
                                      }`}
                                    >
                                      {/* Element Name */}
                                      <td
                                        className={`py-1 pr-2 font-normal ${
                                          row.indented ? 'pl-3.5' : 'pl-1'
                                        } ${isDark ? 'text-neutral-200' : 'text-slate-800'}`}
                                      >
                                        {row.label}
                                      </td>

                                      {/* Visible Checkbox */}
                                      <td className="py-1 px-2 text-center">
                                        {row.hasVisible ? (
                                          <div className="inline-flex items-center justify-center">
                                            <PrefCheckbox
                                              isDark={isDark}
                                              checked={Boolean(cfg.visible)}
                                              onChange={(val) =>
                                                updateElementConfig(row.id, { visible: val })
                                              }
                                            />
                                          </div>
                                        ) : null}
                                      </td>

                                      {/* Location Dropdown */}
                                      <td className="py-1 px-1.5">
                                        {row.locationOptions ? (
                                          <div className="relative">
                                            <select
                                              value={cfg.location || row.locationOptions[0]}
                                              onChange={(e) =>
                                                updateElementConfig(row.id, {
                                                  location: e.target.value,
                                                })
                                              }
                                              className={compactSelectCls}
                                            >
                                              {row.locationOptions.map((loc) => (
                                                <option key={loc} value={loc}>
                                                  {loc}
                                                </option>
                                              ))}
                                            </select>
                                            <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                          </div>
                                        ) : null}
                                      </td>

                                      {/* Vert Stepper */}
                                      <td className="py-1 px-1.5">
                                        {row.hasVert ? (
                                          <NumericStepper
                                            value={cfg.vert ?? 0}
                                            min={-100}
                                            max={100}
                                            isDark={isDark}
                                            onChange={(val) =>
                                              updateElementConfig(row.id, { vert: val })
                                            }
                                          />
                                        ) : null}
                                      </td>

                                      {/* Horiz Stepper */}
                                      <td className="py-1 px-1.5">
                                        {row.hasHoriz ? (
                                          <NumericStepper
                                            value={cfg.horiz ?? 0}
                                            min={-100}
                                            max={100}
                                            isDark={isDark}
                                            onChange={(val) =>
                                              updateElementConfig(row.id, { horiz: val })
                                            }
                                          />
                                        ) : null}
                                      </td>

                                      {/* Size % Stepper */}
                                      <td className="py-1 px-1.5">
                                        {row.hasSize ? (
                                          <NumericStepper
                                            value={cfg.sizePercent ?? 33}
                                            min={5}
                                            max={300}
                                            isDark={isDark}
                                            onChange={(val) =>
                                              updateElementConfig(row.id, { sizePercent: val })
                                            }
                                          />
                                        ) : null}
                                      </td>

                                      {/* Font Dropdown */}
                                      <td className="py-1 px-1.5">
                                        {row.hasFont ? (
                                          <div className="relative">
                                            <select
                                              value={cfg.font || 'Verdana'}
                                              onChange={(e) =>
                                                updateElementConfig(row.id, {
                                                  font: e.target.value,
                                                })
                                              }
                                              style={{
                                                fontFamily: resolveFontFamily(cfg.font || 'Verdana'),
                                              }}
                                              className={compactSelectCls}
                                            >
                                              {(cfg.font &&
                                              !systemFonts.includes(cfg.font)
                                                ? [cfg.font, ...systemFonts]
                                                : systemFonts.length > 0
                                                ? systemFonts
                                                : FONT_FAMILY_OPTIONS
                                              ).map((f) => (
                                                <option
                                                  key={f}
                                                  value={f}
                                                  style={{ fontFamily: resolveFontFamily(f) }}
                                                >
                                                  {f}
                                                </option>
                                              ))}
                                            </select>
                                            <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                          </div>
                                        ) : null}
                                      </td>

                                      {/* Style Dropdown */}
                                      <td className="py-1 pl-1.5">
                                        {row.hasStyle ? (
                                          <div className="relative">
                                            <select
                                              value={cfg.fontStyle || 'Normal'}
                                              onChange={(e) =>
                                                updateElementConfig(row.id, {
                                                  fontStyle: e.target.value,
                                                })
                                              }
                                              className={compactSelectCls}
                                            >
                                              {FONT_STYLE_OPTIONS.map((st) => (
                                                <option key={st} value={st}>
                                                  {st}
                                                </option>
                                              ))}
                                            </select>
                                            <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                          </div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* =========================================================
                              DIVIDER + SHADOW SECTION
                             ========================================================= */}
                          <div className={`border-t pt-4 space-y-3 ${isDark ? 'border-[#1e2636]' : 'border-slate-200'}`}>
                            <h3 className={sectionHeadingCls}>SHADOW</h3>

                            <PrefCheckbox
                              isDark={isDark}
                              checked={Boolean(currentExtras.enableShadow)}
                              onChange={(val) => updateTargetExtras({ enableShadow: val })}
                              label="Enable shadow"
                            />

                            <div className="flex flex-wrap items-start gap-6 pt-1">
                              {/* X Offset */}
                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  X Offset
                                </label>
                                <NumericStepper
                                  value={currentExtras.shadowXOffset ?? 5}
                                  min={-100}
                                  max={100}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ shadowXOffset: val })}
                                />
                              </div>

                              {/* Y Offset */}
                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Y Offset
                                </label>
                                <NumericStepper
                                  value={currentExtras.shadowYOffset ?? -5}
                                  min={-100}
                                  max={100}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ shadowYOffset: val })}
                                />
                              </div>

                              {/* Shadow blur */}
                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Shadow blur
                                </label>
                                <NumericStepper
                                  value={currentExtras.shadowBlur ?? 0}
                                  min={0}
                                  max={100}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ shadowBlur: val })}
                                />
                              </div>

                              {/* Color (Checkerboard Swatch + Native Picker) */}
                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Color
                                </label>
                                <label
                                  title="Select shadow color"
                                  className={`relative block w-[48px] h-[30px] rounded border overflow-hidden cursor-pointer ${
                                    isDark ? 'border-[#2a364b]' : 'border-slate-300'
                                  }`}
                                >
                                  {/* Checkerboard pattern background */}
                                  <span className="absolute inset-0 bg-[conic-gradient(#808080_25%,#b0b0b0_25%_50%,#808080_50%_75%,#b0b0b0_75%)] bg-[length:8px_8px]" />
                                  {!currentExtras.shadowColorTransparent && (
                                    <span
                                      className="absolute inset-0 opacity-85"
                                      style={{ backgroundColor: currentExtras.shadowColor || '#000000' }}
                                    />
                                  )}
                                  <input
                                    type="color"
                                    value={currentExtras.shadowColor || '#000000'}
                                    onChange={(e) =>
                                      updateTargetExtras({
                                        shadowColor: e.target.value,
                                        shadowColorTransparent: false,
                                      })
                                    }
                                    className="sr-only"
                                  />
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* =========================================================
                              DIVIDER + CROP & SCALE SECTION
                             ========================================================= */}
                          <div className={`border-t pt-4 space-y-3 ${isDark ? 'border-[#1e2636]' : 'border-slate-200'}`}>
                            <h3 className={sectionHeadingCls}>CROP &amp; SCALE</h3>

                            <PrefCheckbox
                              isDark={isDark}
                              checked={Boolean(currentExtras.enableCrop)}
                              onChange={(val) => updateTargetExtras({ enableCrop: val })}
                              label="Enable crop"
                            />

                            {/* Row 1: Left %, Right %, Top %, Bottom % */}
                            <div className="flex flex-wrap items-start gap-6 pt-1">
                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Left %
                                </label>
                                <NumericStepper
                                  value={currentExtras.cropLeftPercent ?? 0}
                                  min={0}
                                  max={100}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ cropLeftPercent: val })}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Right %
                                </label>
                                <NumericStepper
                                  value={currentExtras.cropRightPercent ?? 0}
                                  min={0}
                                  max={100}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ cropRightPercent: val })}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Top %
                                </label>
                                <NumericStepper
                                  value={currentExtras.cropTopPercent ?? 0}
                                  min={0}
                                  max={100}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ cropTopPercent: val })}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Bottom %
                                </label>
                                <NumericStepper
                                  value={currentExtras.cropBottomPercent ?? 0}
                                  min={0}
                                  max={100}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ cropBottomPercent: val })}
                                />
                              </div>
                            </div>

                            {/* Row 2: Corner radius, BG Key color, Size (- / +), Position (D-pad) */}
                            <div className="flex flex-wrap items-start gap-6 pt-2">
                              {/* Corner radius */}
                              <div className="space-y-1.5 w-[96px]">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Corner radius
                                </label>
                                <NumericStepper
                                  value={currentExtras.cornerRadius ?? 0}
                                  min={0}
                                  max={200}
                                  isDark={isDark}
                                  boxClassName="w-[96px] h-[30px]"
                                  inputClassName="text-[13px]"
                                  onChange={(val) => updateTargetExtras({ cornerRadius: val })}
                                />
                              </div>

                              {/* BG Key color */}
                              <div className="space-y-1.5 w-[96px]">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  BG Key color
                                </label>
                                <label
                                  title="Select background key color"
                                  className={`relative block w-[48px] h-[30px] rounded border overflow-hidden cursor-pointer ${
                                    isDark ? 'border-[#2a364b]' : 'border-slate-300'
                                  }`}
                                  style={{ backgroundColor: currentExtras.bgKeyColor || '#000000' }}
                                >
                                  <input
                                    type="color"
                                    value={currentExtras.bgKeyColor || '#000000'}
                                    onChange={(e) =>
                                      updateTargetExtras({ bgKeyColor: e.target.value })
                                    }
                                    className="sr-only"
                                  />
                                </label>
                              </div>

                              {/* Size (- / +) */}
                              <div className="space-y-1.5 w-[96px]">
                                <label className={`block text-[12.5px] ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Size
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    title={`Decrease size (${currentExtras.scaleZoomPercent ?? 100}%)`}
                                    onClick={() =>
                                      updateTargetExtras({
                                        scaleZoomPercent: Math.max(
                                          10,
                                          (currentExtras.scaleZoomPercent ?? 100) - 5
                                        ),
                                      })
                                    }
                                    className={`w-[36px] h-[26px] rounded border flex items-center justify-center text-sm font-medium transition-colors cursor-pointer ${
                                      isDark
                                        ? 'border-[#2a364b] bg-[#121722] hover:bg-[#1a2232] text-neutral-200 hover:text-white'
                                        : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                                    }`}
                                  >
                                    &minus;
                                  </button>
                                  <button
                                    type="button"
                                    title={`Increase size (${currentExtras.scaleZoomPercent ?? 100}%)`}
                                    onClick={() =>
                                      updateTargetExtras({
                                        scaleZoomPercent: Math.min(
                                          250,
                                          (currentExtras.scaleZoomPercent ?? 100) + 5
                                        ),
                                      })
                                    }
                                    className={`w-[36px] h-[26px] rounded border flex items-center justify-center text-sm font-medium transition-colors cursor-pointer ${
                                      isDark
                                        ? 'border-[#2a364b] bg-[#121722] hover:bg-[#1a2232] text-neutral-200 hover:text-white'
                                        : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                                    }`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Position (4-way D-Pad) */}
                              <div className="space-y-1.5">
                                <label className={`block text-[12.5px] text-center ${isDark ? 'text-neutral-200' : 'text-slate-700'}`}>
                                  Position
                                </label>
                                <div className="grid grid-cols-3 gap-1 w-[110px] place-items-center">
                                  <div />
                                  <button
                                    type="button"
                                    title="Nudge Up"
                                    onClick={() =>
                                      updateTargetExtras({
                                        positionOffsetY: (currentExtras.positionOffsetY ?? 0) - 1,
                                      })
                                    }
                                    className={dpadBtnCls}
                                  >
                                    &#9650;
                                  </button>
                                  <div />

                                  <button
                                    type="button"
                                    title="Nudge Left"
                                    onClick={() =>
                                      updateTargetExtras({
                                        positionOffsetX: (currentExtras.positionOffsetX ?? 0) - 1,
                                      })
                                    }
                                    className={dpadBtnCls}
                                  >
                                    &#9664;
                                  </button>
                                  <div className="w-[34px] h-[25px]" />
                                  <button
                                    type="button"
                                    title="Nudge Right"
                                    onClick={() =>
                                      updateTargetExtras({
                                        positionOffsetX: (currentExtras.positionOffsetX ?? 0) + 1,
                                      })
                                    }
                                    className={dpadBtnCls}
                                  >
                                    &#9654;
                                  </button>

                                  <div />
                                  <button
                                    type="button"
                                    title="Nudge Down"
                                    onClick={() =>
                                      updateTargetExtras({
                                        positionOffsetY: (currentExtras.positionOffsetY ?? 0) + 1,
                                      })
                                    }
                                    className={dpadBtnCls}
                                  >
                                    &#9660;
                                  </button>
                                  <div />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 3. PROGRESS BAR */}
                    {activeStyleTab === 'progress_bar' && (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <h3 className={sectionHeadingCls}>PROGRESS BAR OPTIONS</h3>
                          <PrefCheckbox
                            isDark={isDark}
                            checked={
                              prefs.showProgressBar ??
                              prefs.sizesAndPositionsByTarget?.fullscreen_ndi_preview?.progress_bar
                                ?.visible ??
                              false
                            }
                            onChange={(val) => {
                              const allTargets =
                                prefs.sizesAndPositionsByTarget || createDefaultSizesAndPositions();
                              const nextTargets = { ...allTargets };
                              (
                                [
                                  'fullscreen_ndi_preview',
                                  'presenter_window',
                                  'multitimer',
                                  'web_display_lan',
                                ] as SizesPositionTargetTab[]
                              ).forEach((t) => {
                                nextTargets[t] = {
                                  ...DEFAULT_TARGET_ELEMENTS_CONFIG,
                                  ...(allTargets[t] || {}),
                                  progress_bar: {
                                    ...DEFAULT_TARGET_ELEMENTS_CONFIG.progress_bar,
                                    ...(allTargets[t]?.progress_bar || {}),
                                    visible: val,
                                  },
                                };
                              });
                              stagePreferences({
                                ...prefs,
                                showProgressBar: val,
                                sizesAndPositionsByTarget: nextTargets,
                              });
                            }}
                            label="Display countdown progress bar on stage and presenter screens"
                          />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 max-w-xl">
                            <div>
                              <label className="block text-[13px] mb-1.5">
                                Bar Thickness ({prefs.progressBarHeightPx ?? 12} px)
                              </label>
                              <input
                                type="range"
                                min={4}
                                max={32}
                                value={prefs.progressBarHeightPx ?? 12}
                                onChange={(e) =>
                                  updatePref('progressBarHeightPx', Number(e.target.value))
                                }
                                className="w-full accent-cyan-500 cursor-pointer"
                              />
                            </div>
                            <div>
                              <label className="block text-[13px] mb-1.5">Bar Placement</label>
                              <div className="relative">
                                <select
                                  value={prefs.progressBarPosition || 'bottom'}
                                  onChange={(e) => {
                                    const pos = e.target
                                      .value as AppPreferences['progressBarPosition'];
                                    const loc = pos === 'top' ? 'Top' : 'Bottom';
                                    const allTargets =
                                      prefs.sizesAndPositionsByTarget ||
                                      createDefaultSizesAndPositions();
                                    const nextTargets = { ...allTargets };
                                    (
                                      [
                                        'fullscreen_ndi_preview',
                                        'presenter_window',
                                        'multitimer',
                                        'web_display_lan',
                                      ] as SizesPositionTargetTab[]
                                    ).forEach((t) => {
                                      nextTargets[t] = {
                                        ...DEFAULT_TARGET_ELEMENTS_CONFIG,
                                        ...(allTargets[t] || {}),
                                        progress_bar: {
                                          ...DEFAULT_TARGET_ELEMENTS_CONFIG.progress_bar,
                                          ...(allTargets[t]?.progress_bar || {}),
                                          location: loc,
                                        },
                                      };
                                    });
                                    stagePreferences({
                                      ...prefs,
                                      progressBarPosition: pos,
                                      sizesAndPositionsByTarget: nextTargets,
                                    });
                                  }}
                                  className={`${selectCls} w-full`}
                                >
                                  <option value="bottom">Bottom of Display</option>
                                  <option value="top">Top of Display</option>
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. IMAGES (Per-List Independent Backgrounds + Logo + App Theme) */}
                    {activeStyleTab === 'images' && (
                      <div className="space-y-5">
                        {/* Hidden File Inputs */}
                        <input
                          ref={listBgImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            const targetListId = pendingListBgTargetIdRef.current;
                            e.target.value = '';
                            if (!file || !targetListId) return;
                            const dataUrl = await readAndOptimizeImageFile(file);
                            if (!dataUrl) return;
                            const nextListBgs = {
                              ...(prefs.listBackgroundImages || {}),
                              [targetListId]: {
                                dataUrl,
                                fileName: file.name,
                              },
                            };
                            const baseTargets =
                              prefs.sizesAndPositionsByTarget || createDefaultSizesAndPositions();
                            const nextTargets = { ...baseTargets };
                            (
                              [
                                'fullscreen_ndi_preview',
                                'presenter_window',
                                'multitimer',
                                'web_display_lan',
                              ] as SizesPositionTargetTab[]
                            ).forEach((t) => {
                              nextTargets[t] = {
                                ...(nextTargets[t] || DEFAULT_TARGET_ELEMENTS_CONFIG),
                                background: {
                                  ...(nextTargets[t]?.background ||
                                    DEFAULT_TARGET_ELEMENTS_CONFIG.background),
                                  visible: true,
                                },
                              };
                            });
                            const updated: AppPreferences = {
                              ...prefs,
                              backgroundImageDataUrl: '',
                              backgroundImageFileName: '',
                              listBackgroundImages: nextListBgs,
                              sizesAndPositionsByTarget: nextTargets,
                            };
                            stagePreferences(updated);
                          }}
                        />

                        <input
                          ref={listLogoImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            const targetListId = pendingListLogoTargetIdRef.current;
                            e.target.value = '';
                            if (!file || !targetListId) return;
                            const dataUrl = await readAndOptimizeImageFile(file, 1024);
                            if (!dataUrl) return;
                            const nextListLogos = {
                              ...(prefs.listLogoImages || {}),
                              [targetListId]: {
                                dataUrl,
                                fileName: file.name,
                              },
                            };
                            const baseTargets =
                              prefs.sizesAndPositionsByTarget || createDefaultSizesAndPositions();
                            const nextTargets = { ...baseTargets };
                            (
                              [
                                'fullscreen_ndi_preview',
                                'presenter_window',
                                'multitimer',
                                'web_display_lan',
                              ] as SizesPositionTargetTab[]
                            ).forEach((t) => {
                              nextTargets[t] = {
                                ...(nextTargets[t] || DEFAULT_TARGET_ELEMENTS_CONFIG),
                                logo: {
                                  ...(nextTargets[t]?.logo ||
                                    DEFAULT_TARGET_ELEMENTS_CONFIG.logo),
                                  visible: true,
                                },
                              };
                            });
                            const updated: AppPreferences = {
                              ...prefs,
                              logoImageDataUrl: '',
                              logoImageFileName: '',
                              listLogoImages: nextListLogos,
                              sizesAndPositionsByTarget: nextTargets,
                            };
                            stagePreferences(updated);
                          }}
                        />

                        {/* 1. INDEPENDENT BACKGROUND IMAGE PER LIST */}
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className={sectionHeadingCls}>
                                BACKGROUND IMAGE PER LIST
                              </h4>
                              <span
                                className={`text-[11px] ${
                                  isDark ? 'text-neutral-400' : 'text-slate-500'
                                }`}
                              >
                                Independent background for each Cue List (black when none)
                              </span>
                            </div>

                            <div
                              className={`rounded border divide-y ${
                                isDark
                                  ? 'border-[#1f293a] divide-[#1a2232] bg-[#0e131d]/70'
                                  : 'border-slate-200 divide-slate-200 bg-slate-50/70'
                              }`}
                            >
                              {availableLists.map((list, idx) => {
                                const listBgEntry = prefs.listBackgroundImages?.[list.id];
                                const hasListImage = Boolean(
                                  listBgEntry && listBgEntry.dataUrl && listBgEntry.dataUrl.trim()
                                );
                                const isCurrentActiveList = list.id === currentActiveListId;

                                return (
                                  <div
                                    key={list.id}
                                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                                  >
                                    {/* List Name & Active Indicator */}
                                    <div className="flex items-center gap-2 min-w-[180px]">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                                          isDark
                                            ? 'bg-[#182132] text-neutral-300'
                                            : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        List {idx + 1}
                                      </span>
                                      <span
                                        className={`text-[13px] font-medium truncate max-w-[210px] ${
                                          isDark ? 'text-neutral-100' : 'text-slate-800'
                                        }`}
                                      >
                                        {list.name}
                                      </span>
                                      {isCurrentActiveList && (
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                            isDark
                                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                              : 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                          }`}
                                        >
                                          Active
                                        </span>
                                      )}
                                    </div>

                                    {/* File Status + Choose File + Preview + Remove */}
                                    <div className="flex items-center gap-3">
                                      <span
                                        className={`text-[13px] italic truncate max-w-[170px] ${
                                          hasListImage
                                            ? isDark
                                              ? 'text-cyan-300 not-italic'
                                              : 'text-cyan-700 not-italic'
                                            : isDark
                                            ? 'text-neutral-400'
                                            : 'text-slate-500'
                                        }`}
                                        title={hasListImage ? listBgEntry?.fileName : '(none)'}
                                      >
                                        {hasListImage ? listBgEntry?.fileName : '(none)'}
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          pendingListBgTargetIdRef.current = list.id;
                                          listBgImageInputRef.current?.click();
                                        }}
                                        className={`px-3 py-1 rounded text-[12.5px] font-normal border transition-colors cursor-pointer ${
                                          isDark
                                            ? 'bg-[#121722] hover:bg-[#192130] border-[#2a364b] text-neutral-100'
                                            : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-2xs'
                                        }`}
                                      >
                                        Choose file...
                                      </button>

                                      {hasListImage && listBgEntry && (
                                        <>
                                          <img
                                            src={listBgEntry.dataUrl}
                                            alt={`${list.name} background`}
                                            className={`h-7 w-12 object-cover rounded border ${
                                              isDark ? 'border-[#2a364b]' : 'border-slate-300'
                                            }`}
                                          />
                                          <button
                                            type="button"
                                            title={`Remove background image for ${list.name} (revert to black)`}
                                            onClick={() => {
                                              const nextListBgs = {
                                                ...(prefs.listBackgroundImages || {}),
                                              };
                                              delete nextListBgs[list.id];
                                              const updated: AppPreferences = {
                                                ...prefs,
                                                listBackgroundImages: nextListBgs,
                                              };
                                              stagePreferences(updated);
                                            }}
                                            className={`p-1 rounded transition-colors cursor-pointer ${
                                              isDark
                                                ? 'text-neutral-400 hover:text-red-400 hover:bg-red-950/30'
                                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                            }`}
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Horizontal Divider */}
                        <div
                          className={`border-t ${
                            isDark ? 'border-[#1e2636]' : 'border-slate-200'
                          }`}
                        />

                        {/* 2. INDEPENDENT LOGO IMAGE PER LIST */}
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className={sectionHeadingCls}>
                                LOGO IMAGE PER LIST
                              </h4>
                              <span
                                className={`text-[11px] ${
                                  isDark ? 'text-neutral-400' : 'text-slate-500'
                                }`}
                              >
                                Independent logo for each Cue List (none when empty)
                              </span>
                            </div>

                            <div
                              className={`rounded border divide-y ${
                                isDark
                                  ? 'border-[#1f293a] divide-[#1a2232] bg-[#0e131d]/70'
                                  : 'border-slate-200 divide-slate-200 bg-slate-50/70'
                              }`}
                            >
                              {availableLists.map((list, idx) => {
                                const listLogoEntry = prefs.listLogoImages?.[list.id];
                                const hasListLogo = Boolean(
                                  listLogoEntry &&
                                    listLogoEntry.dataUrl &&
                                    listLogoEntry.dataUrl.trim()
                                );
                                const isCurrentActiveList = list.id === currentActiveListId;

                                return (
                                  <div
                                    key={list.id}
                                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                                  >
                                    {/* List Name & Active Indicator */}
                                    <div className="flex items-center gap-2 min-w-[180px]">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                                          isDark
                                            ? 'bg-[#182132] text-neutral-300'
                                            : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        List {idx + 1}
                                      </span>
                                      <span
                                        className={`text-[13px] font-medium truncate max-w-[210px] ${
                                          isDark ? 'text-neutral-100' : 'text-slate-800'
                                        }`}
                                      >
                                        {list.name}
                                      </span>
                                      {isCurrentActiveList && (
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                            isDark
                                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                              : 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                          }`}
                                        >
                                          Active
                                        </span>
                                      )}
                                    </div>

                                    {/* File Status + Choose File + Preview + Remove */}
                                    <div className="flex items-center gap-3">
                                      <span
                                        className={`text-[13px] italic truncate max-w-[170px] ${
                                          hasListLogo
                                            ? isDark
                                              ? 'text-cyan-300 not-italic'
                                              : 'text-cyan-700 not-italic'
                                            : isDark
                                            ? 'text-neutral-400'
                                            : 'text-slate-500'
                                        }`}
                                        title={hasListLogo ? listLogoEntry?.fileName : '(none)'}
                                      >
                                        {hasListLogo ? listLogoEntry?.fileName : '(none)'}
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          pendingListLogoTargetIdRef.current = list.id;
                                          listLogoImageInputRef.current?.click();
                                        }}
                                        className={`px-3 py-1 rounded text-[12.5px] font-normal border transition-colors cursor-pointer ${
                                          isDark
                                            ? 'bg-[#121722] hover:bg-[#192130] border-[#2a364b] text-neutral-100'
                                            : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-2xs'
                                        }`}
                                      >
                                        Choose file...
                                      </button>

                                      {hasListLogo && listLogoEntry && (
                                        <>
                                          <img
                                            src={listLogoEntry.dataUrl}
                                            alt={`${list.name} logo`}
                                            className={`h-7 w-12 object-contain rounded border p-0.5 ${
                                              isDark
                                                ? 'border-[#2a364b] bg-[#0b0e14]'
                                                : 'border-slate-300 bg-slate-50'
                                            }`}
                                          />
                                          <button
                                            type="button"
                                            title={`Remove logo image for ${list.name}`}
                                            onClick={() => {
                                              const nextListLogos = {
                                                ...(prefs.listLogoImages || {}),
                                              };
                                              delete nextListLogos[list.id];
                                              const updated: AppPreferences = {
                                                ...prefs,
                                                listLogoImages: nextListLogos,
                                              };
                                              stagePreferences(updated);
                                            }}
                                            className={`p-1 rounded transition-colors cursor-pointer ${
                                              isDark
                                                ? 'text-neutral-400 hover:text-red-400 hover:bg-red-950/30'
                                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                            }`}
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 5. ALERTS (Audio removed, Visual Alerts & Thresholds maintained) */}
                    {activeStyleTab === 'alerts' && (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <h3 className={sectionHeadingCls}>VISUAL ALERT INDICATORS</h3>
                          <PrefCheckbox
                            isDark={isDark}
                            checked={prefs.flashAlertsEnabled ?? true}
                            onChange={(val) => updatePref('flashAlertsEnabled', val)}
                            label="Enable flashing visual warning indicator on displays"
                          />
                        </div>

                        <div className="space-y-3">
                          <h3 className={sectionHeadingCls}>DEFAULT ALERT THRESHOLDS</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-xl">
                            <div>
                              <label className="block text-[13px] text-amber-500 font-medium mb-1.5">
                                Default Warning Threshold (sec)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={prefs.defaultWarningSeconds}
                                onChange={(e) =>
                                  updatePref('defaultWarningSeconds', Number(e.target.value))
                                }
                                className={`${inputCls} font-mono`}
                              />
                            </div>
                            <div>
                              <label className="block text-[13px] text-red-500 font-medium mb-1.5">
                                Default Danger Threshold (sec)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={prefs.defaultDangerSeconds}
                                onChange={(e) =>
                                  updatePref('defaultDangerSeconds', Number(e.target.value))
                                }
                                className={`${inputCls} font-mono`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 6. COLORS & ANIMATIONS */}
                    {activeStyleTab === 'colors_animations' && (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <h3 className={sectionHeadingCls}>THEME & DISPLAY COLORS</h3>
                          <div className="flex items-center gap-4">
                            <span className="text-[13px]">Console Theme</span>
                            <div className="relative">
                              <select
                                value={prefs.theme || 'dark'}
                                onChange={(e) =>
                                  updatePref('theme', e.target.value as 'dark' | 'light')
                                }
                                className={selectCls}
                              >
                                <option value="dark">Dark Theme (Studio Pro)</option>
                                <option value="light">Light Theme (Daylight)</option>
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                            <div>
                              <label className="block text-[12px] opacity-75 mb-1">
                                Normal Digits
                              </label>
                              <input
                                type="color"
                                value={prefs.normalDigitsColor || '#ffffff'}
                                onChange={(e) => updatePref('normalDigitsColor', e.target.value)}
                                className="w-full h-8 rounded bg-transparent border border-neutral-600 cursor-pointer"
                              />
                            </div>
                            <div>
                              <label className="block text-[12px] opacity-75 mb-1">
                                Warning Alert
                              </label>
                              <input
                                type="color"
                                value={prefs.warningDigitsColor || '#eab308'}
                                onChange={(e) => updatePref('warningDigitsColor', e.target.value)}
                                className="w-full h-8 rounded bg-transparent border border-neutral-600 cursor-pointer"
                              />
                            </div>
                            <div>
                              <label className="block text-[12px] opacity-75 mb-1">
                                Danger Alert
                              </label>
                              <input
                                type="color"
                                value={prefs.dangerDigitsColor || '#ef4444'}
                                onChange={(e) => updatePref('dangerDigitsColor', e.target.value)}
                                className="w-full h-8 rounded bg-transparent border border-neutral-600 cursor-pointer"
                              />
                            </div>
                            <div>
                              <label className="block text-[12px] opacity-75 mb-1">
                                Overtime Digits
                              </label>
                              <input
                                type="color"
                                value={prefs.overtimeDigitsColor || '#ef4444'}
                                onChange={(e) => updatePref('overtimeDigitsColor', e.target.value)}
                                className="w-full h-8 rounded bg-transparent border border-neutral-600 cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <h3 className={sectionHeadingCls}>ANIMATIONS</h3>
                          <PrefCheckbox
                            isDark={isDark}
                            checked={prefs.smoothTransitions ?? true}
                            onChange={(val) => updatePref('smoothTransitions', val)}
                            label="Enable smooth color transitions between countdown states"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* =================================================================
                SIDEBAR SECTION: TIMER LIST (Exact match to reference screenshot)
               ================================================================= */}
            {activeSection === 'timer_list' && (
              <div className="flex-1 p-3 overflow-y-auto">
                <div className={`h-full border rounded-xs p-5 overflow-y-auto space-y-6 ${contentCardCls}`}>
                  {/* 1. DEFAULT NEW LIST SETTINGS */}
                  <div className="space-y-2.5">
                    <h3 className={sectionHeadingCls}>DEFAULT NEW LIST SETTINGS</h3>
                    <div className="flex flex-col space-y-2.5 pt-0.5">
                      <PrefCheckbox
                        isDark={isDark}
                        checked={Boolean(prefs.linkCueEdit)}
                        onChange={(val) => updatePref('linkCueEdit', val)}
                        label="Link cue edit"
                      />
                      <PrefCheckbox
                        isDark={isDark}
                        checked={Boolean(prefs.singleTimerMode)}
                        onChange={(val) => updatePref('singleTimerMode', val)}
                        label="Single timer mode"
                      />
                      <PrefCheckbox
                        isDark={isDark}
                        checked={Boolean(prefs.autoSchedule)}
                        onChange={(val) => updatePref('autoSchedule', val)}
                        label="Auto schedule"
                      />
                    </div>
                  </div>

                  {/* Horizontal Divider */}
                  <div className={`border-t ${isDark ? 'border-[#1e2636]' : 'border-slate-200'}`} />

                  {/* 2. DEFAULT NEW TIMER SETTINGS */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h3 className={sectionHeadingCls}>DEFAULT NEW TIMER SETTINGS</h3>
                      <p className={`text-[13px] ${isDark ? 'text-neutral-300' : 'text-slate-600'}`}>
                        These values are applied when a new timer is added to the Cue List.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-1">
                      {/* LEFT COLUMN: TIMER */}
                      <div className="space-y-3.5">
                        <h4 className={sectionHeadingCls}>TIMER</h4>

                        {/* Timer type */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[13px]">Timer type</span>
                          <div className="relative">
                            <select
                              value={prefs.defaultNewTimerType || 'countdown'}
                              onChange={(e) =>
                                updatePref(
                                  'defaultNewTimerType',
                                  e.target.value as AppPreferences['defaultNewTimerType']
                                )
                              }
                              className={`${selectCls} w-[160px]`}
                            >
                              <option value="countdown">Countdown</option>
                              <option value="count_up">Count up</option>
                              <option value="end_time">End time</option>
                              <option value="stopwatch">Stopwatch</option>
                              <option value="digital_clock">Clock</option>
                              <option value="empty">Empty</option>
                              <option value="spacer">Spacer</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        {/* End action */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[13px]">End action</span>
                          <div className="relative">
                            <select
                              value={prefs.defaultNewTimerEndAction || 'count_up'}
                              onChange={(e) =>
                                updatePref(
                                  'defaultNewTimerEndAction',
                                  e.target.value as AppPreferences['defaultNewTimerEndAction']
                                )
                              }
                              className={`${selectCls} w-[160px]`}
                            >
                              <option value="count_up">Overtime</option>
                              <option value="stop">Stop</option>
                              <option value="next_timer">Next</option>
                              <option value="loop">Loop</option>
                              <option value="none">None</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        {/* Duration */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[13px]">Duration</span>
                          <div className="flex items-center gap-2.5">
                            <PrefCheckbox
                              isDark={isDark}
                              checked={prefs.defaultDurationEnabled ?? true}
                              onChange={(val) => updatePref('defaultDurationEnabled', val)}
                            />
                            <TimeBoxInput
                              seconds={prefs.defaultDurationSeconds ?? 600}
                              mode="hhmmss"
                              disabled={prefs.defaultDurationEnabled === false}
                              isDark={isDark}
                              onChange={(sec) => updatePref('defaultDurationSeconds', sec)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* RIGHT COLUMN: ALERTS */}
                      <div className="space-y-3.5">
                        <h4 className={sectionHeadingCls}>ALERTS</h4>

                        {/* Alert 1 */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[13px]">Alert 1</span>
                          <div className="flex items-center gap-2.5">
                            <PrefCheckbox
                              isDark={isDark}
                              checked={prefs.defaultAlert1Enabled ?? true}
                              onChange={(val) => updatePref('defaultAlert1Enabled', val)}
                            />
                            <TimeBoxInput
                              seconds={prefs.defaultWarningSeconds ?? 90}
                              mode="mmss"
                              disabled={prefs.defaultAlert1Enabled === false}
                              isDark={isDark}
                              onChange={(sec) => updatePref('defaultWarningSeconds', sec)}
                            />
                          </div>
                        </div>

                        {/* Alert 2 */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[13px]">Alert 2</span>
                          <div className="flex items-center gap-2.5">
                            <PrefCheckbox
                              isDark={isDark}
                              checked={Boolean(prefs.defaultAlert2Enabled)}
                              onChange={(val) => updatePref('defaultAlert2Enabled', val)}
                            />
                            <TimeBoxInput
                              seconds={prefs.defaultDangerSeconds ?? 30}
                              mode="mmss"
                              disabled={!prefs.defaultAlert2Enabled}
                              isDark={isDark}
                              onChange={(sec) => updatePref('defaultDangerSeconds', sec)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =================================================================
                SIDEBAR SECTION: NDI (Merged Resolution, Framerate, Groups & NDI Broadcast Output)
               ================================================================= */}
            {activeSection === 'ndi' && (
              <div className="flex-1 p-3 overflow-y-auto">
                <div className={`h-full border rounded-xs p-5 overflow-y-auto space-y-6 ${contentCardCls}`}>
                  {/* 1. Resolution & Framerate */}
                  <div className="max-w-[390px] space-y-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[13px]">Resolution</span>
                      <div className="relative">
                        <select
                          value={prefs.ndiResolution || 'HD - 1920 x 1080'}
                          onChange={(e) => updatePref('ndiResolution', e.target.value)}
                          className={`${selectCls} w-[200px]`}
                        >
                          <option value="HD - 1920 x 1080">HD - 1920 x 1080</option>
                          <option value="HD - 1280 x 720">HD - 1280 x 720</option>
                          <option value="UHD - 3840 x 2160">UHD - 3840 x 2160</option>
                          <option value="SD - 720 x 576">SD - 720 x 576</option>
                          <option value="SD - 720 x 480">SD - 720 x 480</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[13px]">Framerate</span>
                      <div className="relative">
                        <select
                          value={String(prefs.ndiFrameRate || 30)}
                          onChange={(e) => {
                            const val = e.target.value;
                            const num = Number(val);
                            updatePref('ndiFrameRate', isNaN(num) ? val : num);
                          }}
                          className={`${selectCls} w-[200px]`}
                        >
                          <option value="30">30 FPS</option>
                          <option value="60">60 FPS</option>
                          <option value="59.94">59.94 FPS</option>
                          <option value="50">50 FPS</option>
                          <option value="29.97">29.97 FPS</option>
                          <option value="25">25 FPS</option>
                          <option value="24">24 FPS</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Horizontal Divider */}
                  <div className={`border-t ${isDark ? 'border-[#1e2636]' : 'border-slate-200'}`} />

                  {/* 2. GROUPS */}
                  <div className="space-y-3">
                    <h3 className={sectionHeadingCls}>GROUPS</h3>
                    <div className="flex flex-col space-y-3">
                      <PrefCheckbox
                        isDark={isDark}
                        checked={Boolean(prefs.ndiUseCustomGroups)}
                        onChange={(val) => updatePref('ndiUseCustomGroups', val)}
                        label="Use custom groups"
                      />

                      {prefs.ndiUseCustomGroups && (
                        <div className="max-w-xs pl-6">
                          <input
                            type="text"
                            placeholder="e.g. Public, Studio A"
                            value={prefs.ndiCustomGroups || ''}
                            onChange={(e) => updatePref('ndiCustomGroups', e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Horizontal Divider */}
                  <div className={`border-t ${isDark ? 'border-[#1e2636]' : 'border-slate-200'}`} />

                  {/* 3. NDI BROADCAST OUTPUT (Source Name & Alpha Channel) */}
                  <div className="space-y-3">
                    <h3 className={sectionHeadingCls}>NDI BROADCAST OUTPUT</h3>
                    <div className="max-w-[390px] space-y-4">
                      <div>
                        <label className="block text-[13px] mb-1.5">NDI Source Name</label>
                        <input
                          type="text"
                          value={prefs.ndiSourceName || 'ProTimer (Main Output)'}
                          onChange={(e) => updatePref('ndiSourceName', e.target.value)}
                          className={inputCls}
                        />
                      </div>

                      <PrefCheckbox
                        isDark={isDark}
                        checked={Boolean(prefs.ndiAlphaChannel)}
                        onChange={(val) => updatePref('ndiAlphaChannel', val)}
                        label="Enable transparent alpha channel for downstream keyers"
                      />
                    </div>
                  </div>

                  {/* Horizontal Divider */}
                  <div className={`border-t ${isDark ? 'border-[#1e2636]' : 'border-slate-200'}`} />

                  {/* 4. NDI NETWORK STREAM STATUS & CAPTURE ENDPOINTS */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className={sectionHeadingCls}>NDI NETWORK STREAM STATUS</h3>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase border ${
                            ndiStatus.active
                              ? isDark
                                ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300'
                                : 'bg-emerald-50 border-emerald-500 text-emerald-700'
                              : isDark
                              ? 'bg-[#121722] border-[#263246] text-neutral-400'
                              : 'bg-slate-100 border-slate-300 text-slate-600'
                          }`}
                        >
                          <Radio
                            className={`w-3 h-3 ${
                              ndiStatus.active ? 'text-emerald-400 animate-pulse' : 'opacity-60'
                            }`}
                          />
                          {ndiStatus.active
                            ? `ACTIVE (${ndiStatus.mode === 'multi' ? 'NDI MULTI' : 'NDI SINGLE'})`
                            : 'STANDBY'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (hasUnappliedChanges) {
                              handleApply();
                            }
                            ndiStreamService.toggleStream(ndiStatus.mode || 'single');
                          }}
                          className={`px-3 py-1 rounded text-[11px] font-bold tracking-wide transition-colors cursor-pointer ${
                            ndiStatus.active
                              ? 'bg-red-600 hover:bg-red-500 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          {ndiStatus.active ? 'Stop NDI Stream' : 'Start NDI Stream'}
                        </button>
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded border text-[12px] space-y-2.5 ${
                        isDark
                          ? 'bg-[#0b0f17] border-[#1e2636] text-neutral-300'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <span className="text-neutral-500 block">Source Name</span>
                          <span className="font-mono font-semibold">
                            {ndiStatus.active
                              ? ndiStatus.sourceName
                              : prefs.ndiSourceName || 'ProTimer (Main Output)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">Resolution & FPS</span>
                          <span className="font-mono font-semibold">
                            {ndiStatus.active
                              ? `${ndiStatus.width}x${ndiStatus.height} @ ${ndiStatus.frameRate}fps`
                              : `${prefs.ndiResolution || 'HD - 1920 x 1080'} @ ${prefs.ndiFrameRate || 30}fps`}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">Alpha Keyer</span>
                          <span className="font-mono font-semibold">
                            {(ndiStatus.active ? ndiStatus.alphaChannel : prefs.ndiAlphaChannel)
                              ? 'RGBA (Transparent)'
                              : 'Opaque Fill'}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">NDI Groups</span>
                          <span className="font-mono font-semibold">
                            {(ndiStatus.active ? ndiStatus.useCustomGroups : prefs.ndiUseCustomGroups)
                              ? (ndiStatus.active ? ndiStatus.customGroups : prefs.ndiCustomGroups) || 'Public'
                              : 'Public (Default)'}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`pt-2 border-t space-y-1.5 ${
                          isDark ? 'border-[#1a2232]' : 'border-slate-200'
                        }`}
                      >
                        <div className="text-[11px] text-neutral-400">
                          Click the <strong>NDI</strong> or <strong>NDI Multi</strong> button on the bottom bar (or the button above) to broadcast directly over the network without opening a popup display window. Capture on another computer using:
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 text-[11px] font-mono">
                          <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-black/25">
                            <span className="text-cyan-400 truncate">
                              MJPEG Video Stream:{' '}
                              {ndiStatus.ips && ndiStatus.ips.length > 0
                                ? `http://${ndiStatus.ips[0]}:${ndiStatus.port || 3000}/api/lan/ndi/mjpeg`
                                : `${typeof window !== 'undefined' ? window.location.origin : ''}/api/lan/ndi/mjpeg`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-black/25">
                            <span className="text-emerald-400 truncate">
                              Clean Alpha NDI Feed:{' '}
                              {ndiStatus.ips && ndiStatus.ips.length > 0
                                ? `http://${ndiStatus.ips[0]}:${ndiStatus.port || 3000}/?display=ndi`
                                : `${typeof window !== 'undefined' ? window.location.origin : ''}/?display=ndi`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =================================================================
                SIDEBAR SECTION: UPDATES
               ================================================================= */}
            {activeSection === 'updates' && (
              <div className="flex-1 p-3 overflow-y-auto">
                <div className={`h-full border rounded-xs p-5 space-y-6 ${contentCardCls}`}>
                  <div className="space-y-3">
                    <h3 className={sectionHeadingCls}>SOFTWARE VERSION & UPDATES</h3>
                    <p className="text-[13px]">
                      ProTimer Desktop{' '}
                      <span className={`font-mono font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        v1.0.0
                      </span>{' '}
                      (64-bit)
                    </p>
                    <PrefCheckbox
                      isDark={isDark}
                      checked={prefs.checkForUpdatesAutomatically ?? true}
                      onChange={(val) => updatePref('checkForUpdatesAutomatically', val)}
                      label="Check for ProTimer updates automatically on startup"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* =================================================================
                SHARED TAB FOOTER BAR WITH "APPLY" BUTTON (ALL PREFERENCES TABS)
               ================================================================= */}
            <div
              className={`px-4 py-2.5 border-t flex items-center justify-between gap-3 shrink-0 ${
                isDark ? 'bg-[#0b0e14] border-[#1b2333]' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {appliedFeedback ? (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                      isDark ? 'text-emerald-400' : 'text-emerald-700'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Changes applied</span>
                  </span>
                ) : hasUnappliedChanges ? (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                      isDark ? 'text-amber-400' : 'text-amber-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span className="truncate">Unapplied changes — click Apply to take effect</span>
                  </span>
                ) : (
                  <span
                    className={`text-[12px] truncate ${
                      isDark ? 'text-neutral-500' : 'text-slate-500'
                    }`}
                  >
                    All settings applied
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleApply}
                  className={`px-4 py-1.5 rounded text-[13px] font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    hasUnappliedChanges
                      ? isDark
                        ? 'bg-[#0078e7] hover:bg-[#1888f2] border-[#2b8cff] text-white shadow-sm'
                        : 'bg-cyan-600 hover:bg-cyan-700 border-cyan-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-[#152033] hover:bg-[#1c2b44] border-[#2b8cff]/60 text-[#4ea8ff] hover:text-white'
                      : 'bg-cyan-50 hover:bg-cyan-600 border-cyan-500 text-cyan-800 hover:text-white'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Apply</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
