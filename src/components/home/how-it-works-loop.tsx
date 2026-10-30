"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import { COLOR_VAR } from "../ui/player-avatar";
import { spring } from "@/lib/client/motion";
import type { PlayerColor } from "@/lib/types";

const COLORS: PlayerColor[] = ["lavender", "mint", "peach"];
const ROUNDS = [
  ["BEACH", "WATER", "FISH"],
  ["SEA", "BLUE", "SEA"],
  ["OCEAN", "OCEAN", "OCEAN"],
];
const STEP_MS = 2300;

/** A tiny, looping illustration of a game: three minds converging on OCEAN. */
export function HowItWorksLoop({ paused }: { paused?: boolean }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(reduced ? 3 : 0);

  useEffect(() => {
    if (reduced || paused) return;
    const timer = setTimeout(() => setStep((s) => (s + 1) % 5), step === 3 ? STEP_MS * 1.6 : STEP_MS);
    return () => clearTimeout(timer);
  }, [step, reduced, paused]);

  const merged = step === 3;
  const words = step < 3 ? ROUNDS[step] : ROUNDS[2];
  const visible = step !== 4;

  return (
    <div aria-hidden className="flex h-16 items-center justify-center">
      <LayoutGroup>
        <AnimatePresence mode="popLayout">
          {visible &&
            (merged ? (
              <motion.span
                key="merged"
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={spring.settle}
                className="glass glass-ink word-type rounded-full px-5 py-2 text-[15px]"
              >
                OCEAN
              </motion.span>
            ) : (
              <motion.div key="row" layout className="flex items-center gap-2" exit={{ opacity: 0 }}>
                {words.map((word, i) => {
                  const match = words.filter((w) => w === word).length > 1;
                  return (
                    <motion.span
                      layout
                      key={`${step}-${i}`}
                      initial={{ opacity: 0, y: 10, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.9 }}
                      transition={{ ...spring.soft, delay: i * 0.09 }}
                      className="glass glass-tint word-type rounded-full px-3.5 py-1.5 text-[13px] text-ink"
                      data-emphasis={match ? "match" : "normal"}
                      style={
                        {
                          "--tint": COLOR_VAR[COLORS[i]].base,
                          "--tint-deep": COLOR_VAR[COLORS[i]].deep,
                          order: match ? 0 : 1,
                        } as CSSProperties
                      }
                    >
                      {word}
                    </motion.span>
                  );
                })}
              </motion.div>
            ))}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
