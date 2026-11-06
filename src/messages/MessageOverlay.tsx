/**
 * Message Overlay shown on Presenter / Stage displays.
 */

import React from 'react';
import { StageMessage } from '../types';

interface MessageOverlayProps {
  message: StageMessage | null;
}

export const MessageOverlay: React.FC<MessageOverlayProps> = ({ message }) => {
  if (!message || !message.visible || !message.text) return null;

  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 max-w-[90vw] px-8 py-4 rounded-xl shadow-2xl border text-center transition-all duration-300 z-50 ${
        message.flash ? 'animate-pulse' : ''
      } ${
        message.urgent
          ? 'bg-red-950/90 border-red-500 text-white'
          : 'bg-[#181a20]/95 border-[#454c59] text-white'
      }`}
      style={message.color ? { borderColor: message.color } : undefined}
    >
      <div
        className="text-2xl md:text-4xl font-extrabold tracking-wider font-mono uppercase"
        style={message.color ? { color: message.color } : undefined}
      >
        {message.text}
      </div>
    </div>
  );
};
