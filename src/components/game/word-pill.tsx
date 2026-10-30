"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";
import { COLOR_VAR, PlayerDot } from "../ui/player-avatar";
import { cn } from "@/lib/client/cn";
import type { PlayerColor } from "@/lib/types";

export type PillSize = "hero" | "reveal" | "clue" | "chip";

const BASE_SIZE: Record<PillSize, string> = {
  hero: "clamp(2.6rem, 13vw, 5.25rem)",
  reveal: "clamp(1.45rem, 6.6vw, 2.15rem)",
  clue: "clamp(1.05rem, 4.6vw, 1.4rem)",
  chip: "0.95rem",
};

/** Long words shrink so a 24-letter answer still fits a 320px screen. */
export function wordFontSize(word: string, size: PillSize): string {
  const scale = Math.max(0.58, Math.min(1, 9 / Math.max(word.length, 1)));
  return scale === 1 ? BASE_SIZE[size] : `calc(${BASE_SIZE[size]} * ${scale.toFixed(3)})`;
}

export interface WordPillProps extends HTMLMotionProps<"div"> {
  word: string;
  color: PlayerColor;
  name?: string;
  size?: Exclude<PillSize, "hero">;
  emphasis?: "normal" | "match" | "quiet";
}

/**
 * A submitted word as an object: a lozenge of glass tinted in the player's
 * color, with their name and shape mark so identity never relies on color alone.
 */
export const WordPill = forwardRef<HTMLDivElement, WordPillProps>(function WordPill(
  { word, color, name, size = "reveal", emphasis = "normal", className, style, ...props },
  ref,
) {
  const c = COLOR_VAR[color];
  return (
    <motion.div
      ref={ref}
      data-emphasis={emphasis}
      className={cn(
        "glass glass-tint flex max-w-full flex-col items-center rounded-[26px] text-ink",
        size === "reveal" ? "px-5 pt-2.5 pb-3" : "px-4 pt-1.5 pb-2",
        className,
      )}
      style={{ "--tint": c.base, "--tint-deep": c.deep, ...style } as WordPillProps["style"]}
      {...props}
    >
      {name && (
        <span
          className={cn(
            "flex max-w-full items-center gap-1.5 font-medium text-ink-soft",
            size === "reveal" ? "text-[12px]" : "text-[11px]",
          )}
        >
          <PlayerDot color={color} size={size === "reveal" ? 9 : 8} />
          <span className="truncate">{name}</span>
        </span>
      )}
      <span
        className="word-type block max-w-full leading-[1.05] [overflow-wrap:anywhere]"
        style={{ fontSize: wordFontSize(word, size) }}
      >
        {word}
      </span>
    </motion.div>
  );
});
