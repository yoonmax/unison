"use client";

import { motion } from "motion/react";
import { PlayerAvatar } from "../ui/player-avatar";
import { spring } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";
import type { Participant, PublicPlayer } from "@/lib/types";

/** Who has locked in — never what. Avatars fill with color when ready. */
export function SubmissionProgress({
  participants,
  players,
  submittedIds,
  meId,
}: {
  participants: Participant[];
  players: PublicPlayer[];
  submittedIds: string[];
  meId: string;
}) {
  const submitted = new Set(submittedIds);
  const connection = new Map(players.map((p) => [p.id, p.connection]));
  const readyCount = participants.filter((p) => submitted.has(p.playerId)).length;

  return (
    <div className="w-full">
      <p className="sr-only">
        {readyCount} of {participants.length} ready.
      </p>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-2" aria-label="Who's ready">
        {participants.map((p) => {
          const ready = submitted.has(p.playerId);
          const away = !p.present || connection.get(p.playerId) === "disconnected";
          const status = ready ? "Ready" : away ? "Away" : "Thinking…";
          return (
            <li key={p.playerId} className="flex w-[4.5rem] flex-col items-center gap-1 text-center">
              <motion.span
                key={ready ? "ready" : "thinking"}
                initial={ready ? { scale: 0.7 } : false}
                animate={{ scale: 1 }}
                transition={spring.settle}
                className="relative"
              >
                <PlayerAvatar name={p.nickname} color={p.color} size={34} filled={ready} dimmed={away && !ready} />
                {away && !ready && (
                  <span
                    className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-ink-faint ring-2 ring-paper"
                    aria-hidden
                  />
                )}
              </motion.span>
              <span className="w-full truncate text-[12px] font-medium text-ink">
                {p.nickname}
                {p.playerId === meId && <span className="text-ink-faint"> (you)</span>}
              </span>
              <span className={cn("text-[11px]", ready ? "text-mint-deep" : "text-ink-faint")}>
                <span className="sr-only">{p.nickname}: </span>
                {status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
