"use client";

import { useEffect, useState } from "react";

/**
 * The current wall-clock time, read only AFTER mount. Returns null on the
 * server and the first client render so nothing reads `Date.now()` during the
 * prerender (which `cacheComponents` forbids), then ticks on an interval to
 * keep relative times honest. Consumers render a stable fallback while it's
 * null.
 */
export function useClientNow(intervalMs = 15_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Syncing the wall clock into React after mount; it cannot be read during
    // render under cacheComponents.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
