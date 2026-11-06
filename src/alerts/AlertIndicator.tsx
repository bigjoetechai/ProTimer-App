/**
 * Alert Indicator UI Component.
 * Displays warning and danger banners or flashing indicators.
 */

import React from 'react';
import { AlertTriangle, Bell } from 'lucide-react';

interface AlertIndicatorProps {
  level: 'none' | 'warning' | 'danger' | 'custom';
  color?: string;
  flash?: boolean;
  label?: string;
}

export const AlertIndicator: React.FC<AlertIndicatorProps> = ({
  level,
  color,
  flash = false,
  label,
}) => {
  if (level === 'none') return null;

  const isDanger = level === 'danger';
  const effectiveColor = color || (isDanger ? '#ef4444' : '#eab308');

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold tracking-wide border transition-all ${
        flash ? 'animate-pulse' : ''
      }`}
      style={{
        borderColor: `${effectiveColor}80`,
        backgroundColor: `${effectiveColor}25`,
        color: effectiveColor,
      }}
    >
      {isDanger ? (
        <AlertTriangle className="w-3.5 h-3.5" />
      ) : (
        <Bell className="w-3.5 h-3.5" />
      )}
      <span>{label || (isDanger ? 'CRITICAL TIME' : 'ACTIVE ALERT')}</span>
    </div>
  );
};
