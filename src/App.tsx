/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { MainConsolePage, DisplayPage } from './pages';
import { DisplayTarget } from './types';
import { ThemeProvider } from './context';

export default function App() {
  // Parse display query param for multi-window / multi-monitor secondary screens
  const displayTarget = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('display') as DisplayTarget | null;
    return target;
  }, []);

  return (
    <ThemeProvider>
      {displayTarget ? <DisplayPage target={displayTarget} /> : <MainConsolePage />}
    </ThemeProvider>
  );
}
