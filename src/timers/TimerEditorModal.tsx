/**
 * Timer Configuration and Editing Modal.
 * Clean, broadcast-standard editor for ProTimer items.
 */

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  X,
  Check,
  Clock,
  LayoutTemplate,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  BookmarkPlus,
  Layers,
} from 'lucide-react';
import { TimerItem, TimerType, EndAction, TimerAlert } from '../types';
import { useTheme } from '../hooks';
import {
  listTemplatesService,
  ListTemplate,
  ListTemplateCategory,
  TEMPLATE_CATEGORIES,
  TemplateLoadMode,
  formatCueMMSS,
  formatTemplateDuration,
  getTemplateTotalSeconds,
} from '../services/listTemplatesService';

const subscribeTemplates = (listener: () => void) => listTemplatesService.subscribe(listener);
const getTemplatesSnapshot = () => listTemplatesService.getAllTemplates();

interface TimerEditorModalProps {
  isOpen: boolean;
  timer: TimerItem | null;
  activeListName?: string;
  onClose: () => void;
  onSave: (timerData: Partial<TimerItem>) => void;
  onLoadTemplate?: (template: ListTemplate, mode: TemplateLoadMode) => void;
  onSaveCurrentListAsTemplate?: () => void;
}

const PRESET_COLORS = [
  '#22c55e', // Green
  '#eab308', // Yellow
  '#f97316', // Orange
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#ffffff', // White
];

const CUE_ROW_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Cyan', value: '#00d2ff' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Emerald', value: '#00c853' },
  { label: 'Amber', value: '#ffb300' },
  { label: 'Orange', value: '#ff6d00' },
  { label: 'Red', value: '#ff2a2a' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Pink', value: '#f50076' },
  { label: 'Brown', value: '#a04916' },
  { label: 'Ash', value: '#7c8b9e' },
];

