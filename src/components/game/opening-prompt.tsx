"use client";

import { motion, useReducedMotion } from "motion/react";
import { COLOR_VAR } from "../ui/player-avatar";
import { ease, spring } from "@/lib/client/motion";
import type { Participant } from "@/lib/types";

const HEADLINE = ["Start", "anywhere."];

/**
 * Round one has no given word: everyone opens with any word of their own. On a
 * fresh match the players' colored minds fly apart from the center, each to
 * its own starting point (the reverse of the victory merge), then the
 * headline rises into place.
 */
export function OpeningPrompt({ participants, intro }: { participants: Participant[]; intro: boolean }) {
  const reduced = useReducedMotion();
  const play = intro && !reduced;
  const n = participants.length;

  return (
    <motion.div
      layout="position"
      className="relative flex w-full flex-col items-center text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.3, ease: ease.out } }}
    >
      <div className="relative flex items-center justify-center">
        {play && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {participants.map((p, i) => {
              const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
              return (
                <motion.span
                  key={p.playerId}
                  className="absolute size-3 rounded-full"
                  style={{ backgroundColor: COLOR_VAR[p.color].base }}
                  initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
                  animate={{
                    x: [0, Math.cos(angle) * 120, Math.cos(angle) * 150],
                    y: [0, Math.sin(angle) * 60, Math.sin(angle) * 74],
                    scale: [0.4, 1.2, 0.6],
                    opacity: [0, 1, 0],
                  }}
                  transition={{ duration: 1.5, times: [0, 0.45, 1], ease: ease.out, delay: 0.1 }}
                />
              );
            })}
          </div>
        )}
        <h2
          className="font-display relative text-[clamp(2.6rem,12vw,4.75rem)] leading-[1.02] font-[520] tracking-[-0.035em] text-ink"
          style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1, "opsz" 144' }}
          data-testid="opening-prompt"
        >
          {HEADLINE.map((word, i) => (
            <motion.span
              key={word}
              className="inline-block"
              initial={play ? { opacity: 0, y: "0.35em", scale: 0.94 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...spring.settle, delay: play ? 0.45 + i * 0.12 : 0 }}
            >
              {word}
              {i < HEADLINE.length - 1 && " "}
            </motion.span>
          ))}
        </h2>
      </div>

      <motion.p
        className="mt-4 max-w-[21rem] text-[15px] leading-relaxed text-ink-soft text-balance"
        initial={play ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: play ? 0.9 : 0, duration: 0.5, ease: ease.out }}
      >
        Everyone picks any word, in secret. Then you&rsquo;ll try to meet in the middle.
      </motion.p>
    </motion.div>
  );
}
