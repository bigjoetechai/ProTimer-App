/**
 * Message Editor Modal for operators to broadcast cues to stage screens.
 * Fully supports Light and Dark themes.
 */

import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (isOpen && currentMessage) {
      setText(currentMessage.text || '');
      setFlash(currentMessage.flash ?? false);
      setUrgent(currentMessage.urgent ?? false);
      setColor(currentMessage.color || '#f97316');
    }
  }, [isOpen, currentMessage]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`glass-card w-full max-w-md rounded-[28px] overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'text-neutral-100' : 'text-slate-800'
      }`}>
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${
          isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-slate-200 bg-white/40'
        }`}>
          <h3 className="font-semibold text-sm tracking-wide flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>Stage / Presenter Message</span>
          </h3>
          <button
            onClick={onClose}
            className="glass-btn glass-btn-subtle w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-neutral-300' : 'text-slate-700'}`}>
              Message Content
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. WRAP UP PLEASE"
              autoFocus
              className="glass-input w-full px-3.5 py-2 rounded-xl text-sm font-mono uppercase tracking-wider focus:outline-hidden focus:border-cyan-400"
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
                  className="glass-btn glass-btn-subtle px-3 py-1 text-[11px] rounded-full cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className={`glass-subcard flex items-center gap-2 text-xs cursor-pointer p-2.5 rounded-xl ${
              isDark ? 'text-neutral-300' : 'text-slate-700'
            }`}>
              <input
                type="checkbox"
                checked={flash}
                onChange={(e) => setFlash(e.target.checked)}
                className="rounded border-neutral-600 text-amber-500"
              />
              <span>Flash text</span>
            </label>

            <label className={`glass-subcard flex items-center gap-2 text-xs cursor-pointer p-2.5 rounded-xl ${
              isDark ? 'text-neutral-300' : 'text-slate-700'
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
                    color === c ? 'scale-110 border-cyan-400 ring-2 ring-cyan-500/50' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className={`flex items-center justify-between pt-3 border-t ${
            isDark ? 'border-white/[0.08]' : 'border-slate-200'
          }`}>
            {currentMessage?.visible ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  onClose();
                }}
                className="glass-btn glass-btn-red glass-btn-subtle flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full cursor-pointer"
              >
                <EyeOff className="w-3.5 h-3.5" />
                Clear Display
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="glass-btn glass-btn-subtle px-4 py-1.5 text-xs rounded-full cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="glass-btn glass-btn-amber-active flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full cursor-pointer"
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