export const TimerEditorModal: React.FC<TimerEditorModalProps> = ({
  isOpen,
  timer,
  activeListName = 'Current Tab',
  onClose,
  onSave,
  onLoadTemplate,
  onSaveCurrentListAsTemplate,
}) => {
  const templates = useSyncExternalStore(
    subscribeTemplates,
    getTemplatesSnapshot,
    getTemplatesSnapshot
  );
  const [modalView, setModalView] = useState<'single' | 'templates'>('single');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState<'all' | ListTemplateCategory>('all');
  const [templateLoadMode, setTemplateLoadMode] = useState<TemplateLoadMode>('new_tab');
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [colorTag, setColorTag] = useState<string>('');
  const [type, setType] = useState<TimerType>('countdown');
  const [startTime, setStartTime] = useState('');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(10);
  const [seconds, setSeconds] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [endAction, setEndAction] = useState<EndAction>('stop');
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [autoStart, setAutoStart] = useState(false);

  // Alert 1
  const [alert1Enabled, setAlert1Enabled] = useState(true);
  const [alert1Mins, setAlert1Mins] = useState(5);
  const [alert1Secs, setAlert1Secs] = useState(0);
  const [alert1Color, setAlert1Color] = useState('#eab308');
  const [alert1Flash, setAlert1Flash] = useState(false);
  const [alert1OnOff, setAlert1OnOff] = useState(false);

  // Alert 2
  const [alert2Enabled, setAlert2Enabled] = useState(true);
  const [alert2Mins, setAlert2Mins] = useState(1);
  const [alert2Secs, setAlert2Secs] = useState(0);
  const [alert2Color, setAlert2Color] = useState('#ef4444');
  const [alert2Flash, setAlert2Flash] = useState(false);
  const [alert2OnOff, setAlert2OnOff] = useState(true);

  useEffect(() => {
    if (timer) {
      setName(timer.name);
      setColorTag(timer.colorTag || '');
      setType(timer.type === 'empty' || timer.type === 'spacer' ? 'countdown' : timer.type);
      setStartTime(timer.startTime || '');
      setSpeed(timer.speed || 100);
      setEndAction(timer.type === 'empty' && timer.endAction === 'none' ? 'count_up' : (timer.endAction || 'stop'));
      setScheduledStartTime(timer.scheduledStartTime || '');
      setAutoStart(timer.autoStart || false);

      const totalSec = timer.durationSeconds || 0;
      setHours(Math.floor(totalSec / 3600));
      setMinutes(Math.floor((totalSec % 3600) / 60));
      setSeconds(totalSec % 60);

      if (timer.alert1) {
        setAlert1Enabled(true);
        setAlert1Mins(Math.floor(timer.alert1.timeSeconds / 60));
        setAlert1Secs(timer.alert1.timeSeconds % 60);
        setAlert1Color(timer.alert1.color || '#eab308');
        const a1OnOff = timer.alert1.onOff ?? false;
        const a1Flash = a1OnOff ? false : (timer.alert1.flash || false);
        setAlert1Flash(a1Flash);
        setAlert1OnOff(a1OnOff);
      } else {
        setAlert1Enabled(false);
      }

      if (timer.alert2) {
        setAlert2Enabled(true);
        setAlert2Mins(Math.floor(timer.alert2.timeSeconds / 60));
        setAlert2Secs(timer.alert2.timeSeconds % 60);
        setAlert2Color(timer.alert2.color || '#ef4444');
        const a2OnOff = timer.alert2.onOff ?? false;
        const a2Flash = a2OnOff ? false : (timer.alert2.flash ?? true);
        setAlert2Flash(a2Flash);
        setAlert2OnOff(a2OnOff);
      } else {
        setAlert2Enabled(false);
      }
    } else {
      setName('');
      setColorTag('');
      setType('countdown');
      setStartTime('');
      setScheduledStartTime('');
      setAutoStart(false);
      setHours(0);
      setMinutes(10);
      setSeconds(0);
      setSpeed(100);
      setEndAction('count_up');
      setAlert1Enabled(true);
      setAlert1Mins(5);
      setAlert1Secs(0);
      setAlert1Color('#eab308');
      setAlert1Flash(false);
      setAlert1OnOff(false);

      setAlert2Enabled(true);
      setAlert2Mins(1);
      setAlert2Secs(0);
      setAlert2Color('#ef4444');
      setAlert2Flash(true);
      setAlert2OnOff(false);
    }
    if (timer) {
      setModalView('single');
    }
    if (!isOpen) {
      setModalView('single');
      setTemplateSearch('');
      setTemplateCategory('all');
      setExpandedTemplateId(null);
    }
  }, [timer, isOpen]);

  const { isDark } = useTheme();

  const customTemplateCount = useMemo(
    () => templates.filter((t) => !t.isBuiltIn).length,
    [templates]
  );

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (templateCategory === 'custom') {
        if (tpl.isBuiltIn) return false;
      } else if (templateCategory !== 'all' && tpl.category !== templateCategory) {
        return false;
      }
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.category.toLowerCase().includes(q) ||
        tpl.cues.some((c) => c.name.toLowerCase().includes(q))
      );
    });
  }, [templates, templateCategory, templateSearch]);

  if (!isOpen) return null;

  const canBrowseTemplates = !timer && Boolean(onLoadTemplate);
  const isTemplatesView = canBrowseTemplates && modalView === 'templates';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const totalDurationSeconds = Math.max(0, hours * 3600 + minutes * 60 + seconds);

    let a1: TimerAlert | undefined = undefined;
    if (alert1Enabled) {
      a1 = {
        id: timer?.alert1?.id || 'alert1',
        timeSeconds: alert1Mins * 60 + alert1Secs,
        color: alert1Color,
        flash: alert1Flash,
        onOff: alert1OnOff,
        soundEnabled: false,
      };
    }

    let a2: TimerAlert | undefined = undefined;
    if (alert2Enabled) {
      a2 = {
        id: timer?.alert2?.id || 'alert2',
        timeSeconds: alert2Mins * 60 + alert2Secs,
        color: alert2Color,
        flash: alert2Flash,
        onOff: alert2OnOff,
        soundEnabled: false,
      };
    }

    onSave({
      name: name.trim() || 'Untitled Cue',
      colorTag: colorTag || undefined,
      type,
      startTime: startTime || undefined,
      scheduledStartTime: scheduledStartTime.trim() || undefined,
      autoStart: autoStart && !!scheduledStartTime.trim(),
      durationSeconds: totalDurationSeconds,
      speed,
      endAction,
      alert1: a1,
      alert2: a2,
    });

    onClose();
  };

  const addPresetMinutes = (extraMinutes: number) => {
    const curTotalSec = hours * 3600 + minutes * 60 + seconds;
    const newTotalSec = curTotalSec + extraMinutes * 60;
    setHours(Math.floor(newTotalSec / 3600));
    setMinutes(Math.floor((newTotalSec % 3600) / 60));
    setSeconds(newTotalSec % 60);
  };

  const inputBgCls = 'glass-input focus:border-cyan-400';
  const sectionBoxCls = 'glass-subcard rounded-2xl';
  const subInputCls = 'glass-input focus:border-cyan-400';
  const labelCls = isDark
    ? 'text-[10px] font-semibold uppercase tracking-wider text-neutral-400'
    : 'text-[10px] font-semibold uppercase tracking-wider text-slate-500';

  const getCategoryLabel = (cat: ListTemplateCategory) =>
    TEMPLATE_CATEGORIES.find((c) => c.id === cat)?.label || cat;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`glass-card rounded-[28px] w-full ${
          isTemplatesView ? 'max-w-[680px]' : 'max-w-[490px]'
        } max-h-[88vh] flex flex-col overflow-hidden transition-all duration-150 ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div
          className={`flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0 ${
            isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-slate-200 bg-white/40'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isTemplatesView ? (
              <LayoutTemplate className="w-4 h-4 text-cyan-400 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <h2
              className={`text-sm font-semibold tracking-wide truncate ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {timer ? 'Edit Timer' : isTemplatesView ? 'Load List Template' : 'New Timer'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canBrowseTemplates && (
              <div className="glass-subcard flex items-center gap-0.5 p-0.5 rounded-full text-[11px]">
                <button
                  type="button"
                  onClick={() => setModalView('single')}
                  className={`px-3 py-1 rounded-full font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    modalView === 'single'
                      ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                      : isDark
                      ? 'text-neutral-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Single Timer
                </button>
                <button
                  type="button"
                  onClick={() => setModalView('templates')}
                  className={`px-3 py-1 rounded-full font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    modalView === 'templates'
                      ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                      : isDark
                      ? 'text-neutral-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutTemplate className="w-3 h-3" />
                  <span>Templates ({templates.length})</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* BODY: TEMPLATES GALLERY OR SINGLE TIMER EDITOR */}
        {isTemplatesView ? (
          <>
            {/* Search, Category Filters & Load Mode Bar */}
            <div
              className={`px-5 py-3 border-b space-y-2.5 shrink-0 ${
                isDark ? 'border-white/[0.07]' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates or cues (Sunday Service, Sports, Conference)..."
                    className="glass-input w-full pl-8 pr-7 py-1.5 rounded-full text-xs focus:outline-hidden focus:border-cyan-400"
                  />
                  {templateSearch && (
                    <button
                      type="button"
                      onClick={() => setTemplateSearch('')}
                      aria-label="Clear template search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {onSaveCurrentListAsTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSaveCurrentListAsTemplate();
                    }}
                    className="glass-btn glass-btn-subtle px-3 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    title={`Save "${activeListName}" as a reusable template`}
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Save Current Tab</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Category filter buttons */}
                <div className="flex items-center gap-1 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setTemplateCategory('all')}
                    className={`glass-btn px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      templateCategory === 'all' ? 'glass-btn-cyan-active' : 'glass-btn-subtle'
                    }`}
                  >
                    All
                  </button>
                  {TEMPLATE_CATEGORIES.map((cat) => {
                    const countLabel =
                      cat.id === 'custom' && customTemplateCount > 0
                        ? ` (${customTemplateCount})`
                        : '';
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setTemplateCategory(cat.id)}
                        className={`glass-btn px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                          templateCategory === cat.id
                            ? 'glass-btn-cyan-active'
                            : 'glass-btn-subtle'
                        }`}
                      >
                        {cat.label}
                        {countLabel}
                      </button>
                    );
                  })}
                </div>

                {/* Load Destination Segmented Control */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                    Load into:
                  </span>
                  <div className="glass-subcard flex items-center gap-0.5 p-0.5 rounded-full text-[10.5px]">
                    <button
                      type="button"
                      onClick={() => setTemplateLoadMode('new_tab')}
                      className={`px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                        templateLoadMode === 'new_tab'
                          ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                          : isDark
                          ? 'text-neutral-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      New Tab
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateLoadMode('append')}
                      title={`Append template cues to "${activeListName}"`}
                      className={`px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                        templateLoadMode === 'append'
                          ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                          : isDark
                          ? 'text-neutral-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Append
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateLoadMode('replace')}
                      title={`Replace cues in "${activeListName}" with this template`}
                      className={`px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                        templateLoadMode === 'replace'
                          ? 'glass-btn glass-btn-amber-active glass-btn-subtle'
                          : isDark
                          ? 'text-neutral-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Replace
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Templates List */}
            <div className="flex-1 overflow-y-auto px-5 py-3.5 space-y-2.5">
              {filteredTemplates.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className={`text-sm font-medium ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                    {templateCategory === 'custom' && customTemplateCount === 0
                      ? 'No saved custom templates yet.'
                      : 'No templates match your filter.'}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
                    {templateCategory === 'custom' && customTemplateCount === 0
                      ? 'Right-click any list tab at the bottom bar and choose "Save Tab as Template..." to create one.'
                      : 'Try clearing your search or selecting another category.'}
                  </p>
                </div>
              ) : (
                filteredTemplates.map((tpl) => {
                  const totalSec = getTemplateTotalSeconds(tpl);
                  const isExpanded = expandedTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      className={`rounded-2xl border transition-colors ${
                        isDark
                          ? 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05]'
                          : 'bg-white/60 border-slate-200/90 hover:bg-white/80'
                      }`}
                    >
                      <div className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {tpl.color && (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: tpl.color }}
                              />
                            )}
                            <h3 className="text-sm font-semibold truncate">{tpl.name}</h3>
                          </div>

                          {/* Clean unboxed metadata */}
                          <div
                            className={`flex items-center gap-1.5 text-[11px] flex-wrap ${
                              isDark ? 'text-neutral-400' : 'text-slate-500'
                            }`}
                          >
                            <span>{tpl.isBuiltIn ? getCategoryLabel(tpl.category) : 'Saved Template'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {tpl.cues.length} cue{tpl.cues.length === 1 ? '' : 's'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatTemplateDuration(totalSec)} total
                            </span>
                          </div>

                          <p
                            className={`text-xs leading-relaxed ${
                              isDark ? 'text-neutral-400' : 'text-slate-600'
                            }`}
                          >
                            {tpl.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTemplateId(isExpanded ? null : tpl.id)
                            }
                            className="glass-btn glass-btn-subtle px-2.5 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            title="Preview all cues in this template"
                          >
                            <span>{isExpanded ? 'Hide' : 'Cues'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>

                          {!tpl.isBuiltIn && (
                            <button
                              type="button"
                              onClick={() => listTemplatesService.deleteCustomTemplate(tpl.id)}
                              className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-red-400 cursor-pointer"
                              title="Delete saved template"
                              aria-label={`Delete ${tpl.name} template`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              onLoadTemplate?.(tpl, templateLoadMode);
                              onClose();
                            }}
                            className="glass-btn glass-btn-cyan-active px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>Load</span>
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          className={`px-4 pb-3 pt-2 border-t ${
                            isDark ? 'border-white/[0.06]' : 'border-slate-200/70'
                          }`}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                            {tpl.cues.map((cue, idx) => (
                              <div
                                key={`${tpl.id}-cue-${idx}`}
                                className="flex items-center justify-between gap-2 py-1 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono tabular-nums text-[10px] opacity-50 w-4 shrink-0">
                                    {idx + 1}.
                                  </span>
                                  <span className="truncate">{cue.name}</span>
                                </div>
                                <span
                                  className={`font-mono tabular-nums text-[11px] shrink-0 ${
                                    isDark ? 'text-cyan-300' : 'text-cyan-700'
                                  }`}
                                >
                                  {formatCueMMSS(cue.durationSeconds)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Templates Footer */}
            <div
              className={`flex items-center justify-between gap-3 px-5 py-3 border-t shrink-0 text-xs ${
                isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-slate-200 bg-white/40'
              }`}
            >
              <span className={isDark ? 'text-neutral-400' : 'text-slate-500'}>
                {templateLoadMode === 'new_tab'
                  ? 'Loads all cues at once into a new list tab.'
                  : templateLoadMode === 'append'
                  ? `Appends all template cues to "${activeListName}".`
                  : `Replaces all cues in "${activeListName}".`}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="glass-btn glass-btn-subtle px-4 py-1.5 text-xs font-medium rounded-full cursor-pointer"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
        {/* Compact Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {/* 1. Timer Name & Cue Color */}
          <div className="space-y-2">
            <div>
              <label className={`block mb-1 ${labelCls}`}>Timer Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Keynote Presentation, Worship Set, Q&A"
                className={`w-full px-2.5 py-1.5 border rounded-md text-xs focus:outline-none ${inputBgCls}`}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className={labelCls}>Cue Color Tag</span>
              <div className="flex items-center gap-1.5">
                {CUE_ROW_COLORS.map((swatch) => {
                  const isSelected = colorTag === swatch.value;
                  if (!swatch.value) {
                    return (
                      <button
                        key="none"
                        type="button"
                        title="Default (No custom color)"
                        onClick={() => setColorTag('')}
                        className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                          isSelected
                            ? isDark
                              ? 'bg-[#1a2436] border-cyan-400 text-cyan-300 font-semibold'
                              : 'bg-cyan-50 border-cyan-600 text-cyan-800 font-semibold'
                            : isDark
                            ? 'bg-[#0a0d14] border-[#1e2a3c] text-neutral-400 hover:text-white'
                            : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        None
                      </button>
                    );
                  }
                  return (
                    <button
                      key={swatch.value}
                      type="button"
                      title={swatch.label}
                      onClick={() => setColorTag(swatch.value)}
                      className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                        isSelected
                          ? 'border-white scale-115 ring-2 ring-cyan-400'
                          : 'border-black/20 opacity-85 hover:opacity-100 hover:scale-110'
                      }`}
                      style={{ backgroundColor: swatch.value }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Timer Type & End Action */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={`block mb-1 ${labelCls}`}>Timer Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TimerType)}
                className={`w-full px-2.5 py-1.5 border rounded-md text-xs focus:outline-none ${inputBgCls}`}
              >
                <option value="countdown">Countdown</option>
                <option value="count_up">Count Up</option>
                <option value="stopwatch">Stopwatch</option>
                <option value="digital_clock">Digital Clock (Time of Day)</option>
                <option value="meeting_timer">Meeting Timer</option>
              </select>
            </div>

            <div>
              <label className={`block mb-1 ${labelCls}`}>End Action (On Zero)</label>
              <select
                value={endAction}
                onChange={(e) => setEndAction(e.target.value as EndAction)}
                className={`w-full px-2.5 py-1.5 border rounded-md text-xs focus:outline-none ${inputBgCls}`}
              >
                <option value="count_up">Overtime</option>
                <option value="stop">Stop Timer</option>
                <option value="next_timer">Start Next Cue Automatically</option>
                <option value="blackout">Blank Display Screen</option>
                <option value="loop">Loop (Restart)</option>
              </select>
            </div>
          </div>

          {/* 3. Scheduled Wall-Clock Start Automation */}
          <div className={`border rounded-md p-2.5 space-y-1.5 ${sectionBoxCls}`}>
            <div className="flex items-center justify-between">
              <span className={labelCls}>Timer Automation (Scheduled Start)</span>
              <span className="text-[10px] text-cyan-400 font-mono">24h (HH:MM:SS)</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="time"
                step="1"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
                placeholder="e.g. 10:30:00"
                className={`px-2.5 py-1 border rounded font-mono text-xs focus:outline-none ${subInputCls}`}
              />
              <label
                className={`flex items-center gap-1.5 cursor-pointer text-[11px] ${
                  isDark ? 'text-neutral-300' : 'text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-cyan-500 focus:ring-0 bg-[#161c28] border-neutral-700"
                />
                <span>Auto-start at scheduled time</span>
              </label>
            </div>
          </div>

          {/* 4. Target Duration Configuration */}
          <div className={`border rounded-md p-2.5 space-y-2 ${sectionBoxCls}`}>
            <div className="flex items-center justify-between gap-2">
              <label className={labelCls}>Target Duration (HH : MM : SS)</label>
              <div className="flex items-center gap-1">
                {[1, 5, 10, 15, 30].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => addPresetMinutes(mins)}
                    className="glass-btn glass-btn-cyan glass-btn-subtle px-2 py-0.5 text-[10px] font-mono rounded-full cursor-pointer"
                  >
                    +{mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="block text-[9px] text-neutral-500 font-mono mb-0.5">HOURS</span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className={`w-full px-2 py-1 border rounded font-mono text-center text-sm font-bold focus:outline-none ${subInputCls}`}
                />
              </div>
              <div>
                <span className="block text-[9px] text-neutral-500 font-mono mb-0.5">MINUTES</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))
                  }
                  className={`w-full px-2 py-1 border rounded font-mono text-center text-sm font-bold focus:outline-none ${subInputCls}`}
                />
              </div>
              <div>
                <span className="block text-[9px] text-neutral-500 font-mono mb-0.5">SECONDS</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(e) =>
                    setSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))
                  }
                  className={`w-full px-2 py-1 border rounded font-mono text-center text-sm font-bold focus:outline-none ${subInputCls}`}
                />
              </div>
            </div>
          </div>

          {/* 5. Alerts Configuration */}
          <div className="space-y-2">
            <h3 className={labelCls}>Alerts & Warnings</h3>

            {/* Alert 1 (Warning) */}
            <div className={`border rounded-md p-2.5 space-y-2 ${sectionBoxCls}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alert1Enabled}
                    onChange={(e) => setAlert1Enabled(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-cyan-500 focus:ring-0 bg-[#161c28] border-neutral-700"
                  />
                  <span
                    className={`text-xs font-semibold flex items-center gap-1.5 ${
                      isDark ? 'text-white' : 'text-slate-800'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: alert1Color }}
                    />
                    Alert 1 (Warning Threshold)
                  </span>
                </label>

                {alert1Enabled && (
                  <div className="flex items-center gap-3">
                    <label
                      className={`flex items-center gap-1 text-[11px] cursor-pointer ${
                        isDark ? 'text-neutral-300' : 'text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={alert1Flash}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAlert1Flash(checked);
                          if (checked) setAlert1OnOff(false);
                        }}
                        className="w-3 h-3 rounded bg-[#161c28]"
                      />
                      Flash
                    </label>
                    <label
                      className={`flex items-center gap-1 text-[11px] cursor-pointer ${
                        isDark ? 'text-neutral-300' : 'text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={alert1OnOff}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAlert1OnOff(checked);
                          if (checked) setAlert1Flash(false);
                        }}
                        className="w-3 h-3 rounded bg-[#161c28]"
                      />
                      On/Off
                    </label>
                  </div>
                )}
              </div>

              {alert1Enabled && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-400 font-mono">MM:SS</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={alert1Mins}
                      onChange={(e) => setAlert1Mins(Math.max(0, parseInt(e.target.value) || 0))}
                      className={`w-14 px-1.5 py-0.5 border rounded font-mono text-center text-xs ${subInputCls}`}
                    />
                    <span className="text-neutral-500 font-mono text-xs">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={alert1Secs}
                      onChange={(e) =>
                        setAlert1Secs(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))
                      }
                      className={`w-14 px-1.5 py-0.5 border rounded font-mono text-center text-xs ${subInputCls}`}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAlert1Color(c)}
                        className={`w-4 h-4 rounded-full border cursor-pointer ${
                          alert1Color === c
                            ? 'border-white scale-110 shadow-sm'
                            : 'border-transparent opacity-80'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Alert 2 (Danger) */}
            <div className={`border rounded-md p-2.5 space-y-2 ${sectionBoxCls}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alert2Enabled}
                    onChange={(e) => setAlert2Enabled(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-cyan-500 focus:ring-0 bg-[#161c28] border-neutral-700"
                  />
                  <span
                    className={`text-xs font-semibold flex items-center gap-1.5 ${
                      isDark ? 'text-white' : 'text-slate-800'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: alert2Color }}
                    />
                    Alert 2 (Danger Threshold)
                  </span>
                </label>

                {alert2Enabled && (
                  <div className="flex items-center gap-3">
                    <label
                      className={`flex items-center gap-1 text-[11px] cursor-pointer ${
                        isDark ? 'text-neutral-300' : 'text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={alert2Flash}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAlert2Flash(checked);
                          if (checked) setAlert2OnOff(false);
                        }}
                        className="w-3 h-3 rounded bg-[#161c28]"
                      />
                      Flash
                    </label>
                    <label
                      className={`flex items-center gap-1 text-[11px] cursor-pointer ${
                        isDark ? 'text-neutral-300' : 'text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={alert2OnOff}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAlert2OnOff(checked);
                          if (checked) setAlert2Flash(false);
                        }}
                        className="w-3 h-3 rounded bg-[#161c28]"
                      />
                      On/Off
                    </label>
                  </div>
                )}
              </div>

              {alert2Enabled && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-400 font-mono">MM:SS</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={alert2Mins}
                      onChange={(e) => setAlert2Mins(Math.max(0, parseInt(e.target.value) || 0))}
                      className={`w-14 px-1.5 py-0.5 border rounded font-mono text-center text-xs ${subInputCls}`}
                    />
                    <span className="text-neutral-500 font-mono text-xs">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={alert2Secs}
                      onChange={(e) =>
                        setAlert2Secs(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))
                      }
                      className={`w-14 px-1.5 py-0.5 border rounded font-mono text-center text-xs ${subInputCls}`}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAlert2Color(c)}
                        className={`w-4 h-4 rounded-full border cursor-pointer ${
                          alert2Color === c
                            ? 'border-white scale-110 shadow-sm'
                            : 'border-transparent opacity-80'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Compact Footer Actions */}
        <div
          className={`flex items-center justify-end gap-2.5 px-5 py-3 border-t shrink-0 ${
            isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-slate-200 bg-white/40'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="glass-btn glass-btn-subtle px-4 py-1.5 text-xs font-medium rounded-full cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="glass-btn glass-btn-cyan-active flex items-center gap-1.5 px-5 py-1.5 text-xs font-semibold rounded-full cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Save Timer
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
};
