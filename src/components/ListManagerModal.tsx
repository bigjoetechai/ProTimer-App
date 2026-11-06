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
  FileText
} from 'lucide-react';
import { TimerList, TimerItem } from '../types';
import { useTheme } from '../hooks';

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
  onExportList: (id: string) => void;
  onExportAll: () => void;
  onImportList: (data: string | object, mode?: 'add' | 'replace') => Promise<{ success: boolean; message: string; listId?: string }>;
  getRunningTimerCount: (id: string) => number;
  getAllRunningTimers: () => { timer: TimerItem; list: TimerList }[];
  onRunIndependenceTest: () => Promise<{ success: boolean; message: string; logs: string[] }>;
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
  onExportList,
  onExportAll,
  onImportList,
  getRunningTimerCount,
  getAllRunningTimers,
  onRunIndependenceTest,
}) => {
  const [activeTab, setActiveTab] = useState<'lists' | 'import' | 'test'>('lists');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newListName, setNewListName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
      <div 
        className={`border w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-colors ${
          isDark ? 'bg-[#0f131a] border-[#222d3d] text-neutral-200' : 'bg-white border-slate-300 text-slate-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
          isDark ? 'border-[#1b2330] bg-[#131922]' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-500">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-sm font-semibold tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>Timer Lists Manager</h2>
              <p className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>Organize, duplicate, export, and switch show rundowns</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Nav Tabs */}
            <div className={`flex items-center p-0.5 rounded-lg border text-xs ${
              isDark ? 'bg-[#090b0f] border-[#1e2736]' : 'bg-slate-100 border-slate-300'
            }`}>
              <button
                type="button"
                onClick={() => setActiveTab('lists')}
                className={`px-3 py-1 rounded-md transition-all font-medium cursor-pointer ${
                  activeTab === 'lists' 
                    ? isDark ? 'bg-[#1e293b] text-white shadow-xs' : 'bg-white text-slate-900 shadow-xs'
                    : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lists ({lists.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`px-3 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'import' 
                    ? isDark ? 'bg-[#1e293b] text-white shadow-xs' : 'bg-white text-slate-900 shadow-xs'
                    : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3 h-3 text-cyan-500" />
                <span>Import / Restore</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('test')}
                className={`px-3 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'test' 
                    ? isDark ? 'bg-[#1e293b] text-cyan-300 shadow-xs' : 'bg-white text-cyan-700 shadow-xs'
                    : isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3 h-3 text-cyan-500" />
                <span>Independence Test</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                isDark ? 'text-neutral-400 hover:text-white hover:bg-[#1a2230]' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Live Running Timers Banner */}
        {runningTimers.length > 0 && (
          <div className="px-5 py-2 bg-emerald-950/40 border-b border-emerald-800/40 flex items-center justify-between text-xs text-emerald-300">
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
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
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
                        className="bg-[#151c27] border border-cyan-500 rounded-lg px-3 py-1 text-xs text-white placeholder-neutral-500 focus:outline-hidden w-64"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreating(false);
                          setNewListName('');
                        }}
                        className="px-2 py-1 text-neutral-400 hover:text-white text-xs"
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
                    className="px-2.5 py-1.5 bg-[#171f2b] hover:bg-[#202b3c] border border-[#263346] text-neutral-300 hover:text-white rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Backup All Lists</span>
                  </button>
                </div>
              </div>

              {/* Lists Table */}
              <div className="border border-[#1e2736] rounded-xl overflow-hidden bg-[#0c1017]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#121822] text-neutral-400 border-b border-[#1c2432] font-semibold">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-3">List Name</th>
                      <th className="py-2.5 px-3 w-28 text-center">Timers</th>
                      <th className="py-2.5 px-3 w-32 text-center">Live Status</th>
                      <th className="py-2.5 px-3 w-48 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#161d28]">
                    {lists.map((list, idx) => {
                      const isActive = list.id === activeListId;
                      const runningCount = getRunningTimerCount(list.id);
                      const isEditing = editingListId === list.id;

                      return (
                        <tr
                          key={list.id}
                          className={`group transition-colors ${
                            isActive ? 'bg-cyan-950/20' : 'hover:bg-[#111722]'
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
                                  className="text-neutral-400 hover:text-cyan-400 disabled:opacity-20 p-0.5"
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === lists.length - 1}
                                  onClick={() => onReorderLists(idx, idx + 1)}
                                  className="text-neutral-400 hover:text-cyan-400 disabled:opacity-20 p-0.5"
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
                                  className="bg-[#151c27] border border-cyan-500 rounded px-2 py-0.5 text-xs text-white focus:outline-hidden w-56"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(list.id)}
                                  className="p-1 text-emerald-400 hover:text-emerald-300"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingListId(null)}
                                  className="p-1 text-neutral-400 hover:text-white"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${isActive ? 'text-cyan-300 font-semibold' : 'text-neutral-200'}`}>
                                  {list.name}
                                </span>
                                {isActive && (
                                  <span className="px-1.5 py-0.2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-[10px] font-semibold uppercase tracking-wider">
                                    Current
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Timer count */}
                          <td className="py-2.5 px-3 text-center text-neutral-400">
                            <span className="font-mono bg-[#161c27] px-2 py-0.5 rounded text-[11px] border border-[#222c3c]">
                              {list.timerIds.length} timer{list.timerIds.length !== 1 ? 's' : ''}
                            </span>
                          </td>

                          {/* Live Running status */}
                          <td className="py-2.5 px-3 text-center">
                            {runningCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-semibold animate-pulse">
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
                                  className="px-2 py-1 bg-[#192230] hover:bg-cyan-600 hover:text-white text-neutral-300 rounded text-[11px] font-medium transition-colors border border-[#263346]"
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
                                className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#1c2432] rounded"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => onDuplicateList(list.id)}
                                title="Duplicate list"
                                className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#1c2432] rounded"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => onExportList(list.id)}
                                title="Export single list (.json)"
                                className="p-1.5 text-neutral-400 hover:text-cyan-400 hover:bg-[#1c2432] rounded"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete confirmation */}
                              {deleteConfirmId === list.id ? (
                                <div className="inline-flex items-center gap-1 bg-red-950/80 p-0.5 rounded border border-red-800">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteList(list.id);
                                      setDeleteConfirmId(null);
                                    }}
                                    className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-1 text-neutral-400 hover:text-white text-[10px]"
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
                                  className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-[#1c2432] rounded disabled:opacity-20"
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
              <div className="bg-[#121822] p-4 rounded-xl border border-[#1e2736]">
                <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Import Timer List or System Backup</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mb-3">
                  Upload an exported JSON file (`protimer-*.json`) or paste raw JSON. Supports single list exports or full backups.
                </p>

                {/* Import Mode Radio */}
                <div className="flex items-center gap-4 mb-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
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
                  <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
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
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
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
                  className="w-full bg-[#0a0d13] border border-[#1f2838] rounded-lg p-3 text-xs font-mono text-neutral-300 placeholder-neutral-600 focus:outline-hidden focus:border-cyan-500"
                />

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={!importJsonText.trim()}
                    onClick={handleManualImport}
                    className="px-4 py-1.5 bg-[#1a2332] hover:bg-cyan-600 hover:text-white disabled:opacity-40 text-neutral-200 rounded-lg text-xs font-semibold transition-colors"
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
              <div className="bg-[#121822] p-4 rounded-xl border border-[#1e2736]">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span>Multi-List Concurrency & Independence Verification</span>
                    </h3>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Verifies the core architectural invariant: <strong>Switching between lists must not stop timers already running</strong>, and <strong>timers in different lists run concurrently and drift-free</strong>.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={testRunning}
                    onClick={handleExecuteTest}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs shrink-0"
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
                    <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                      testResult.success 
                        ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300' 
                        : 'bg-red-950/40 border-red-700/60 text-red-300'
                    }`}>
                      {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />}
                      <span className="font-semibold">{testResult.message}</span>
                    </div>

                    <div className="bg-[#090c12] border border-[#1c2432] rounded-lg p-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1 text-neutral-300">
                      {testResult.logs.map((line, idx) => (
                        <div key={idx} className={line.includes('SUCCESS') ? 'text-emerald-400 font-bold' : line.includes('FAIL') ? 'text-red-400 font-bold' : ''}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 border border-dashed border-[#1f2838] rounded-lg text-center text-xs text-neutral-500">
                    Click &quot;Run Sanity Test&quot; to execute real-time automated verification of multi-list timer concurrency.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1b2330] bg-[#10151e] flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span>Lists: <strong>{lists.length}</strong></span>
            <span>•</span>
            <span>Active List: <strong className="text-cyan-400">{lists.find(l => l.id === activeListId)?.name}</strong></span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1b2433] hover:bg-[#232e40] text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
