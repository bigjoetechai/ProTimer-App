/**
 * Comprehensive Multiple Timer-List Management Modal.
 *
 * Supports:
 * 1. Create new lists
 * 2. Rename lists
 * 3. Delete lists (with safe guard)
 * 4. Duplicate lists (deep clone with timers)
 * 5. Rearrange lists (move up/down or reorder)
 * 6. Switch between lists
 * 7. Save / Export individual list to JSON
 * 8. Import lists (single or backup)
 * 9. Export all lists (full system backup)
 * 10. Automated Live Independence & Concurrency Test
 */

import React, { useState, useRef } from 'react';
import { 
  X, 
  Plus, 
  Folder, 
  Copy, 
  Trash2, 
  Download, 
  Upload, 
  ArrowUp, 
  ArrowDown, 
  Edit3, 
  Check, 
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  FileText,
  Undo2,
  Redo2,
  Palette,
  FolderInput,
  ArrowRight,
  BookmarkPlus
} from 'lucide-react';
import { TimerList, TimerItem } from '../types';
import { useTheme } from '../hooks';
import { CUE_COLOR_SWATCHES } from '../timers/ContextMenu';

interface ListManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lists: TimerList[];
  activeListId: string;
  onSelectList: (id: string) => void;
  onAddList: (name?: string, description?: string) => void;
  onRenameList: (id: string, newName: string) => void;
  onDeleteList: (id: string) => boolean;
  onDuplicateList: (id: string) => void;
  onReorderLists: (sourceIndex: number, destinationIndex: number) => void;
  onSetListColor?: (id: string, color?: string) => void;
  onCopyListCuesToList?: (sourceListId: string, targetListId: string, mode?: 'append' | 'replace') => number;
  onSaveListAsTemplate?: (id: string) => void;
  onExportList: (id: string) => void;
  onExportAll: () => void;
  onImportList: (data: string | object, mode?: 'add' | 'replace') => Promise<{ success: boolean; message: string; listId?: string }>;
  getRunningTimerCount: (id: string) => number;
  getAllRunningTimers: () => { timer: TimerItem; list: TimerList }[];
  onRunIndependenceTest: () => Promise<{ success: boolean; message: string; logs: string[] }>;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoLabel?: string | null;
  redoLabel?: string | null;
}

