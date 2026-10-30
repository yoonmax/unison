"use client";

import { Volume2, VolumeX, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSound } from "../providers";
import { IconButton } from "./button";
import { ease, spring } from "@/lib/client/motion";

// ---------------------------------------------------------------------------
// Screen-reader announcements (one polite region, written imperatively so
// announcing never re-renders the game).
// ---------------------------------------------------------------------------

const AnnounceContext = createContext<(message: string) => void>(() => {});

export function useAnnounce() {
  return useContext(AnnounceContext);
}

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = useCallback((message: string) => {
    const region = regionRef.current;
    if (!region) return;
    region.textContent = "";
    clearTimeout(timer.current);
    // A short gap makes repeated identical messages announce again.
    timer.current = setTimeout(() => {
      region.textContent = message;
    }, 60);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div ref={regionRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
    </AnnounceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Sound toggle
// ---------------------------------------------------------------------------

export function SoundToggle() {
  const { enabled, setEnabled } = useSound();
  return (
    <IconButton
      label={enabled ? "Mute sound" : "Unmute sound"}
      aria-pressed={!enabled}
      onClick={() => setEnabled(!enabled)}
      className="text-ink-soft"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={enabled ? "on" : "off"}
          initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 20 }}
          transition={spring.press}
          className="inline-flex"
        >
          {enabled ? (
            <Volume2 className="size-[19px]" strokeWidth={1.6} />
          ) : (
            <VolumeX className="size-[19px]" strokeWidth={1.6} />
          )}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}

// ---------------------------------------------------------------------------
// Reconnect banner
// ---------------------------------------------------------------------------

export function ReconnectBanner({ online }: { online: boolean }) {
  // Only show after a short grace period so a single dropped request doesn't flash.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(!online), online ? 0 : 1200);
    return () => clearTimeout(timer);
  }, [online]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center">
      <AnimatePresence>
        {visible && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={spring.soft}
            className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] text-paper shadow-lift"
          >
            <WifiOff className="size-3.5" strokeWidth={2} aria-hidden />
            Reconnecting…
            <span className="size-1.5 animate-pulse rounded-full bg-mint" aria-hidden />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export function Toast({ message, toastKey }: { message: string | null; toastKey: string | number | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            key={toastKey}
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.2, ease: ease.out } }}
            transition={spring.soft}
            className="max-w-[24rem] rounded-2xl bg-ink/92 px-4 py-3 text-center text-[14px] leading-snug text-paper shadow-lift backdrop-blur"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
