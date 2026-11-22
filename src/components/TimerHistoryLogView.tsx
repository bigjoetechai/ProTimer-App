/**
 * Timer Execution History Log View ('History' Tab in Main Console).
 * Records and displays the exact start and stop timestamps for each timer run,
 * along with planned duration, actual elapsed time, parent cue list, and status.
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Trash2,
  Clock,
  Play,
  Pause,
  Square,
  CheckCircle2,
  X,
  History,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { TimerRunLogEntry, TimerList } from '../types';
import { formatSeconds } from '../utilities/timeFormatters';
import { useTheme } from '../hooks';

interface TimerHistoryLogViewProps {
  logs: TimerRunLogEntry[];
  lists: TimerList[];
  onDeleteLog: (id: string) => void;
  onClearLogs: () => void;
  onExportCsv: () => void;
}

type LogSortField =
  | 'timerName'
  | 'listName'
  | 'startTimestamp'
  | 'stopTimestamp'
  | 'plannedDurationSeconds'
  | 'elapsedSeconds'
  | 'status';
type SortOrder = 'asc' | 'desc';

function formatTimestampFull(ts: number | null): { time: string; date: string } {
  if (!ts) return { time: '--:--:--', date: '' };
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0').slice(0, 2);
  const yyyy = d.getFullYear();
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return {
    time: `${hh}:${mm}:${ss}.${ms}`,
    date: `${yyyy}-${mon}-${day}`,
  };
}

export const TimerHistoryLogView: React.FC<TimerHistoryLogViewProps> = ({
  logs,
  lists,
  onDeleteLog,
  onClearLogs,
  onExportCsv,
}) => {
  const { isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<LogSortField>('startTimestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: LogSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderSortIndicator = (field: LogSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-2.5 h-2.5 opacity-40 ml-1 inline" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-2.5 h-2.5 text-cyan-500 ml-1 inline" />
    ) : (
      <ArrowDown className="w-2.5 h-2.5 text-cyan-500 ml-1 inline" />
    );
  };

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    if (selectedListFilter !== 'all') {
      result = result.filter((entry) => entry.listId === selectedListFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (entry) =>
          entry.timerName.toLowerCase().includes(q) ||
          entry.listName.toLowerCase().includes(q) ||
          entry.timerType.toLowerCase().includes(q) ||
          entry.status.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let valA: string | number = a[sortField] ?? 0;
      let valB: string | number = b[sortField] ?? 0;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    return result;
  }, [logs, selectedListFilter, searchQuery, sortField, sortOrder]);

  const headerBorder = isDark
    ? 'border-r border-[#1a2130] hover:bg-[#151c2b]'
    : 'border-r border-slate-200 hover:bg-slate-200';

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 select-none relative transition-colors duration-150 ${
        isDark ? 'bg-[#080a0f]' : 'bg-slate-50'
      }`}
    >
      {/* Top Filter & Actions Bar */}
      <div
        className={`h-9 border-b px-3 flex items-center justify-between gap-3 text-xs transition-colors ${
          isDark ? 'bg-[#0c1017] border-[#1b2333]' : 'bg-slate-100 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2.5 flex-1 max-w-xl">
          {/* Search Input */}
          <div className="relative flex items-center max-w-xs w-full">
            <Search
              className={`w-3.5 h-3.5 absolute left-2 pointer-events-none ${
                isDark ? 'text-neutral-500' : 'text-slate-400'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history by cue name, list, or status..."
              className={`w-full rounded pl-7 pr-6 py-0.5 text-xs transition-colors focus:outline-hidden focus:border-cyan-500 border ${
                isDark
                  ? 'bg-[#121722] border-[#222e42] text-white placeholder-neutral-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={`absolute right-2 cursor-pointer ${
                  isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* List Filter Dropdown */}
          <select
            value={selectedListFilter}
            onChange={(e) => setSelectedListFilter(e.target.value)}
            className={`rounded px-2.5 py-0.5 text-xs border focus:outline-hidden focus:border-cyan-500 cursor-pointer ${
              isDark
                ? 'bg-[#121722] border-[#222e42] text-neutral-200'
                : 'bg-white border-slate-300 text-slate-800'
            }`}
          >
            <option value="all">All Cue Lists</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right Info & Export/Clear Buttons */}
        <div className="flex items-center gap-2.5">
          <span className={`text-[11px] font-mono ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
            {filteredLogs.length} {filteredLogs.length === 1 ? 'log entry' : 'log entries'}
          </span>

          <button
            type="button"
            onClick={onExportCsv}
            disabled={logs.length === 0}
            title="Export Timer Run History to CSV"
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isDark
                ? 'bg-[#131924] hover:bg-[#1b2434] border-[#232e42] text-cyan-400 hover:text-cyan-300'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-cyan-700'
            }`}
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            title="Clear All Recorded Timer Logs"
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isDark
                ? 'bg-red-950/40 hover:bg-red-900/60 border-red-800/60 text-red-300 hover:text-white'
                : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700'
            }`}
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear History</span>
          </button>
        </div>
      </div>

      {/* Main History Log Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0">
        {filteredLogs.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead
              className={`sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wider border-b shadow-2xs ${
                isDark
                  ? 'bg-[#0f141f] text-neutral-300 border-[#1f2838]'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <tr>
                <th className={`py-2.5 px-3 w-12 text-center ${headerBorder}`}>#</th>
                <th
                  onClick={() => handleSort('timerName')}
                  className={`py-2.5 px-3.5 min-w-[180px] cursor-pointer transition-colors ${headerBorder}`}
                >
                  Timer / Cue Name {renderSortIndicator('timerName')}
                </th>
                <th
                  onClick={() => handleSort('listName')}
                  className={`py-2.5 px-3 w-40 cursor-pointer transition-colors ${headerBorder}`}
                >
                  Cue List {renderSortIndicator('listName')}
                </th>
                <th className={`py-2.5 px-3 w-28 ${headerBorder}`}>Type</th>
                <th
                  onClick={() => handleSort('startTimestamp')}
                  className={`py-2.5 px-3.5 w-44 cursor-pointer transition-colors ${headerBorder} ${
                    isDark ? 'bg-[#121926]/40' : 'bg-emerald-50/40'
                  }`}
                >
                  Start Timestamp {renderSortIndicator('startTimestamp')}
                </th>
                <th
                  onClick={() => handleSort('stopTimestamp')}
                  className={`py-2.5 px-3.5 w-44 cursor-pointer transition-colors ${headerBorder} ${
                    isDark ? 'bg-[#121926]/40' : 'bg-amber-50/40'
                  }`}
                >
                  Stop Timestamp {renderSortIndicator('stopTimestamp')}
                </th>
                <th
                  onClick={() => handleSort('plannedDurationSeconds')}
                  className={`py-2.5 px-3 w-28 cursor-pointer transition-colors ${headerBorder}`}
                >
                  Planned {renderSortIndicator('plannedDurationSeconds')}
                </th>
                <th
                  onClick={() => handleSort('elapsedSeconds')}
                  className={`py-2.5 px-3 w-28 cursor-pointer transition-colors ${headerBorder}`}
                >
                  Elapsed {renderSortIndicator('elapsedSeconds')}
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className={`py-2.5 px-3 w-28 cursor-pointer transition-colors ${headerBorder}`}
                >
                  Status {renderSortIndicator('status')}
                </th>
                <th className="py-2.5 px-3 w-16 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-transparent">
              {filteredLogs.map((entry, idx) => {
                const startFmt = formatTimestampFull(entry.startTimestamp);
                const stopFmt = formatTimestampFull(entry.stopTimestamp);
                const isRunning = entry.status === 'running';
                const isPaused = entry.status === 'paused';

                return (
                  <tr
                    key={entry.id}
                    className={`border-b transition-colors ${
                      isRunning
                        ? isDark
                          ? 'bg-emerald-950/25 border-[#1a2436] hover:bg-emerald-950/35'
                          : 'bg-emerald-50/70 border-slate-200 hover:bg-emerald-100/70'
                        : isDark
                        ? 'bg-[#0b0e15] border-[#151c28] hover:bg-[#111722]'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <td
                      className={`py-2 px-3 text-center font-mono text-[11px] ${
                        isDark ? 'text-neutral-500 border-r border-[#151c28]' : 'text-slate-400 border-r border-slate-200'
                      }`}
                    >
                      {filteredLogs.length - idx}
                    </td>

                    <td
                      className={`py-2 px-3.5 font-semibold ${
                        isDark ? 'text-white border-r border-[#151c28]' : 'text-slate-900 border-r border-slate-200'
                      }`}
                    >
                      {entry.timerName}
                    </td>

                    <td
                      className={`py-2 px-3 truncate ${
                        isDark ? 'text-neutral-300 border-r border-[#151c28]' : 'text-slate-600 border-r border-slate-200'
                      }`}
                    >
                      {entry.listName}
                    </td>

                    <td
                      className={`py-2 px-3 uppercase text-[10px] font-mono tracking-wider ${
                        isDark ? 'text-neutral-400 border-r border-[#151c28]' : 'text-slate-500 border-r border-slate-200'
                      }`}
                    >
                      {entry.timerType.replace('_', ' ')}
                    </td>

                    {/* Start Timestamp */}
                    <td
                      className={`py-2 px-3.5 font-mono ${
                        isDark ? 'border-r border-[#151c28]' : 'border-r border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={isDark ? 'text-emerald-400 font-semibold' : 'text-emerald-700 font-semibold'}>
                          {startFmt.time}
                        </span>
                        <span className={`text-[10px] ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>
                          {startFmt.date}
                        </span>
                      </div>
                    </td>

                    {/* Stop Timestamp */}
                    <td
                      className={`py-2 px-3.5 font-mono ${
                        isDark ? 'border-r border-[#151c28]' : 'border-r border-slate-200'
                      }`}
                    >
                      {entry.stopTimestamp ? (
                        <div className="flex items-center gap-2">
                          <span className={isDark ? 'text-amber-300 font-semibold' : 'text-amber-700 font-semibold'}>
                            {stopFmt.time}
                          </span>
                          <span className={`text-[10px] ${isDark ? 'text-neutral-500' : 'text-slate-400'}`}>
                            {stopFmt.date}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                            isRunning
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isRunning ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                            }`}
                          />
                          {isRunning ? 'In Progress' : 'Paused'}
                        </span>
                      )}
                    </td>

                    {/* Planned Duration */}
                    <td
                      className={`py-2 px-3 font-mono ${
                        isDark ? 'text-neutral-300 border-r border-[#151c28]' : 'text-slate-700 border-r border-slate-200'
                      }`}
                    >
                      {formatSeconds(entry.plannedDurationSeconds, true)}
                    </td>

                    {/* Actual Elapsed */}
                    <td
                      className={`py-2 px-3 font-mono font-semibold ${
                        isDark ? 'text-cyan-300 border-r border-[#151c28]' : 'text-cyan-700 border-r border-slate-200'
                      }`}
                    >
                      {formatSeconds(entry.elapsedSeconds, true)}
                    </td>

                    {/* Status Badge */}
                    <td
                      className={`py-2 px-3 ${
                        isDark ? 'border-r border-[#151c28]' : 'border-r border-slate-200'
                      }`}
                    >
                      {isRunning && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          <Play className="w-2.5 h-2.5 fill-current" />
                          Running
                        </span>
                      )}
                      {isPaused && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">
                          <Pause className="w-2.5 h-2.5 fill-current" />
                          Paused
                        </span>
                      )}
                      {entry.status === 'stopped' && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            isDark
                              ? 'bg-red-500/15 text-red-300 border-red-500/30'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          <Square className="w-2.5 h-2.5 fill-current" />
                          Stopped
                        </span>
                      )}
                      {entry.status === 'completed' && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            isDark
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                          }`}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Completed
                        </span>
                      )}
                    </td>

                    {/* Delete Action */}
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteLog(entry.id)}
                        title="Delete Log Entry"
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isDark
                            ? 'text-neutral-500 hover:text-red-400 hover:bg-red-950/40'
                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="min-h-[260px] flex flex-col items-center justify-center p-8 text-center">
            <div
              className={`w-12 h-12 rounded-full border flex items-center justify-center mb-3 ${
                isDark
                  ? 'bg-[#0c1018] border-[#1f293d] text-cyan-400'
                  : 'bg-white border-slate-200 text-cyan-600 shadow-2xs'
              }`}
            >
              <History className="w-6 h-6" />
            </div>
            <p className={`text-sm font-semibold ${isDark ? 'text-neutral-200' : 'text-slate-800'}`}>
              No timer history recorded yet
            </p>
            <p className={`text-xs mt-1 max-w-md ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
              Start and stop any timer in your cue lists to automatically record its start and stop timestamps here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
