/**
 * Timer Configuration and Editing Modal.
 * Clean, broadcast-standard editor for ProTimer items.
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Clock } from 'lucide-react';
import { TimerItem, TimerType, EndAction, TimerAlert } from '../types';
import { useTheme } from '../hooks';

interface TimerEditorModalProps {
  isOpen: boolean;
  timer: TimerItem | null;
  onClose: () => void;
  onSave: (timerData: Partial<TimerItem>) => void;
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

export const TimerEditorModal: React.FC<TimerEditorModalProps> = ({
  isOpen,
  timer,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
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
  }, [timer, isOpen]);

  const { isDark } = useTheme();

  if (!isOpen) return null;

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

  const inputBgCls = isDark
    ? 'bg-[#0a0d14] border-[#1e2a3c] text-white placeholder-neutral-500 focus:border-cyan-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600';
  const sectionBoxCls = isDark
    ? 'bg-[#0a0d14] border-[#1c2637]'
    : 'bg-slate-50 border-slate-200';
  const subInputCls = isDark
    ? 'bg-[#121620] border-[#233147] text-white focus:border-cyan-500'
    : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600';
  const labelCls = isDark
    ? 'text-[10px] font-semibold uppercase tracking-wider text-neutral-400'
    : 'text-[10px] font-semibold uppercase tracking-wider text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div
        className={`border rounded-lg w-full max-w-[480px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden transition-colors ${
          isDark
            ? 'bg-[#121620] border-[#222e42] text-white'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
            isDark ? 'border-[#1b2434] bg-[#0d1017]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-500" />
            <h2
              className={`text-sm font-semibold tracking-wide ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {timer ? 'Edit Timer' : 'New Timer'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isDark
                ? 'text-neutral-400 hover:text-white hover:bg-[#1a2332]'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {/* 1. Timer Name */}
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
                    className={`px-1.5 py-0.5 text-[10px] font-mono border rounded transition-colors cursor-pointer ${
                      isDark
                        ? 'bg-[#141c29] border-[#233147] hover:border-cyan-500/50 text-cyan-300 hover:bg-[#1a2638]'
                        : 'bg-white border-slate-300 hover:border-cyan-600 text-cyan-700 hover:bg-cyan-50'
                    }`}
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
          className={`flex items-center justify-end gap-2.5 px-4 py-2.5 border-t shrink-0 ${
            isDark ? 'border-[#1b2434] bg-[#0d1017]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              isDark
                ? 'text-neutral-400 hover:text-white hover:bg-[#1a2332]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md shadow-sm transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Save Timer
          </button>
        </div>
      </div>
    </div>
  );
};
