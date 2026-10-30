"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { PlayerDot } from "../ui/player-avatar";
import { ease, spring } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";
import type { Participant, RevealedRound } from "@/lib/types";

/** Expandable record of how everyone's words evolved. Only revealed rounds. */
export function RoundHistory({
  rounds,
  participants,
  startingWord,
  defaultOpen = false,
  className,
}: {
  rounds: RevealedRound[];
  participants: Participant[];
  startingWord: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const byId = new Map(participants.map((p) => [p.playerId, p]));
  if (rounds.length === 0) return null;

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="mx-auto flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
      >
        Round history
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.press} className="inline-flex">
          <ChevronDown className="size-4" strokeWidth={1.8} aria-hidden />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: ease.out }}
            className="overflow-hidden"
          >
            <ol className="mx-auto mt-2 flex max-w-[30rem] flex-col gap-2 rounded-3xl bg-card/80 p-4 ring-1 ring-line">
              <li className="text-[12.5px] text-ink-soft">
                Started from <span className="word-type text-ink">{startingWord}</span>
              </li>
              {rounds.map((round) => (
                <li key={round.number} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-[4.5rem] shrink-0 text-[12px] font-medium text-ink-faint">
                    Round {round.number}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {round.answers.map((answer, i) => {
                      const p = byId.get(answer.playerId);
                      return (
                        <span key={answer.playerId} className="inline-flex items-center gap-1.5">
                          {i > 0 && (
                            <span className="text-ink-faint" aria-hidden>
                              ·
                            </span>
                          )}
                          {p && <PlayerDot color={p.color} size={8} />}
                          <span className="sr-only">{p?.nickname}: </span>
                          <span className="word-type text-[14px] text-ink">{answer.word}</span>
                        </span>
                      );
                    })}
                    {round.isUnison && <span className="text-[12px] font-medium text-mint-deep">✦ unison</span>}
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
