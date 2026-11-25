import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, Check, X } from 'lucide-react';
import { TimerItem, TimerList } from '../types';
import {
  ListTemplateCategory,
  TEMPLATE_CATEGORIES,
  formatCueMMSS,
  formatTemplateDuration,
} from '../services/listTemplatesService';
import { useTheme } from '../hooks';

export interface SaveListAsTemplateModalProps {
  isOpen: boolean;
  list: TimerList | null;
  timers: TimerItem[];
  onClose: () => void;
  onSave: (options: {
    listId: string;
    name: string;
    description: string;
    category: ListTemplateCategory;
  }) => void;
}

export const SaveListAsTemplateModal: React.FC<SaveListAsTemplateModalProps> = ({
  isOpen,
  list,
  timers,
  onClose,
  onSave,
}) => {
  const { isDark } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ListTemplateCategory>('custom');

  useEffect(() => {
    if (isOpen && list) {
      setName(list.name);
      setDescription(list.description || '');
      setCategory('custom');
    }
  }, [isOpen, list]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc, true);
    return () => window.removeEventListener('keydown', handleEsc, true);
  }, [isOpen, onClose]);

  if (!isOpen || !list) return null;

  const totalDuration = timers.reduce((sum, t) => sum + Math.max(0, t.durationSeconds || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      listId: list.id,
      name: trimmed,
      description: description.trim(),
      category,
    });
    onClose();
  };

  const labelCls = isDark
    ? 'text-[11px] font-semibold text-neutral-300'
    : 'text-[11px] font-semibold text-slate-600';

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-template-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`glass-card rounded-3xl w-full max-w-lg overflow-hidden flex flex-col ${
          isDark ? 'text-slate-100' : 'text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 px-6 py-4 border-b ${
            isDark ? 'border-white/10' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full glass-btn glass-btn-cyan flex items-center justify-center shrink-0 pointer-events-none">
              <BookmarkPlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="save-template-modal-title"
                className="text-sm font-bold tracking-tight truncate"
              >
                Save Tab List as Template
              </h2>
              <p className={`text-xs truncate ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                {list.name} · {timers.length} cue{timers.length === 1 ? '' : 's'} ·{' '}
                {formatTemplateDuration(totalDuration)} total
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Save as Template dialog"
            className="glass-btn glass-btn-subtle w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="template-name-input" className={`block ${labelCls}`}>
              Template Name
            </label>
            <input
              id="template-name-input"
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sunday Morning Service, Regional Finals"
              className="glass-input w-full px-3.5 py-2 rounded-xl text-xs focus:outline-hidden focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="template-desc-input" className={`block ${labelCls}`}>
              Description (optional)
            </label>
            <input
              id="template-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note about when to use this rundown"
              className="glass-input w-full px-3.5 py-2 rounded-xl text-xs focus:outline-hidden focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1.5">
            <span className={`block ${labelCls}`}>Category</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {TEMPLATE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`glass-btn px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    category === cat.id ? 'glass-btn-cyan-active' : 'glass-btn-subtle'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cues Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className={labelCls}>Included Cues ({timers.length})</span>
              <span className={`font-mono tabular-nums ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                Total {formatTemplateDuration(totalDuration)}
              </span>
            </div>
            <div
              className={`max-h-36 overflow-y-auto rounded-xl border divide-y ${
                isDark
                  ? 'border-white/10 bg-black/25 divide-white/[0.06]'
                  : 'border-slate-200 bg-white/50 divide-slate-200/70'
              }`}
            >
              {timers.length === 0 ? (
                <div className="px-3.5 py-4 text-center text-xs text-neutral-500">
                  This tab currently has no timers. You can still save an empty template shell.
                </div>
              ) : (
                timers.map((t, index) => (
                  <div
                    key={t.id}
                    className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono tabular-nums text-[10px] opacity-55 w-4 shrink-0">
                        {index + 1}.
                      </span>
                      <span className="truncate font-medium">{t.name}</span>
                    </div>
                    <span
                      className={`font-mono tabular-nums text-[11px] shrink-0 ${
                        isDark ? 'text-cyan-300' : 'text-cyan-700'
                      }`}
                    >
                      {formatCueMMSS(t.durationSeconds)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="glass-btn glass-btn-subtle px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="glass-btn glass-btn-cyan-active px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Template</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
