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
        isDark
          ? 'bg-[#111113] bg-[radial-gradient(120%_90%_at_50%_0%,#1e1e22_0%,#131316_58%,#0c0c0e_100%)] text-neutral-100'
          : 'bg-[#d8dfe9] text-slate-900'
      }`}
    >
      {children}
    </div>
  );
};
