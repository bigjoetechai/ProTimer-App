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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div 
        className={`border rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors ${
          isDark ? 'bg-[#121620] border-[#222e42] text-white' : 'bg-white border-slate-300 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-[#1b2434] bg-[#0d1017]' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-500" />
            <h2 className={`text-base font-semibold tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {timer ? 'Edit Timer' : 'New Timer'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-[#1a2332]' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Timer Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Keynote Presentation, Worship Set, Q&A"
                className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-[#1e2a3c] rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                  Timer Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TimerType)}
                  className="w-full px-3 py-2 bg-[#0a0d14] border border-[#1e2a3c] rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="countdown">Countdown</option>
                  <option value="count_up">Count Up</option>
                  <option value="stopwatch">Stopwatch</option>
                  <option value="digital_clock">Digital Clock (Time of Day)</option>
                  <option value="meeting_timer">Meeting Timer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                  End Action (On Zero)
                </label>
                <select
                  value={endAction}
                  onChange={(e) => setEndAction(e.target.value as EndAction)}
                  className="w-full px-3 py-2 bg-[#0a0d14] border border-[#1e2a3c] rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="count_up">Overtime</option>
                  <option value="stop">Stop Timer</option>
                  <option value="next_timer">Start Next Cue Automatically (Chained)</option>
                  <option value="blackout">Blank Display Screen (Auto-Blackout)</option>
                  <option value="loop">Loop (Restart)</option>
                </select>
              </div>
            </div>

            {/* Scheduled Wall-Clock Start Automation */}
            <div className="bg-[#0a0d14] border border-[#1c2637] rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Timer Automation (Scheduled Wall-Clock Start)
                </span>
                <span className="text-[10px] text-cyan-400 font-mono">24-Hour Time (HH:MM:SS)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <input
                  type="time"
                  step="1"
                  value={scheduledStartTime}
                  onChange={(e) => setScheduledStartTime(e.target.value)}
                  placeholder="e.g. 10:30:00"
                  className="px-3 py-1.5 bg-[#121620] border border-[#233147] rounded-lg font-mono text-sm text-white focus:outline-none focus:border-cyan-500"
                />
                <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-[#161c28] border-neutral-700"
                  />
                  <span>Auto-start when scheduled time arrives</span>
                </label>
              </div>
            </div>
          </div>

          {/* 2. Duration Configuration */}
          <div className="bg-[#0a0d14] border border-[#1c2637] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Target Duration (HH : MM : SS)
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 5, 10, 15, 30].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => addPresetMinutes(mins)}
                    className="px-2 py-0.5 text-[11px] font-mono bg-[#141c29] border border-[#233147] hover:border-cyan-500/50 text-cyan-300 rounded hover:bg-[#1a2638] transition-colors"
                  >
                    +{mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="block text-[11px] text-neutral-500 font-mono mb-1">HOURS</span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-[#121620] border border-[#233147] rounded-lg font-mono text-center text-lg text-white font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <span className="block text-[11px] text-neutral-500 font-mono mb-1">MINUTES</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 bg-[#121620] border border-[#233147] rounded-lg font-mono text-center text-lg text-white font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <span className="block text-[11px] text-neutral-500 font-mono mb-1">SECONDS</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(e) => setSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 bg-[#121620] border border-[#233147] rounded-lg font-mono text-center text-lg text-white font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Alerts Configuration */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Alerts & Warnings
            </h3>

            {/* Alert 1 (Warning) */}
            <div className="bg-[#0a0d14] border border-[#1c2637] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alert1Enabled}
                    onChange={(e) => setAlert1Enabled(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-[#161c28] border-neutral-700"
                  />
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: alert1Color }} />
                    Alert 1 (Warning Threshold)
                  </span>
                </label>
              </div>

              {alert1Enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#161d2a]">
                  <div>
                    <span className="block text-[11px] text-neutral-400 font-mono mb-1">TRIGGER AT (MM:SS REMAINING)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={alert1Mins}
                        onChange={(e) => setAlert1Mins(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-20 px-2 py-1.5 bg-[#121620] border border-[#233147] rounded font-mono text-center text-sm text-white"
                      />
                      <span className="text-neutral-500 font-mono">:</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={alert1Secs}
                        onChange={(e) => setAlert1Secs(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        className="w-20 px-2 py-1.5 bg-[#121620] border border-[#233147] rounded font-mono text-center text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-[11px] text-neutral-400 font-mono">COLOR & EFFECTS</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setAlert1Color(c)}
                            className={`w-6 h-6 rounded-full border ${
                              alert1Color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-80'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={alert1Flash}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAlert1Flash(checked);
                            if (checked) setAlert1OnOff(false);
                          }}
                          className="w-3.5 h-3.5 rounded bg-[#161c28]"
                        />
                        Flash
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={alert1OnOff}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAlert1OnOff(checked);
                            if (checked) setAlert1Flash(false);
                          }}
                          className="w-3.5 h-3.5 rounded bg-[#161c28]"
                        />
                        On/Off
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Alert 2 (Danger) */}
            <div className="bg-[#0a0d14] border border-[#1c2637] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alert2Enabled}
                    onChange={(e) => setAlert2Enabled(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-[#161c28] border-neutral-700"
                  />
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: alert2Color }} />
                    Alert 2 (Danger Threshold)
                  </span>
                </label>
              </div>

              {alert2Enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#161d2a]">
                  <div>
                    <span className="block text-[11px] text-neutral-400 font-mono mb-1">TRIGGER AT (MM:SS REMAINING)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={alert2Mins}
                        onChange={(e) => setAlert2Mins(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-20 px-2 py-1.5 bg-[#121620] border border-[#233147] rounded font-mono text-center text-sm text-white"
                      />
                      <span className="text-neutral-500 font-mono">:</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={alert2Secs}
                        onChange={(e) => setAlert2Secs(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        className="w-20 px-2 py-1.5 bg-[#121620] border border-[#233147] rounded font-mono text-center text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-[11px] text-neutral-400 font-mono">COLOR & EFFECTS</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setAlert2Color(c)}
                            className={`w-6 h-6 rounded-full border ${
                              alert2Color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-80'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={alert2Flash}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAlert2Flash(checked);
                            if (checked) setAlert2OnOff(false);
                          }}
                          className="w-3.5 h-3.5 rounded bg-[#161c28]"
                        />
                        Flash
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={alert2OnOff}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAlert2OnOff(checked);
                            if (checked) setAlert2Flash(false);
                          }}
                          className="w-3.5 h-3.5 rounded bg-[#161c28]"
                        />
                        On/Off
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${
          isDark ? 'border-[#1b2434] bg-[#0d1017]' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-[#1a2332]' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-md transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Save Timer
          </button>
        </div>
      </div>
    </div>
  );
};
