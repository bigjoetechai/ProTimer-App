/**
 * Message Editor Modal for operators to broadcast cues to stage screens.
 * Fully supports Light and Dark themes.
 */

import React, { useState } from 'react';
import { X, Send, EyeOff, AlertCircle } from 'lucide-react';
import { StageMessage } from '../types';
import { useTheme } from '../hooks';

interface MessageEditorModalProps {
  isOpen: boolean;
  currentMessage: StageMessage | null;
  onClose: () => void;
  onSave: (msg: Partial<StageMessage>) => void;
  onClear: () => void;
}

const PRESET_MESSAGES = [
  'WRAP UP PLEASE',
  '5 MINUTES REMAINING',
  'CHECK MICROPHONE',
  'STANDBY ON STAGE',
  'TIME EXPIRED',
  'AUDIENCE Q&A START',
];

export const MessageEditorModal: React.FC<MessageEditorModalProps> = ({
  isOpen,
  currentMessage,
  onClose,
  onSave,
  onClear,
}) => {
  const { isDark } = useTheme();
  const [text, setText] = useState(currentMessage?.text || '');
  const [flash, setFlash] = useState(currentMessage?.flash ?? false);
  const [urgent, setUrgent] = useState(currentMessage?.urgent ?? false);
  const [color, setColor] = useState(currentMessage?.color || '#f97316');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({
      text: text.trim().toUpperCase(),
      flash,
      urgent,
      color,
      visible: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className={`w-full max-w-md rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border ${
        isDark ? 'bg-[#181a20] border-[#2d3139] text-neutral-100' : 'bg-white border-slate-300 text-slate-800'
      }`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${
          isDark ? 'border-[#2d3139] bg-[#121418]' : 'border-slate-200 bg-slate-50'
        }`}>
          <h3 className="font-semibold text-sm tracking-wide flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span>Stage / Presenter Message</span>
          </h3>
          <button
            onClick={onClose}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
              Message Content
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. WRAP UP PLEASE"
              autoFocus
              className={`w-full px-3 py-2 rounded text-sm font-mono uppercase tracking-wider focus:outline-hidden focus:border-cyan-500 border ${
                isDark 
                  ? 'bg-[#0c0d10] border-[#373c46] text-white placeholder-neutral-500' 
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
              Quick Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MESSAGES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setText(preset)}
                  className={`px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-[#232730] hover:bg-[#2e3340] text-neutral-300 border-[#373c46]'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <label className={`flex items-center gap-2 text-xs cursor-pointer p-2.5 rounded border ${
              isDark ? 'bg-[#121418] border-[#2d3139] text-neutral-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <input
                type="checkbox"
                checked={flash}
                onChange={(e) => setFlash(e.target.checked)}
                className="rounded border-neutral-600 text-amber-500"
              />
              <span>Flash text</span>
            </label>

            <label className={`flex items-center gap-2 text-xs cursor-pointer p-2.5 rounded border ${
              isDark ? 'bg-[#121418] border-[#2d3139] text-neutral-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="rounded border-neutral-600 text-red-500"
              />
              <span>Urgent banner</span>
            </label>
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
              Accent Color
            </label>
            <div className="flex items-center gap-2">
              {['#f97316', '#ef4444', '#eab308', '#06b6d4', '#ffffff'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                    color === c ? 'scale-110 border-cyan-500 ring-2 ring-cyan-500/50' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className={`flex items-center justify-between pt-3 border-t ${
            isDark ? 'border-[#2d3139]' : 'border-slate-200'
          }`}>
            {currentMessage?.visible ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  onClose();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
                  isDark
                    ? 'text-neutral-400 hover:text-red-400 hover:bg-red-950/30 border-neutral-700 hover:border-red-800'
                    : 'text-slate-600 hover:text-red-600 hover:bg-red-50 border-slate-300 hover:border-red-300'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                Clear Display
              </button>
            ) : <div />}

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
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Broadcast to Stage
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
