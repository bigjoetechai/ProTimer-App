import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Keyboard,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  ShortcutActionId,
  ShortcutBinding,
  ShortcutCategory,
  formatShortcutTokens,
  normalizeKeyboardEvent,
  shortcutsManager,
} from '../services/shortcutsManager';
import { useShortcutsState } from '../hooks/useGlobalShortcuts';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGlobalToggleSync?: (enabled: boolean) => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  onGlobalToggleSync,
}) => {
  const state = useShortcutsState();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | ShortcutCategory>('all');
  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{
    actionId: ShortcutActionId;
    combo: string;
    conflict: ShortcutBinding;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inform shortcutsManager whenever modal is open or actively recording
  useEffect(() => {
    shortcutsManager.setRecordingMode(isOpen && recordingId !== null);
    return () => {
      shortcutsManager.setRecordingMode(false);
    };
  }, [isOpen, recordingId]);

  // Reset transient states when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRecordingId(null);
      setPendingConflict(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Close modal on Escape when NOT recording a shortcut
  useEffect(() => {
    if (!isOpen || recordingId !== null) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc, true);
    return () => window.removeEventListener('keydown', handleEsc, true);
  }, [isOpen, recordingId, onClose]);

  // Capture key combinations while recording an action
  useEffect(() => {
    if (!isOpen || !recordingId) return;

    const handleCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Plain Escape cancels recording (unless combined with modifiers)
      if (e.code === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setRecordingId(null);
        setPendingConflict(null);
        return;
      }

      // Plain Backspace or Delete clears the shortcut binding
      if (
        (e.code === 'Backspace' || e.code === 'Delete') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        shortcutsManager.setShortcutCombo(recordingId, '');
        setRecordingId(null);
        setPendingConflict(null);
        return;
      }

      const combo = normalizeKeyboardEvent(e);
      if (!combo) return;

      const conflict = shortcutsManager.findConflict(recordingId, combo);
      if (conflict) {
        setPendingConflict({ actionId: recordingId, combo, conflict });
        setRecordingId(null);
        return;
      }

      shortcutsManager.setShortcutCombo(recordingId, combo);
      setRecordingId(null);
      setPendingConflict(null);
    };

    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [isOpen, recordingId]);

  const filteredBindings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return DEFAULT_SHORTCUTS.map((def) => state.bindings[def.id]).filter((binding) => {
      if (activeCategory !== 'all' && binding.category !== activeCategory) {
        return false;
      }
      if (!query) return true;
      const tokensText = formatShortcutTokens(binding.combo).join(' ').toLowerCase();
      return (
        binding.label.toLowerCase().includes(query) ||
        binding.description.toLowerCase().includes(query) ||
        binding.combo.toLowerCase().includes(query) ||
        tokensText.includes(query)
      );
    });
  }, [state.bindings, activeCategory, searchQuery]);

  const customizedCount = useMemo(
    () =>
      DEFAULT_SHORTCUTS.reduce(
        (count, def) => (state.bindings[def.id].isCustomized ? count + 1 : count),
        0
      ),
    [state.bindings]
  );

  if (!isOpen) return null;

  const handleToggleGlobal = () => {
    const next = !state.globalEnabled;
    shortcutsManager.setGlobalEnabled(next);
    onGlobalToggleSync?.(next);
  };

  const handleConfirmConflictReassign = () => {
    if (!pendingConflict) return;
    shortcutsManager.setShortcutCombo(pendingConflict.actionId, pendingConflict.combo, true);
    setPendingConflict(null);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setRecordingId(null);
          onClose();
        }
      }}
    >
      <div className="glass-card rounded-3xl w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200/80 dark:border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full glass-btn flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
              <Keyboard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="shortcuts-modal-title"
                className="text-base font-bold tracking-tight text-slate-900 dark:text-white truncate"
              >
                Keyboard Shortcuts Manager
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Control timer start, stop, reset, and tab switching without touching the mouse.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleToggleGlobal}
              role="switch"
              aria-checked={state.globalEnabled}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-full glass-btn text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              title="Enable or disable all global keyboard shortcuts"
            >
              <span
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  state.globalEnabled
                    ? 'bg-emerald-500'
                    : 'bg-slate-400/50 dark:bg-white/15'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                    state.globalEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span
                className={
                  state.globalEnabled
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                {state.globalEnabled ? 'Shortcuts On' : 'Shortcuts Off'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full glass-btn flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shrink-0 cursor-pointer"
              aria-label="Close Keyboard Shortcuts Manager"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="px-6 py-3.5 border-b border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions or keys (e.g. start, reset, tab, Alt+1)..."
              className="glass-input w-full pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`glass-btn px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeCategory === 'all'
                  ? 'glass-btn-cyan-active'
                  : 'glass-btn-subtle text-slate-600 dark:text-slate-300'
              }`}
            >
              All ({DEFAULT_SHORTCUTS.length})
            </button>
            {SHORTCUT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`glass-btn px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === cat.id
                    ? 'glass-btn-cyan-active'
                    : 'glass-btn-subtle text-slate-600 dark:text-slate-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conflict Resolution Banner */}
        {pendingConflict && (
          <div className="mx-6 mt-3 px-4 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-200 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                <strong>{formatShortcutTokens(pendingConflict.combo).join(' + ')}</strong> is
                already assigned to <strong>{pendingConflict.conflict.label}</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingConflict(null)}
                className="px-3 py-1 rounded-full glass-btn text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConflictReassign}
                className="glass-btn glass-btn-amber-active px-3 py-1 rounded-full text-xs font-semibold cursor-pointer"
              >
                Reassign Here
              </button>
            </div>
          </div>
        )}

        {/* Shortcuts List */}
        <div
          className={`flex-1 overflow-y-auto px-6 py-4 space-y-2 transition-opacity ${
            state.globalEnabled ? 'opacity-100' : 'opacity-55'
          }`}
        >
          {filteredBindings.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No shortcuts match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            filteredBindings.map((binding) => {
              const isRecording = recordingId === binding.id;
              const tokens = formatShortcutTokens(binding.combo);

              return (
                <div
                  key={binding.id}
                  className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-colors ${
                    isRecording
                      ? 'bg-sky-500/12 border-sky-400/50 dark:bg-sky-500/15 dark:border-sky-400/45'
                      : 'bg-slate-900/[0.03] dark:bg-white/[0.03] border-slate-200/70 dark:border-white/[0.07] hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  {/* Action Enable Toggle + Label */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={binding.enabled}
                      aria-label={`Toggle ${binding.label} shortcut`}
                      onClick={() =>
                        shortcutsManager.setShortcutEnabled(binding.id, !binding.enabled)
                      }
                      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        binding.enabled
                          ? 'bg-sky-500'
                          : 'bg-slate-300 dark:bg-white/15'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                          binding.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold truncate ${
                            binding.enabled
                              ? 'text-slate-900 dark:text-slate-100'
                              : 'text-slate-400 dark:text-slate-500 line-through'
                          }`}
                        >
                          {binding.label}
                        </span>
                        {binding.isCustomized && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 shrink-0">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {binding.description}
                      </p>
                    </div>
                  </div>

                  {/* Keycap Recorder + Reset/Clear Controls */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingConflict(null);
                        setRecordingId(isRecording ? null : binding.id);
                      }}
                      className={`glass-btn min-w-[126px] px-3 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        isRecording
                          ? 'glass-btn-cyan-active ring-2 ring-cyan-400/60'
                          : 'glass-btn-subtle text-slate-800 dark:text-slate-200'
                      }`}
                      title={
                        isRecording
                          ? 'Press any key combo, Backspace to clear, or Esc to cancel'
                          : 'Click to record a new keyboard shortcut'
                      }
                    >
                      {isRecording ? (
                        <span className="text-sky-700 dark:text-sky-200 whitespace-nowrap">
                          Press keys...
                        </span>
                      ) : tokens.length > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {tokens.map((tok, idx) => (
                            <React.Fragment key={`${binding.id}-${tok}-${idx}`}>
                              <kbd className="px-1.5 py-0.5 rounded-md bg-slate-900/10 dark:bg-white/10 border border-slate-900/10 dark:border-white/15 font-mono text-[11px] leading-none">
                                {tok}
                              </kbd>
                              {idx < tokens.length - 1 && (
                                <span className="text-[10px] opacity-50">+</span>
                              )}
                            </React.Fragment>
                          ))}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 italic">
                          Unbound
                        </span>
                      )}
                    </button>

                    {binding.combo && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecordingId(null);
                          setPendingConflict(null);
                          shortcutsManager.setShortcutCombo(binding.id, '');
                        }}
                        className="w-7 h-7 rounded-full glass-btn flex items-center justify-center text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer"
                        title="Clear binding"
                        aria-label={`Clear binding for ${binding.label}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {binding.isCustomized && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecordingId(null);
                          setPendingConflict(null);
                          shortcutsManager.resetShortcut(binding.id);
                        }}
                        className="w-7 h-7 rounded-full glass-btn flex items-center justify-center text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 cursor-pointer"
                        title={`Reset to default (${formatShortcutTokens(binding.defaultCombo).join('+')})`}
                        aria-label={`Reset ${binding.label} to default`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            {recordingId ? (
              <span className="text-sky-600 dark:text-sky-300 font-medium">
                Listening for keys — press <kbd className="font-mono">Esc</kbd> to cancel or{' '}
                <kbd className="font-mono">Backspace</kbd> to clear.
              </span>
            ) : (
              <span>
                Click any keycap to rebind. Shortcuts pause automatically while typing in inputs.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {customizedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRecordingId(null);
                  setPendingConflict(null);
                  shortcutsManager.resetAll();
                  onGlobalToggleSync?.(true);
                }}
                className="px-3.5 py-1.5 rounded-full glass-btn text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset All ({customizedCount})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="glass-btn glass-btn-cyan-active px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
