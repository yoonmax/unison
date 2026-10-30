"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { WordPill } from "./word-pill";
import { agreementLine, clusterAnswers } from "@/lib/game/clusters";
import { ease, revealTiming, spring } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";
import type { Participant, RevealedRound } from "@/lib/types";

/**
 * One revealed round's words. In "reveal" mode they arrive in player order,
 * then matching words drift together and share a highlight. In "clue" mode
 * (the next round's prompt) the same pills settle smaller — they are the
 * same elements, so the reveal flows straight into the next question.
 */
export function RoundWords({
  round,
  participants,
  mode,
  startingWord,
  serverNow,
}: {
  round: RevealedRound;
  participants: Participant[];
  mode: "reveal" | "clue";
  startingWord: string;
  serverNow: () => number;
}) {
  const reduced = useReducedMotion();
  // Only choreograph a reveal that just happened; after a refresh mid-reveal,
  // show the settled arrangement instead of replaying it.
  const [fresh] = useState(() => serverNow() - Date.parse(round.revealedAt) < 2500);
  const choreograph = mode === "reveal" && fresh && !reduced;
  const [clustered, setClustered] = useState(!choreograph);

  useEffect(() => {
    if (clustered) return;
    const timer = setTimeout(() => setClustered(true), revealTiming.cluster * 1000);
    return () => clearTimeout(timer);
  }, [clustered]);

  const byId = useMemo(() => new Map(participants.map((p) => [p.playerId, p])), [participants]);

  // Flat, stable list of pills; clustering only reorders and re-spaces them so
  // Motion can animate positions without remounting anything.
  const ordered = useMemo(() => {
    if (!clustered) return round.answers.map((a) => ({ answer: a, clusterSize: 1, first: true }));
    return clusterAnswers(round.answers).flatMap((cluster) =>
      cluster.answers.map((answer, i) => ({ answer, clusterSize: cluster.answers.length, first: i === 0 })),
    );
  }, [clustered, round.answers]);

  const anyMatch = ordered.some((o) => o.clusterSize > 1);
  const big = mode === "reveal";

  return (
    <motion.section
      layout
      aria-label={`Round ${round.number} words`}
      className="flex w-full flex-col items-center text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.28, ease: ease.out } }}
      transition={spring.soft}
    >
      <motion.p layout="position" className="text-[12px] font-medium tracking-[0.18em] text-ink-soft uppercase">
        {mode === "reveal" ? `Round ${round.number}` : `Round ${round.number} words`}
        <span className="mx-2 text-ink-faint">·</span>
        <span className="tracking-[0.06em] normal-case">from</span>{" "}
        <span className="word-type text-ink tracking-[0.08em]">{startingWord}</span>
      </motion.p>

      <motion.ul
        layout
        className={cn("mt-5 flex max-w-[26rem] flex-wrap items-center justify-center", big ? "gap-y-5" : "gap-y-3")}
        transition={spring.drift}
      >
        {ordered.map(({ answer, clusterSize, first }, index) => {
          const p = byId.get(answer.playerId);
          const inCluster = clustered && clusterSize > 1;
          const emphasis = !clustered ? "normal" : inCluster ? "match" : anyMatch ? "quiet" : "normal";
          return (
            <motion.li
              key={answer.playerId}
              layout
              transition={spring.drift}
              className={cn(
                "flex max-w-full",
                // Matching words sit shoulder to shoulder; others keep their distance.
                inCluster ? (first ? "ml-4 mr-0.5" : "mx-0.5") : big ? "mx-3" : "mx-1.5",
              )}
            >
              <WordPill
                word={answer.word}
                color={p?.color ?? "lavender"}
                name={p?.nickname}
                size={big ? "reveal" : "clue"}
                emphasis={emphasis}
                initial={choreograph ? { opacity: 0, scale: 0.55, y: 22 } : false}
                animate={{
                  opacity: emphasis === "quiet" ? 0.82 : 1,
                  scale: emphasis === "match" && big ? 1.04 : emphasis === "quiet" ? 0.96 : 1,
                  y: 0,
                }}
                transition={{
                  ...spring.settle,
                  delay: choreograph && !clustered ? revealTiming.wordsStart + index * revealTiming.wordStagger : 0,
                }}
              />
            </motion.li>
          );
        })}
      </motion.ul>

      {/* Space is reserved up front so nothing shifts when the caption arrives. */}
      {mode === "reveal" && (
        <motion.div layout="position" className="mt-6 flex min-h-8 items-center justify-center">
          <AnimatePresence>
            {clustered && (
              <motion.p
                key="caption"
                className="font-display text-[clamp(1.15rem,4.8vw,1.4rem)] text-ink italic"
                style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  delay: choreograph ? revealTiming.caption - revealTiming.cluster : 0,
                  duration: 0.5,
                  ease: ease.out,
                }}
              >
                {agreementLine(round.answers)}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.section>
  );
}
