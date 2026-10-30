"use client";

import { motion, useReducedMotion } from "motion/react";
import { COLOR_VAR } from "../ui/player-avatar";
import { wordFontSize } from "./word-pill";
import { ease, spring } from "@/lib/client/motion";
import type { Participant } from "@/lib/types";

/**
 * The round-one word. On a fresh match it "blooms": the players' colored
 * minds spread out from the center (the reverse of the victory merge), then
 * the letters rise into place.
 */
export function StartingWordDisplay({
  word,
  participants,
  intro,
}: {
  word: string;
  participants: Participant[];
  intro: boolean;
}) {
  const reduced = useReducedMotion();
  const play = intro && !reduced;
  const letters = Array.from(word);
  const n = participants.length;

  return (
    <motion.div
      layout="position"
      className="relative flex w-full flex-col items-center text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.3, ease: ease.out } }}
    >
      <motion.p
        className="text-[12px] font-medium tracking-[0.18em] text-ink-soft uppercase"
        initial={play ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: play ? 0.9 : 0, duration: 0.5, ease: ease.out }}
      >
        Starting word
      </motion.p>

      <div className="relative mt-3 flex items-center justify-center">
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
          className="word-type relative leading-none text-ink"
          style={{ fontSize: wordFontSize(word, "hero"), letterSpacing: "0.02em" }}
          aria-label={word}
          data-testid="starting-word"
        >
          {letters.map((letter, i) => (
            <motion.span
              key={`${letter}-${i}`}
              aria-hidden
              className="inline-block"
              initial={play ? { opacity: 0, y: "0.35em", scale: 0.9 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...spring.settle, delay: play ? 0.55 + i * 0.045 : 0 }}
            >
              {letter}
            </motion.span>
          ))}
        </h2>
      </div>
    </motion.div>
  );
}
