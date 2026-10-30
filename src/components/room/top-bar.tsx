"use client";

import { DoorOpen, Flag, Link2, MoreHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { UnisonWordmark } from "../unison-wordmark";
import { IconButton } from "../ui/button";
import { SoundToggle } from "../ui/feedback";
import { inviteUrl } from "./lobby-view";
import { spring } from "@/lib/client/motion";
import { formatDuration, useTicker } from "@/lib/client/use-ticker";

function Elapsed({
  startedAt,
  serverNow,
  frozenAt,
}: {
  startedAt: string;
  serverNow: () => number;
  frozenAt: string | null;
}) {
  const now = useTicker(serverNow, 1000, !frozenAt);
  const end = frozenAt ? Date.parse(frozenAt) : now;
  return (
    <span className="tabular-nums" aria-label="Time elapsed">
      {formatDuration(end - Date.parse(startedAt))}
    </span>
  );
}

export function TopBar({
  code,
  round,
  startedAt,
  completedAt,
  serverNow,
  canEnd,
  onEnd,
  onLeave,
}: {
  code: string;
  round: number | null;
  startedAt: string | null;
  completedAt: string | null;
  serverNow: () => number;
  canEnd: boolean;
  onEnd: () => void;
  onLeave: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setMenuOpen(false);
      }, 900);
    } catch {
      setMenuOpen(false);
    }
  }

  const item =
    "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[14.5px] text-ink transition-colors hover:bg-ink/5 focus-visible:bg-ink/5";

  return (
    <header className="flex h-14 w-full items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-3">
        {/* On the narrowest phones the round info wins the space during a game. */}
        <span className={round !== null ? "hidden min-[390px]:inline-flex" : "inline-flex"}>
          <UnisonWordmark size="small" />
        </span>
        <span className="shrink-0 rounded-full bg-ink/[0.05] px-2.5 py-1 font-display text-[13px] font-[600] tracking-[0.16em] text-ink-soft">
          {code}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {round !== null && startedAt && (
          <p className="mr-1 flex items-baseline gap-2 text-[13px] whitespace-nowrap text-ink-soft" aria-live="polite">
            <span className="font-medium text-ink">Round {round}</span>
            <span className="text-ink-faint">
              <Elapsed startedAt={startedAt} serverNow={serverNow} frozenAt={completedAt} />
            </span>
          </p>
        )}
        <SoundToggle />
        <div className="relative" ref={wrapRef}>
          <IconButton
            label="Room menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((o) => !o)}
            className="text-ink-soft"
          >
            <MoreHorizontal className="size-5" strokeWidth={1.7} />
          </IconButton>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                id={menuId}
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.15 } }}
                transition={spring.press}
                className="absolute top-12 right-0 z-30 w-56 origin-top-right rounded-2xl bg-card p-1.5 shadow-lift ring-1 ring-line"
              >
                <button role="menuitem" className={item} onClick={copyLink}>
                  <Link2 className="size-4 text-ink-soft" strokeWidth={1.8} aria-hidden />
                  {copied ? "Link copied" : "Copy invite link"}
                </button>
                {canEnd && (
                  <button
                    role="menuitem"
                    className={item}
                    onClick={() => {
                      setMenuOpen(false);
                      onEnd();
                    }}
                  >
                    <Flag className="size-4 text-ink-soft" strokeWidth={1.8} aria-hidden />
                    End game for everyone
                  </button>
                )}
                <button
                  role="menuitem"
                  className={item}
                  onClick={() => {
                    setMenuOpen(false);
                    onLeave();
                  }}
                >
                  <DoorOpen className="size-4 text-ink-soft" strokeWidth={1.8} aria-hidden />
                  Leave room
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
