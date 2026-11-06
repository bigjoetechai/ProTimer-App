/**
 * Main Application Layout for the ProTimer operator interface.
 * Responds to Light and Dark themes dynamically.
 */

import React from 'react';
import { useTheme } from '../hooks';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { isDark } = useTheme();

  return (
    <div 
      className={`h-screen w-screen min-w-[1000px] min-h-[650px] flex flex-col font-sans antialiased overflow-hidden select-none relative transition-colors duration-150 ${
        isDark ? 'bg-[#0d0e12] text-neutral-100' : 'bg-[#f4f6fa] text-slate-900'
      }`}
    >
      {children}
    </div>
  );
};
