"use client";

import { motion } from "motion/react";
import type { PlayerColor } from "@/lib/types";
import { spring } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";

// Hex values (mirroring the CSS tokens) so Motion can interpolate fills.
export const COLOR_VAR: Record<PlayerColor, { base: string; tint: string; deep: string }> = {
  lavender: { base: "#a99bea", tint: "#ece8fb", deep: "#5a4bb3" },
  mint: { base: "#95d7c1", tint: "#e1f3ec", deep: "#2c7259" },
  peach: { base: "#f4b9a5", tint: "#fcebe4", deep: "#a14f35" },
  sky: { base: "#a8c8ee", tint: "#e5eefa", deep: "#36659e" },
  butter: { base: "#f0da93", tint: "#faf3da", deep: "#85691a" },
};

/**
 * Each color also has its own shape, so identity never depends on color
 * alone: lavender circle, mint squircle, peach flower, sky diamond, butter hexagon.
 */
function Shape({ color, fill, stroke }: { color: PlayerColor; fill: string; stroke: string }) {
  const common = { fill, stroke, strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };
  switch (color) {
    case "lavender":
      return <motion.circle cx="20" cy="20" r="17.5" initial={false} animate={{ fill }} {...common} />;
    case "mint":
      return <motion.rect x="3" y="3" width="34" height="34" rx="12" initial={false} animate={{ fill }} {...common} />;
    case "peach":
      return (
        <motion.path
          d="M11 11A9 9 0 1 1 29 11A9 9 0 1 1 29 29A9 9 0 1 1 11 29A9 9 0 1 1 11 11Z"
          initial={false}
          animate={{ fill }}
          {...common}
        />
      );
    case "sky":
      return (
        <motion.rect
          x="7.5"
          y="7.5"
          width="25"
          height="25"
          rx="7"
          transform="rotate(45 20 20)"
          initial={false}
          animate={{ fill }}
          {...common}
        />
      );
    case "butter":
      return (
        <motion.path
          d="M14.6 4.6h10.8a5 5 0 0 1 4.33 2.5l5.4 9.4a5 5 0 0 1 0 5l-5.4 9.4a5 5 0 0 1-4.33 2.5H14.6a5 5 0 0 1-4.33-2.5l-5.4-9.4a5 5 0 0 1 0-5l5.4-9.4a5 5 0 0 1 4.33-2.5Z"
          initial={false}
          animate={{ fill }}
          {...common}
        />
      );
  }
}

export interface PlayerAvatarProps {
  name: string;
  color: PlayerColor;
  size?: number;
  /** Filled with full color (e.g. answer locked in). */
  filled?: boolean;
  dimmed?: boolean;
  className?: string;
}

export function PlayerAvatar({ name, color, size = 40, filled = true, dimmed, className }: PlayerAvatarProps) {
  const c = COLOR_VAR[color];
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <motion.span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      animate={{ opacity: dimmed ? 0.45 : 1, scale: filled ? 1 : 0.94 }}
      transition={spring.soft}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" width={size} height={size} className="absolute inset-0 overflow-visible">
        <Shape color={color} fill={filled ? c.base : c.tint} stroke={filled ? c.base : c.base} />
      </svg>
      <span
        className="font-display relative font-semibold text-ink"
        style={{ fontSize: Math.round(size * 0.4), lineHeight: 1 }}
      >
        {initial}
      </span>
    </motion.span>
  );
}

/** A tiny color+shape mark, used beside words. */
export function PlayerDot({ color, size = 10 }: { color: PlayerColor; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="shrink-0 overflow-visible">
      <Shape color={color} fill={COLOR_VAR[color].base} stroke={COLOR_VAR[color].base} />
    </svg>
  );
}
