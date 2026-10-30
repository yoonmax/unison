"use client";

import { useEffect, useState } from "react";

/** Server-corrected "now", re-rendering every `intervalMs` while `active`. */
export function useTicker(serverNow: () => number, intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(serverNow());
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [serverNow, intervalMs, active]);
  return now;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