export const ListManagerModal: React.FC<ListManagerModalProps> = ({
  isOpen,
  onClose,
  lists,
  activeListId,
  onSelectList,
  onAddList,
  onRenameList,
  onDeleteList,
  onDuplicateList,
  onReorderLists,
  onSetListColor,
  onCopyListCuesToList,
  onSaveListAsTemplate,
  onExportList,
  onExportAll,
  onImportList,
  getRunningTimerCount,
  getAllRunningTimers,
  onRunIndependenceTest,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  undoLabel,
  redoLabel,
}) => {
  const [activeTab, setActiveTab] = useState<'lists' | 'import' | 'test'>('lists');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newListName, setNewListName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Copy cue list between tabs state
  const [copySourceId, setCopySourceId] = useState<string>('');
  const [copyTargetId, setCopyTargetId] = useState<string>('');
  const [copyListMode, setCopyListMode] = useState<'append' | 'replace'>('append');
  const [copyListFeedback, setCopyListFeedback] = useState<string | null>(null);

  // Import state
  const [importJsonText, setImportJsonText] = useState('');
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const [importStatus, setImportStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Test state
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string; logs: string[] } | null>(null);

  const { isDark } = useTheme();

  if (!isOpen) return null;

  const handleStartRename = (list: TimerList) => {
    setEditingListId(list.id);
    setEditingName(list.name);
  };

  const handleSaveRename = (listId: string) => {
    if (editingName.trim()) {
      onRenameList(listId, editingName.trim());
    }
    setEditingListId(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListName.trim()) {
      onAddList(newListName.trim());
      setNewListName('');
      setIsCreating(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setImportJsonText(content);
      const res = await onImportList(content, importMode);
      setImportStatus(res);
      if (res.success) {
        setTimeout(() => {
          setActiveTab('lists');
          setImportStatus(null);
          setImportJsonText('');
        }, 1200);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleManualImport = async () => {
    if (!importJsonText.trim()) return;
    const res = await onImportList(importJsonText, importMode);
    setImportStatus(res);
    if (res.success) {
      setTimeout(() => {
        setActiveTab('lists');
        setImportStatus(null);
        setImportJsonText('');
      }, 1200);
    }
  };

  const handleExecuteTest = async () => {
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await onRunIndependenceTest();
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
        logs: ['Test threw an unexpected error during execution.'],
      });
    } finally {
      setTestRunning(false);
    }
  };

  const runningTimers = getAllRunningTimers();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
      <div 
        className={`glass-card w-full max-w-3xl rounded-[28px] flex flex-col max-h-[85vh] overflow-hidden transition-colors ${
          isDark ? 'text-neutral-200' : 'text-slate-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
          isDark ? 'border-white/[0.08] bg-white/[0.02]' : 'border-slate-200/80 bg-white/30'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="glass-btn glass-btn-cyan glass-btn-subtle w-8 h-8 flex items-center justify-center pointer-events-none">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-sm font-semibold tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>Timer Lists Manager</h2>
              <p className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Organize, duplicate, export, and switch show rundowns</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Undo / Redo List Actions */}
            {(onUndo || onRedo) && (
              <div className="flex items-center gap-1">
                {onUndo && (
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={onUndo}
                    title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Undo last list action (Ctrl+Z)'}
                    className="glass-btn glass-btn-subtle px-2.5 py-1 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                )}
                {onRedo && (
                  <button
                    type="button"
                    disabled={!canRedo}
                    onClick={onRedo}
                    title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Redo last list action (Ctrl+Y)'}
                    className="glass-btn glass-btn-subtle px-2.5 py-1 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    <span>Redo</span>
                  </button>
                )}
              </div>
            )}

            {/* Nav Tabs */}
            <div className="glass-subcard flex items-center gap-0.5 p-0.5 rounded-full text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('lists')}
                className={`px-3 py-1 rounded-full transition-all font-medium cursor-pointer ${
                  activeTab === 'lists' 
                    ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                    : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lists ({lists.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`px-3 py-1 rounded-full transition-all font-medium flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'import' 
                    ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                    : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>Import / Restore</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('test')}
                className={`px-3 py-1 rounded-full transition-all font-medium flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'test' 
                    ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                    : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Independence Test</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Timer Lists Manager"
              className="glass-btn glass-btn-subtle w-8 h-8 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Live Running Timers Banner */}
        {runningTimers.length > 0 && (
          <div className="px-5 py-2 bg-emerald-950/40 border-b border-emerald-500/25 flex items-center justify-between text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-semibold">{runningTimers.length} timer{runningTimers.length > 1 ? 's' : ''} currently ticking:</span>
              <span className="text-emerald-200/90 truncate max-w-md">
                {runningTimers.map(r => `"${r.timer.name}" in [${r.list.name}]`).join(', ')}
              </span>
            </div>
            <span className="text-[10px] text-emerald-400/80 font-mono">Independent tickers active</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: LISTS */}
          {activeTab === 'lists' && (
            <div className="space-y-4">
              {/* Action Bar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {!isCreating ? (
                    <button
                      type="button"
                      onClick={() => setIsCreating(true)}
                      className="glass-btn glass-btn-cyan-active glass-btn-subtle px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New List</span>
                    </button>
                  ) : (
                    <form onSubmit={handleCreateSubmit} className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        placeholder="List name (e.g., Rehearsal)..."
                        className="glass-input rounded-full px-3.5 py-1 text-xs placeholder-neutral-500 focus:outline-hidden w-64"
                      />
                      <button
                        type="submit"
                        className="glass-btn glass-btn-cyan-active glass-btn-subtle px-3 py-1 text-xs font-semibold cursor-pointer"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreating(false);
                          setNewListName('');
                        }}
                        className="glass-btn glass-btn-subtle px-3 py-1 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onExportAll}
                    title="Export All Lists Backup"
                    className="glass-btn glass-btn-subtle px-3.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Backup All Lists</span>
                  </button>
                </div>
              </div>

              {/* Copy Cue List From One List Tab to Another List Tab */}
              {onCopyListCuesToList && lists.length > 1 && (() => {
                const effectiveSourceId =
                  lists.some((l) => l.id === copySourceId) ? copySourceId : activeListId || lists[0].id;
                const availableTargetLists = lists.filter((l) => l.id !== effectiveSourceId);
                const effectiveTargetId =
                  availableTargetLists.some((l) => l.id === copyTargetId)
                    ? copyTargetId
                    : availableTargetLists[0]?.id || '';
                const sourceListObj = lists.find((l) => l.id === effectiveSourceId);
                const targetListObj = lists.find((l) => l.id === effectiveTargetId);

                return (
                  <div className="glass-subcard p-3.5 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <FolderInput className="w-4 h-4 text-cyan-400" />
                        <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Copy Cue List From One List Tab to Another
                        </span>
                      </div>
                      {copyListFeedback && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[11px] font-medium flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>{copyListFeedback}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>From:</span>
                        <select
                          value={effectiveSourceId}
                          onChange={(e) => setCopySourceId(e.target.value)}
                          className="glass-input rounded-full px-3 py-1 text-xs focus:outline-hidden cursor-pointer"
                        >
                          {lists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name} ({l.timerIds.length} cues)
                            </option>
                          ))}
                        </select>
                      </div>

                      <ArrowRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>To:</span>
                        <select
                          value={effectiveTargetId}
                          onChange={(e) => setCopyTargetId(e.target.value)}
                          className="glass-input rounded-full px-3 py-1 text-xs focus:outline-hidden cursor-pointer"
                        >
                          {availableTargetLists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name} ({l.timerIds.length} cues)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="glass-subcard flex items-center gap-0.5 p-0.5 rounded-full text-[11px]">
                        <button
                          type="button"
                          onClick={() => setCopyListMode('append')}
                          className={`px-2.5 py-0.5 rounded-full font-medium cursor-pointer transition-all ${
                            copyListMode === 'append'
                              ? 'glass-btn glass-btn-cyan-active glass-btn-subtle'
                              : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Append
                        </button>
                        <button
                          type="button"
                          onClick={() => setCopyListMode('replace')}
                          className={`px-2.5 py-0.5 rounded-full font-medium cursor-pointer transition-all ${
                            copyListMode === 'replace'
                              ? 'glass-btn glass-btn-amber-active glass-btn-subtle'
                              : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Replace
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={!effectiveSourceId || !effectiveTargetId}
                        onClick={() => {
                          if (!effectiveSourceId || !effectiveTargetId) return;
                          const count = onCopyListCuesToList(
                            effectiveSourceId,
                            effectiveTargetId,
                            copyListMode
                          );
                          setCopyListFeedback(
                            `${copyListMode === 'replace' ? 'Replaced' : 'Copied'} ${count} cue${
                              count === 1 ? '' : 's'
                            }: ${sourceListObj?.name} → ${targetListObj?.name}`
                          );
                          setTimeout(() => setCopyListFeedback(null), 3500);
                        }}
                        className="glass-btn glass-btn-cyan-active glass-btn-subtle px-3.5 py-1 text-xs font-semibold flex items-center gap-1.5 cursor-pointer ml-auto"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Cue List</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Lists Table */}
              <div className="glass-subcard rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className={`border-b font-semibold ${
                    isDark ? 'bg-white/[0.04] text-neutral-400 border-white/[0.08]' : 'bg-slate-200/60 text-slate-600 border-slate-300/70'
                  }`}>
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-3">List Name</th>
                      <th className="py-2.5 px-3 w-44">Tab &amp; Cue List Color</th>
                      <th className="py-2.5 px-3 w-24 text-center">Timers</th>
                      <th className="py-2.5 px-3 w-28 text-center">Live Status</th>
                      <th className="py-2.5 px-3 w-44 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-white/[0.06]' : 'divide-slate-200/80'}`}>
                    {lists.map((list, idx) => {
                      const isActive = list.id === activeListId;
                      const runningCount = getRunningTimerCount(list.id);
                      const isEditing = editingListId === list.id;

                      return (
                        <tr
                          key={list.id}
                          style={
                            list.color
                              ? {
                                  borderLeft: `4px solid ${list.color}`,
                                  backgroundColor: isActive ? `${list.color}38` : `${list.color}22`,
                                }
                              : undefined
                          }
                          className={`group transition-colors ${
                            isActive
                              ? isDark ? 'bg-cyan-500/12' : 'bg-cyan-500/10'
                              : isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-white/50'
                          }`}
                        >
                          {/* Order / Reorder */}
                          <td className="py-2.5 px-3 text-center text-neutral-400 font-mono">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[11px] font-bold text-neutral-400 w-4">{idx + 1}</span>
                              <div className="flex flex-col opacity-30 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => onReorderLists(idx, idx - 1)}
                                  className="text-neutral-400 hover:text-cyan-400 disabled:opacity-20 p-0.5 cursor-pointer"
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === lists.length - 1}
                                  onClick={() => onReorderLists(idx, idx + 1)}
                                  className="text-neutral-400 hover:text-cyan-400 disabled:opacity-20 p-0.5 cursor-pointer"
                                  title="Move Down"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* List Name */}
                          <td className="py-2.5 px-3">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(list.id);
                                    if (e.key === 'Escape') setEditingListId(null);
                                  }}
                                  className="glass-input rounded-full px-3 py-0.5 text-xs focus:outline-hidden w-48"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(list.id)}
                                  className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingListId(null)}
                                  className="p-1 text-neutral-400 hover:text-white cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {list.color && (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/30"
                                    style={{ backgroundColor: list.color }}
                                  />
                                )}
                                <span className={`font-medium ${isActive ? (isDark ? 'text-cyan-300 font-semibold' : 'text-cyan-700 font-semibold') : (isDark ? 'text-neutral-200' : 'text-slate-800')}`}>
                                  {list.name}
                                </span>
                                {isActive && (
                                  <span className="px-2 py-0.2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-full text-[10px] font-semibold uppercase tracking-wider">
                                    Current
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Tab & Cue List Color Swatches */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {CUE_COLOR_SWATCHES.map((swatch) => {
                                const isSelected =
                                  (!swatch.value && !list.color) || swatch.value === list.color;
                                return (
                                  <button
                                    key={swatch.label}
                                    type="button"
                                    title={`${list.name} color: ${swatch.label}`}
                                    onClick={() => onSetListColor?.(list.id, swatch.value)}
                                    className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-115 flex items-center justify-center cursor-pointer ${
                                      isSelected
                                        ? 'ring-2 ring-cyan-400 border-white scale-110'
                                        : 'border-white/20'
                                    }`}
                                    style={{
                                      backgroundColor: swatch.value || '#24242a',
                                    }}
                                  >
                                    {!swatch.value && (
                                      <span className="text-[8px] font-bold text-neutral-400">×</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </td>

                          {/* Timer count */}
                          <td className="py-2.5 px-3 text-center text-neutral-400">
                            <span className={`font-mono px-2.5 py-0.5 rounded-full text-[11px] border ${
                              isDark ? 'bg-white/[0.04] border-white/[0.08] text-neutral-300' : 'bg-white/60 border-slate-300 text-slate-700'
                            }`}>
                              {list.timerIds.length} timer{list.timerIds.length !== 1 ? 's' : ''}
                            </span>
                          </td>

                          {/* Live Running status */}
                          <td className="py-2.5 px-3 text-center">
                            {runningCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-semibold animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span>{runningCount} Running</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-neutral-500 font-mono">Idle</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!isActive ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectList(list.id)}
                                  className="glass-btn glass-btn-cyan glass-btn-subtle px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                                  title="Switch to this list"
                                >
                                  Switch
                                </button>
                              ) : (
                                <span className="px-2 py-1 text-cyan-400 text-[11px] font-medium">
                                  Viewing
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleStartRename(list)}
                                title="Rename list"
                                className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.09] rounded-full transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => onDuplicateList(list.id)}
                                title="Duplicate list"
                                className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.09] rounded-full transition-colors cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              {onSaveListAsTemplate && (
                                <button
                                  type="button"
                                  onClick={() => onSaveListAsTemplate(list.id)}
                                  title="Save list as template"
                                  className="p-1.5 text-neutral-400 hover:text-cyan-400 hover:bg-white/[0.09] rounded-full transition-colors cursor-pointer"
                                >
                                  <BookmarkPlus className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onExportList(list.id)}
                                title="Export single list (.json)"
                                className="p-1.5 text-neutral-400 hover:text-cyan-400 hover:bg-white/[0.09] rounded-full transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete confirmation */}
                              {deleteConfirmId === list.id ? (
                                <div className="inline-flex items-center gap-1 bg-red-950/75 p-0.5 rounded-full border border-red-500/40">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteList(list.id);
                                      setDeleteConfirmId(null);
                                    }}
                                    className="glass-btn glass-btn-red-active glass-btn-subtle px-2 py-0.5 text-[10px] font-bold cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-1.5 text-neutral-300 hover:text-white text-[10px] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={lists.length <= 1}
                                  onClick={() => setDeleteConfirmId(list.id)}
                                  title={lists.length <= 1 ? 'Cannot delete the sole list' : 'Delete list'}
                                  className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-white/[0.09] rounded-full disabled:opacity-20 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT / RESTORE */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="glass-subcard p-4 rounded-2xl">
                <h3 className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Import Timer List or System Backup</span>
                </h3>
                <p className={`text-[11px] mb-3 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                  Upload an exported JSON file (`protimer-*.json`) or paste raw JSON. Supports single list exports or full backups.
                </p>

                {/* Import Mode Radio */}
                <div className="flex items-center gap-4 mb-4 text-xs">
                  <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="add"
                      checked={importMode === 'add'}
                      onChange={() => setImportMode('add')}
                      className="accent-cyan-500"
                    />
                    <span>Add as New List(s) (Keep existing lists)</span>
                  </label>
                  <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="accent-cyan-500"
                    />
                    <span className="text-amber-400">Replace All Lists (Full Restore)</span>
                  </label>
                </div>

                {/* File Upload Button */}
                <div className="flex items-center gap-3 mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="glass-btn glass-btn-cyan-active glass-btn-subtle px-4 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Choose JSON File...</span>
                  </button>
                  <span className="text-xs text-neutral-400">or paste JSON data below</span>
                </div>

                {/* Text area */}
                <textarea
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder="Paste JSON content here..."
                  rows={6}
                  className="glass-input w-full rounded-2xl p-3 text-xs font-mono placeholder-neutral-500 focus:outline-hidden"
                />

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={!importJsonText.trim()}
                    onClick={handleManualImport}
                    className="glass-btn glass-btn-cyan glass-btn-subtle px-4 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Process JSON Import
                  </button>

                  {importStatus && (
                    <div className={`text-xs flex items-center gap-1.5 ${importStatus.success ? 'text-emerald-400' : 'text-red-400'}`}>
                      {importStatus.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      <span>{importStatus.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INDEPENDENCE & CONCURRENCY TEST */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <div className="glass-subcard p-4 rounded-2xl">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span>Multi-List Concurrency & Independence Verification</span>
                    </h3>
                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-neutral-400' : 'text-slate-600'}`}>
                      Verifies the core architectural invariant: <strong>Switching between lists must not stop timers already running</strong>, and <strong>timers in different lists run concurrently and drift-free</strong>.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={testRunning}
                    onClick={handleExecuteTest}
                    className="glass-btn glass-btn-cyan-active glass-btn-subtle px-4 py-2 text-xs font-semibold flex items-center gap-2 shrink-0 cursor-pointer"
                  >
                    {testRunning ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Running Test...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Run Sanity Test</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Test Output Logs */}
                {testResult ? (
                  <div className="mt-4 space-y-3">
                    <div className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                      testResult.success 
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
                        : 'bg-red-950/40 border-red-500/40 text-red-300'
                    }`}>
                      {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />}
                      <span className="font-semibold">{testResult.message}</span>
                    </div>

                    <div className="glass-input rounded-2xl p-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1">
                      {testResult.logs.map((line, idx) => (
                        <div key={idx} className={line.includes('SUCCESS') ? 'text-emerald-400 font-bold' : line.includes('FAIL') ? 'text-red-400 font-bold' : ''}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 border border-dashed border-white/[0.12] rounded-2xl text-center text-xs text-neutral-500">
                    Click &quot;Run Sanity Test&quot; to execute real-time automated verification of multi-list timer concurrency.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t flex items-center justify-between text-xs ${
          isDark ? 'border-white/[0.08] bg-white/[0.02] text-neutral-400' : 'border-slate-200/80 bg-white/30 text-slate-500'
        }`}>
          <div className="flex items-center gap-2">
            <span>Lists: <strong>{lists.length}</strong></span>
            <span>•</span>
            <span>Active List: <strong className="text-cyan-400">{lists.find(l => l.id === activeListId)?.name}</strong></span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="glass-btn glass-btn-subtle px-5 py-1.5 text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
