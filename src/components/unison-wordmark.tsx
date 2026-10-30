"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect } from "react";
import { COLOR_VAR } from "./ui/player-avatar";
import { cn } from "@/lib/client/cn";

const DOT_COLORS = ["lavender", "mint", "peach", "sky"] as const;
// Where the four minds start before converging into the dot of the "i" (in em).
const START_OFFSETS = [
  { x: -1.6, y: -0.55 },
  { x: 1.35, y: -0.85 },
  { x: -0.9, y: 0.25 },
  { x: 1.9, y: 0.05 },
];

const BLEND = `conic-gradient(from 210deg, ${DOT_COLORS.map((c) => COLOR_VAR[c].base).join(", ")}, ${COLOR_VAR.lavender.base})`;

/**
 * "unison" — the tittle of the i is four colored minds that drift together and
 * settle into one dot. On desktop the dot leans gently toward the pointer.
 */
export function UnisonWordmark({ size = "hero", className }: { size?: "hero" | "small"; className?: string }) {
  const reduced = useReducedMotion();
  const animated = size === "hero" && !reduced;
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 80, damping: 14 });
  const y = useSpring(py, { stiffness: 80, damping: 14 });

  useEffect(() => {
    if (!animated || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      px.set(((e.clientX / window.innerWidth) * 2 - 1) * 4);
      py.set(((e.clientY / window.innerHeight) * 2 - 1) * 3);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [animated, px, py]);

  return (
    <span
      role="img"
      aria-label="Unison"
      className={cn(
        "font-display inline-flex items-baseline leading-none tracking-[-0.045em] text-ink select-none",
        size === "hero" ? "text-[clamp(4.25rem,19vw,8.5rem)] font-[480]" : "text-[1.6rem] font-[520]",
        className,
      )}
      style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1, "opsz" 144' }}
    >
      <span aria-hidden>un</span>
      <span aria-hidden className="relative inline-block">
        {"ı"}
        <motion.span
          className="absolute left-1/2 top-[0.255em] block"
          style={{ x: animated ? x : 0, y: animated ? y : 0 }}
        >
          {animated ? (
            <>
              {DOT_COLORS.map((color, i) => (
                <motion.span
                  key={color}
                  className="absolute block size-[0.15em] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-multiply"
                  style={{ backgroundColor: COLOR_VAR[color].base, left: 0, top: 0 }}
                  initial={{ x: `${START_OFFSETS[i].x}em`, y: `${START_OFFSETS[i].y}em`, opacity: 0, scale: 0.6 }}
                  animate={{ x: "0em", y: "0em", opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.9] }}
                  transition={{
                    x: { type: "spring", stiffness: 38, damping: 11, delay: 0.25 + i * 0.12 },
                    y: { type: "spring", stiffness: 38, damping: 11, delay: 0.25 + i * 0.12 },
                    opacity: { duration: 2.6, times: [0, 0.12, 0.85, 1], delay: 0.25 },
                    scale: { duration: 2.6, times: [0, 0.12, 0.85, 1], delay: 0.25 },
                  }}
                />
              ))}
              <motion.span
                className="absolute block size-[0.17em] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: BLEND, left: 0, top: 0 }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2.35, type: "spring", stiffness: 260, damping: 14 }}
              />
            </>
          ) : (
            <span
              className="absolute block size-[0.17em] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: BLEND, left: 0, top: 0 }}
            />
          )}
        </motion.span>
      </span>
      <span aria-hidden>son</span>
    </span>
  );
}
