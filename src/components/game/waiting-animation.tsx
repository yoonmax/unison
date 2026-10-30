"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { COLOR_VAR } from "../ui/player-avatar";
import { wordFontSize } from "./word-pill";
import { ease, spring } from "@/lib/client/motion";
import type { Participant, PlayerColor } from "@/lib/types";

const OUTER_RADIUS = 104;
const INNER_RADIUS = 78;
const ORBIT_SECONDS = 18;

function Orb({ slot, total, ready, color }: { slot: number; total: number; ready: boolean; color: PlayerColor }) {
  const reduced = useReducedMotion();
  const home = (slot / total) * 360;
  const rotate = useMotionValue(home);

  useEffect(() => {
    if (reduced) {
      rotate.set(home);
      return;
    }
    if (ready) {
      // Settle forward into this player's slot rather than spinning back.
      const current = rotate.get();
      const target = home + Math.ceil((current - home) / 360) * 360;
      const controls = animate(rotate, target, spring.drift);
      return () => controls.stop();
    }
    const from = rotate.get();
    const controls = animate(rotate, [from, from + 360], {
      duration: ORBIT_SECONDS + slot * 2,
      ease: "linear",
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [ready, home, slot, reduced, rotate]);

  const c = COLOR_VAR[color];
  return (
    <motion.div className="absolute inset-0" style={{ rotate }}>
      <motion.span
        className="absolute top-1/2 left-1/2 -mt-2.5 -ml-2.5 block size-5 rounded-full"
        style={{ backgroundColor: ready ? c.base : c.tint, boxShadow: `inset 0 0 0 1.5px ${c.base}` }}
        animate={{ y: ready ? -INNER_RADIUS : -OUTER_RADIUS, scale: ready ? 1 : 0.72 }}
        transition={spring.drift}
      >
        {ready && !reduced && (
          <span
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: `0 0 0 1px ${c.base}`, animation: "pulse-ring 2.6s var(--ease-soft) infinite" }}
          />
        )}
      </motion.span>
    </motion.div>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * After locking in: your word sits at the center as a soft pill, and every
 * player's mind orbits around it. Thinking minds drift on the outer ring;
 * ready minds settle inward into their place.
 */
export function WaitingAnimation({
  word,
  myColor,
  participants,
  submittedIds,
  meId,
  restored,
}: {
  word: string;
  myColor: PlayerColor;
  participants: Participant[];
  submittedIds: string[];
  meId: string;
  restored: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitted = new Set(submittedIds);
  const waitingFor = participants.filter((p) => !submitted.has(p.playerId) && p.playerId !== meId);

  useEffect(() => {
    // Keep keyboard focus somewhere meaningful after the input disappears.
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.div
      className="flex w-full flex-col items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.3, ease: ease.out } }}
    >
      <div className="relative flex size-[15rem] items-center justify-center" aria-hidden>
        {/* Thinking minds ride the dashed outer ring; ready ones settle inside it. */}
        <div className="absolute inset-4 rounded-full border border-dashed border-line-strong" />
        <div className="absolute inset-[3.6rem] rounded-full bg-card/70" />
        {participants.map((p, i) => (
          <Orb
            key={p.playerId}
            slot={i}
            total={participants.length}
            ready={submitted.has(p.playerId)}
            color={p.color}
          />
        ))}
        {/* The thought lifts up from where the input was and settles, locked. */}
        <motion.div
          className="relative z-10 max-w-[8.5rem] rounded-full px-4 py-2 text-ink shadow-lift"
          style={{ backgroundColor: COLOR_VAR[myColor].base }}
          initial={restored ? false : { y: 120, scale: 1.5, opacity: 0.4 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={spring.settle}
        >
          <motion.span
            className="word-type block text-center leading-tight [overflow-wrap:anywhere]"
            style={{ fontSize: wordFontSize(word, "chip") }}
          >
            {word}
          </motion.span>
        </motion.div>
      </div>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="font-display mt-2 text-[22px] font-[540] tracking-[-0.02em] focus:outline-none"
      >
        {restored ? "Welcome back. Your thought is still here." : "Thought received."}
      </h3>
      <p className="mt-1.5 text-center text-[15px] text-ink-soft" aria-live="polite">
        {waitingFor.length > 0
          ? `Waiting for ${listNames(waitingFor.map((p) => p.nickname))} to think.`
          : "Everyone's in. Here it comes…"}
      </p>
    </motion.div>
  );
}
