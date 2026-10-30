"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import { Button } from "../ui/button";
import { RoundHistory } from "./round-history";
import { RoundWords } from "./round-words";
import { StartingWordDisplay } from "./starting-word-display";
import { SubmissionProgress } from "./submission-progress";
import { WaitingAnimation } from "./waiting-animation";
import { WordEntry } from "./word-entry";
import { ease } from "@/lib/client/motion";
import { useTicker } from "@/lib/client/use-ticker";
import { STUCK_ROUND_GRACE_MS } from "@/lib/game/constants";
import { lastRevealedRound } from "@/lib/game/phase";
import type { Phase, RoomSnapshot } from "@/lib/types";

/**
 * The in-match screen. Composition (mobile first):
 *   stage — starting word, or the last round's words (reveal → clue)
 *   prompt + word entry, or the waiting orbit once locked in
 *   who's ready
 */
export function GameView({
  snapshot,
  phase,
  serverNow,
  isHost,
  onSubmit,
  onEndRequest,
}: {
  snapshot: RoomSnapshot;
  phase: Exclude<Phase, "lobby" | "won">;
  serverNow: () => number;
  isHost: boolean;
  onSubmit: (round: number, word: string) => Promise<void>;
  onEndRequest: () => void;
}) {
  const match = snapshot.match!;
  const round = match.currentRound;
  const last = lastRevealedRound(snapshot);
  const mine = round.mySubmission;
  const [restoredRound] = useState(() => (mine ? round.number : null));

  const stage: "start" | "reveal" | "clue" =
    phase === "revealing" ? "reveal" : round.number === 1 || !last ? "start" : "clue";

  const now = useTicker(serverNow, 1000, phase === "collecting");
  const submitted = new Set(round.submittedPlayerIds);
  const players = new Map(snapshot.players.map((p) => [p.id, p]));
  const stuck = match.participants.filter((p) => {
    if (submitted.has(p.playerId)) return false;
    const since = players.get(p.playerId)?.disconnectedAt;
    return since !== undefined && since !== null && now - Date.parse(since) > STUCK_ROUND_GRACE_MS;
  });

  return (
    <motion.section
      aria-label={`Round ${round.number}`}
      className="flex w-full flex-1 flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <LayoutGroup>
        <div className="flex min-h-[15rem] flex-1 flex-col items-center justify-center py-6">
          <AnimatePresence mode="popLayout" initial={false}>
            {stage === "start" ? (
              <StartingWordDisplay
                key={`start-${match.id}`}
                word={match.startingWord}
                participants={match.participants}
                intro={phase === "starting"}
              />
            ) : (
              <RoundWords
                key={`round-${last!.number}`}
                round={last!}
                participants={match.participants}
                mode={stage}
                startingWord={match.startingWord}
                serverNow={serverNow}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-6 pb-4">
          <div className="flex min-h-[9.5rem] w-full flex-col items-center justify-end">
            <AnimatePresence mode="popLayout" initial={false}>
              {phase === "starting" && (
                <motion.p
                  key="ready"
                  className="text-center text-[16px] text-ink-soft"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ delay: 0.9, duration: 0.5, ease: ease.out }}
                >
                  Don&rsquo;t say it out loud. Find it together.
                </motion.p>
              )}
              {phase === "collecting" && !mine && (
                <motion.div
                  key={`entry-${round.number}`}
                  className="w-full"
                  exit={{ opacity: 0, y: -24, scale: 0.97, transition: { duration: 0.2, ease: ease.out } }}
                >
                  <WordEntry
                    roundNumber={round.number}
                    prompt={
                      round.number === 1 ? "What's the first word it brings to mind?" : "Where do your thoughts meet?"
                    }
                    onSubmit={(word) => onSubmit(round.number, word)}
                  />
                </motion.div>
              )}
              {phase === "collecting" && mine && (
                <WaitingAnimation
                  key={`wait-${round.number}`}
                  word={mine}
                  myColor={snapshot.me.color}
                  participants={match.participants}
                  submittedIds={round.submittedPlayerIds}
                  meId={snapshot.me.id}
                  restored={restoredRound === round.number}
                />
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {phase === "collecting" && stuck.length > 0 && (
              <motion.div
                key="stuck"
                role="status"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex w-full max-w-[26rem] flex-col items-center gap-3 rounded-3xl bg-peach-tint/80 px-5 py-4 text-center ring-1 ring-peach/60"
              >
                <p className="text-[14.5px] text-ink">
                  {stuck.map((p) => p.nickname).join(" and ")}
                  {stuck.length === 1 ? "'s" : "'"} signal faded.{" "}
                  {isHost ? "Wait for them, or end this game." : "Waiting for them to come back."}
                </p>
                {isHost && (
                  <Button size="sm" variant="secondary" onClick={onEndRequest}>
                    End game for everyone
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {phase === "collecting" && (
            <SubmissionProgress
              participants={match.participants}
              players={snapshot.players}
              submittedIds={round.submittedPlayerIds}
              meId={snapshot.me.id}
            />
          )}

          <RoundHistory rounds={match.rounds} participants={match.participants} startingWord={match.startingWord} />
        </div>
      </LayoutGroup>
    </motion.section>
  );
}
