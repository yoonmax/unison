"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AmbientBackground } from "../ambient-background";
import { UnisonWordmark } from "../unison-wordmark";
import { ease } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";

/** Full-screen message: room not found, full, in progress, removed, errors. */
export function StatusScreen({
  title,
  message,
  actions,
  orb = "lavender",
}: {
  title: string;
  message?: ReactNode;
  actions?: ReactNode;
  orb?: "lavender" | "peach" | "mint" | "sky";
}) {
  return (
    <main className="safe-x safe-top safe-bottom relative flex min-h-dvh flex-col items-center">
      <AmbientBackground intensity="quiet" />
      <header className="relative z-10 flex w-full max-w-[34rem] items-center py-2">
        <Link href="/" className="rounded-lg px-1" aria-label="Unison home">
          <UnisonWordmark size="small" />
        </Link>
      </header>
      <motion.section
        className="relative z-10 flex w-full max-w-[24rem] flex-1 flex-col items-center justify-center pb-[12vh] text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: ease.out }}
      >
        <BreathingOrb color={orb} />
        <h1 className="font-display mt-8 text-[clamp(1.75rem,7vw,2.25rem)] font-[540] leading-tight tracking-[-0.025em] text-balance">
          {title}
        </h1>
        {message && <div className="mt-3 text-[16px] leading-relaxed text-ink-soft text-balance">{message}</div>}
        {actions && <div className="mt-8 flex w-full flex-col gap-3">{actions}</div>}
      </motion.section>
    </main>
  );
}

export function BreathingOrb({ color = "lavender", className }: { color?: string; className?: string }) {
  return (
    <span aria-hidden className={cn("relative block size-16", className)}>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 30%, white, var(--color-${color}) 70%)`,
          animation: "breathe 3.2s var(--ease-in-out-soft) infinite",
        }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 0 1px var(--color-${color})`, animation: "pulse-ring 3.2s var(--ease-soft) infinite" }}
      />
    </span>
  );
}
