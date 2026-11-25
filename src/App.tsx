/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useCallback } from 'react';
import { MainConsolePage, DisplayPage } from './pages';
import { DisplayTarget } from './types';
import { ThemeProvider } from './context';
import { LaunchSplash } from './components/LaunchSplash';

export default function App() {
  // Parse display query param for multi-window / multi-monitor secondary screens
  const displayTarget = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('display') as DisplayTarget | null;
    return target;
  }, []);

  const [showLaunchSplash, setShowLaunchSplash] = useState<boolean>(() => !displayTarget);

  const handleSplashComplete = useCallback(() => {
    setShowLaunchSplash(false);
  }, []);

  return (
    <ThemeProvider>
      {displayTarget ? (
        <DisplayPage target={displayTarget} />
      ) : (
        <>
          <MainConsolePage />
          {showLaunchSplash && <LaunchSplash onComplete={handleSplashComplete} />}
        </>
      )}
    </ThemeProvider>
  );
}
