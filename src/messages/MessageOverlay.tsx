/**
 * Message Overlay shown on Fullscreen, Presenter, Preview, Multi FS, NDI, and Stage displays.
 * Respects Sizes & Positions configuration for the "Message" element:
 * - Visible toggle
 * - Location ('Top', 'Middle', 'Bottom')
 * - Vert & Horiz offset
 * - Size % scaling
 * - Font family & Font style ('Normal', 'Bold', 'Italic', 'Bold Italic')
 */

import React from 'react';
import { SizesPositionElementConfig, StageMessage } from '../types';
import { getElementStyle } from '../utilities/displayStyleHelper';

interface MessageOverlayProps {
  message: StageMessage | null;
  config?: SizesPositionElementConfig;
  compact?: boolean;
  textShadow?: string;
}

export const MessageOverlay: React.FC<MessageOverlayProps> = ({
  message,
  config,
  compact = false,
  textShadow,
}) => {
  if (!message || !message.visible || !message.text) return null;
  if (config && config.visible === false) return null;

  const location = config?.location || 'Top';
  const positionCls =
    location === 'Top'
      ? compact
        ? 'top-9'
        : 'top-8'
      : location === 'Middle'
      ? 'top-1/2 -translate-y-1/2'
      : compact
      ? 'bottom-8'
      : 'bottom-8';

  const baseFontPx = compact ? 14 : 34;
  const textStyle = getElementStyle(config, {
    baseFontSizePx: baseFontPx,
    defaultSizePercent: 33,
    pxPerOffsetUnit: compact ? 1.5 : 3.5,
    textShadow,
    color: message.color || '#ffffff',
  });

  return (
    <div
      className={`fixed ${positionCls} left-1/2 -translate-x-1/2 max-w-[92vw] ${
        compact ? 'px-3 py-1.5 rounded-lg' : 'px-8 py-4 rounded-xl'
      } shadow-2xl border text-center transition-all duration-300 z-50 pointer-events-none ${
        message.flash ? 'animate-pulse' : ''
      } ${
        message.urgent
          ? 'bg-red-950/90 border-red-500 text-white'
          : 'bg-[#181a20]/95 border-[#454c59] text-white'
      }`}
      style={{
        ...(message.color ? { borderColor: message.color } : {}),
        ...(textStyle.transform
          ? { transform: `translate(-50%, ${location === 'Middle' ? '-50%' : '0'}) ${textStyle.transform}` }
          : {}),
      }}
    >
      <div
        className="tracking-wider uppercase leading-snug"
        style={{
          fontFamily: textStyle.fontFamily,
          fontWeight: textStyle.fontWeight,
          fontStyle: textStyle.fontStyle,
          fontSize: textStyle.fontSize,
          color: textStyle.color,
          textShadow: textStyle.textShadow,
        }}
      >
        {message.text}
      </div>
    </div>
  );
};
