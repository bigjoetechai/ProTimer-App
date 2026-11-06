/**
 * Settings / Preferences Modal.
 * Supports Dark and Light theme switching and live system configuration.
 */

import React, { useState } from 'react';
import { X, Volume2, Moon, Sun, RefreshCw, Check } from 'lucide-react';
import { AppPreferences, DEFAULT_PREFERENCES } from '../types';
import { audioController } from '../audio';
import { useTheme } from '../hooks';

interface SettingsModalProps {
  isOpen: boolean;
  preferences: AppPreferences;
  onClose: () => void;
  onSave: (prefs: AppPreferences) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  preferences,
  onClose,
  onSave,
}) => {
  const { isDark, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<AppPreferences>(preferences);
  const [activeTab, setActiveTab] = useState<'general' | 'alerts' | 'hotkeys'>('general');

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(prefs);
    if (prefs.theme) {
      setTheme(prefs.theme);
    }
    audioController.setMuted(!prefs.soundAlertsEnabled);
    onClose();
  };

  const handleTestAudio = () => {
    audioController.setMuted(false);
    audioController.playWarningChime();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div 
        className={`w-full max-w-lg border rounded-lg shadow-2xl overflow-hidden transition-colors duration-150 animate-in fade-in zoom-in-95 ${
          isDark 
            ? 'bg-[#181a20] border-[#2d3139] text-neutral-100' 
            : 'bg-white border-slate-300 text-slate-800'
        }`}
      >
        <div 
          className={`flex items-center justify-between px-5 py-3.5 border-b ${
            isDark ? 'border-[#2d3139] bg-[#121418]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-sm tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>
              ProTimer Preferences & System Configuration
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded transition-colors ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div 
          className={`flex border-b px-5 gap-4 text-xs font-medium ${
            isDark ? 'border-[#2d3139] bg-[#14161b]' : 'border-slate-200 bg-slate-100/70'
          }`}
        >
          <button
            onClick={() => setActiveTab('general')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'general' 
                ? 'border-cyan-500 text-cyan-500 font-semibold' 
                : isDark ? 'border-transparent text-neutral-400 hover:text-neutral-200' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            General & Timing
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'alerts' 
                ? 'border-cyan-500 text-cyan-500 font-semibold' 
                : isDark ? 'border-transparent text-neutral-400 hover:text-neutral-200' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Audio & Alerts
          </button>
          <button
            onClick={() => setActiveTab('hotkeys')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'hotkeys' 
                ? 'border-cyan-500 text-cyan-500 font-semibold' 
                : isDark ? 'border-transparent text-neutral-400 hover:text-neutral-200' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Hotkeys
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
          {activeTab === 'general' && (
            <div className="space-y-4 text-xs">
              {/* Theme Selector */}
              <div>
                <label className={`block font-medium mb-1.5 ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                  Theme Appearance
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPrefs({ ...prefs, theme: 'dark' });
                      setTheme('dark');
                    }}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded border text-xs font-medium transition-all cursor-pointer ${
                      (prefs.theme === 'dark' || (!prefs.theme && isDark))
                        ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400 ring-1 ring-cyan-500'
                        : isDark
                        ? 'bg-[#121620] border-[#2c3749] text-neutral-300 hover:bg-[#1a2233]'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-cyan-400" />
                    <span>Dark Theme (Studio Pro)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPrefs({ ...prefs, theme: 'light' });
                      setTheme('light');
                    }}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded border text-xs font-medium transition-all cursor-pointer ${
                      prefs.theme === 'light'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 ring-1 ring-amber-500'
                        : isDark
                        ? 'bg-[#121620] border-[#2c3749] text-neutral-300 hover:bg-[#1a2233]'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Light Theme (Daylight)</span>
                  </button>
                </div>
                <span className={`text-[11px] mt-1 block ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
                  Instant toggle available anytime in the top right menu bar.
                </span>
              </div>

              <div>
                <label className={`block font-medium mb-1 ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                  Default Countdown Duration (seconds)
                </label>
                <input
                  type="number"
                  value={prefs.defaultDurationSeconds}
                  onChange={(e) => setPrefs({ ...prefs, defaultDurationSeconds: Number(e.target.value) })}
                  className={`w-full px-3 py-1.5 border rounded font-mono ${
                    isDark 
                      ? 'bg-[#0c0d10] border-[#373c46] text-white' 
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
                <span className={`text-[11px] mt-0.5 block ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
                  Default duration when clicking + to add a new timer (e.g. 600 = 10 mins).
                </span>
              </div>

              <div>
                <label className={`block font-medium mb-1 ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                  Time of Day Clock Display
                </label>
                <select
                  value={prefs.timeFormat24h ? '24' : '12'}
                  onChange={(e) => setPrefs({ ...prefs, timeFormat24h: e.target.value === '24' })}
                  className={`w-full px-3 py-1.5 border rounded ${
                    isDark 
                      ? 'bg-[#0c0d10] border-[#373c46] text-white' 
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="24">24-Hour Format (14:30:00)</option>
                  <option value="12">12-Hour Format (02:30:00 PM)</option>
                </select>
              </div>

              <div>
                <label className={`block font-medium mb-1 ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                  Display Sync Channel
                </label>
                <input
                  type="text"
                  value={prefs.syncChannelName}
                  onChange={(e) => setPrefs({ ...prefs, syncChannelName: e.target.value })}
                  className={`w-full px-3 py-1.5 border rounded font-mono ${
                    isDark 
                      ? 'bg-[#0c0d10] border-[#373c46] text-white' 
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
                <span className={`text-[11px] mt-0.5 block ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
                  Broadcast channel ID used to pair Presenter, Stage, and Preview windows.
                </span>
              </div>

              <div className="pt-2">
                <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                  <input
                    type="checkbox"
                    checked={prefs.autoCueNext}
                    onChange={(e) => setPrefs({ ...prefs, autoCueNext: e.target.checked })}
                    className="rounded border-neutral-600 text-cyan-500"
                  />
                  <span>Automatically Cue Next Timer when current timer finishes</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-4 text-xs">
              <div 
                className={`p-3 border rounded space-y-3 ${
                  isDark ? 'bg-[#111317] border-[#2d3139]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${isDark ? 'text-neutral-200' : 'text-slate-800'}`}>
                    Acoustic Audio Cues
                  </span>
                  <button
                    type="button"
                    onClick={handleTestAudio}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                      isDark 
                        ? 'bg-[#232730] hover:bg-[#2d3340] text-cyan-400 border-[#373c46]' 
                        : 'bg-slate-200 hover:bg-slate-300 text-cyan-700 border-slate-300'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Test Sound
                  </button>
                </div>

                <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                  <input
                    type="checkbox"
                    checked={prefs.soundAlertsEnabled}
                    onChange={(e) => setPrefs({ ...prefs, soundAlertsEnabled: e.target.checked })}
                    className="rounded border-neutral-600 text-cyan-500"
                  />
                  <span>Enable internal audio synthesizer beeps (Offline Web Audio)</span>
                </label>

                <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
                  <input
                    type="checkbox"
                    checked={prefs.flashAlertsEnabled}
                    onChange={(e) => setPrefs({ ...prefs, flashAlertsEnabled: e.target.checked })}
                    className="rounded border-neutral-600 text-cyan-500"
                  />
                  <span>Enable flashing visual warning indicator on displays</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-amber-500 font-medium mb-1">Default Warning Threshold (sec)</label>
                  <input
                    type="number"
                    value={prefs.defaultWarningSeconds}
                    onChange={(e) => setPrefs({ ...prefs, defaultWarningSeconds: Number(e.target.value) })}
                    className={`w-full px-3 py-1.5 border rounded font-mono ${
                      isDark ? 'bg-[#0c0d10] border-[#373c46] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-red-500 font-medium mb-1">Default Danger Threshold (sec)</label>
                  <input
                    type="number"
                    value={prefs.defaultDangerSeconds}
                    onChange={(e) => setPrefs({ ...prefs, defaultDangerSeconds: Number(e.target.value) })}
                    className={`w-full px-3 py-1.5 border rounded font-mono ${
                      isDark ? 'bg-[#0c0d10] border-[#373c46] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hotkeys' && (
            <div className="space-y-2 text-xs">
              <span className={`block mb-2 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                Production Operator Keyboard Shortcuts:
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'Space', action: 'Start / Pause Active Timer' },
                  { key: 'Escape', action: 'Stop & Reset Active Timer' },
                  { key: 'R', action: 'Restart Active Timer' },
                  { key: 'C', action: 'Cue Next Timer in List' },
                  { key: 'Shift + C', action: 'Cue Previous Timer' },
                  { key: '+', action: 'Add 1 Minute (+60s)' },
                  { key: '-', action: 'Subtract 1 Minute (-60s)' },
                  { key: 'H', action: 'Toggle Display Blackout / Hide' },
                  { key: 'M', action: 'Open Message Broadcast Modal' },
                  { key: 'F11', action: 'Application Fullscreen (Mode A)' },
                ].map((item) => (
                  <div 
                    key={item.key} 
                    className={`flex items-center justify-between p-2 border rounded ${
                      isDark ? 'bg-[#121418] border-[#2d3139]' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span className={isDark ? 'text-neutral-300' : 'text-slate-700'}>{item.action}</span>
                    <kbd 
                      className={`px-1.5 py-0.5 border rounded font-mono text-[11px] ${
                        isDark 
                          ? 'bg-[#252830] text-cyan-400 border-neutral-700' 
                          : 'bg-slate-200 text-cyan-800 border-slate-300'
                      }`}
                    >
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div 
          className={`flex items-center justify-between px-5 py-3 border-t ${
            isDark ? 'border-[#2d3139] bg-[#121418]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setPrefs(DEFAULT_PREFERENCES);
              setTheme('dark');
            }}
            className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer ${
                isDark ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
