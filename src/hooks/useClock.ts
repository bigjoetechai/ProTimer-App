/**
 * Real-time system clock hook formatted for 12/24h broadcast displays.
 */

import { useState, useEffect } from 'react';
import { formatClock } from '../utilities/timeFormatters';

export function useClock(is24h: boolean = true) {
  const [timeStr, setTimeStr] = useState(() => formatClock(new Date(), is24h));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(formatClock(new Date(), is24h));
    }, 1000);

    return () => clearInterval(timer);
  }, [is24h]);

  return timeStr;
}
