"use client";

import { Check, Copy, Crown, Share, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { Button, IconButton } from "../ui/button";
import { PlayerAvatar } from "../ui/player-avatar";
import { ease, spring } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/game/constants";
import type { PublicMatch, PublicPlayer, RoomSnapshot } from "@/lib/types";

const noopSubscribe = () => () => {};

function useCanShare() {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

export function inviteUrl(code: string) {
  return `${window.location.origin}/r/${code}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure origins: fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function RoomShareControls({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();

  async function copy() {
    if (await copyText(inviteUrl(code))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Join me in Unison",
        text: `Let's find one word together. Room ${code}`,
        url: inviteUrl(code),
      });
    } catch {
      // dismissed
    }
  }

  return (
    <div className="flex w-full gap-2.5">
      <Button
        variant="secondary"
        className="flex-1"
        onClick={copy}
        aria-live="polite"
        icon={
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "check" : "copy"}
              initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={spring.settle}
              className="inline-flex"
            >
              {copied ? (
                <Check className="size-4 text-mint-deep" strokeWidth={2.4} />
              ) : (
                <Copy className="size-4" strokeWidth={1.8} />
              )}
            </motion.span>
          </AnimatePresence>
        }
      >
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
      {canShare && (
        <Button
          variant="secondary"
          onClick={share}
          aria-label="Share invite"
          icon={<Share className="size-4" strokeWidth={1.8} />}
        >
          Share
        </Button>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  isMe,
  canRemove,
  onRemove,
}: {
  player: PublicPlayer;
  isMe: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const away = player.connection === "disconnected";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -14, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 14, scale: 0.92, transition: { duration: 0.22 } }}
      transition={spring.soft}
      className="glass flex min-h-[3.75rem] items-center gap-3 rounded-[22px] py-2 pr-2 pl-2.5"
    >
      {/* A small colored mind that blooms into the avatar. */}
      <motion.span initial={{ scale: 0.35 }} animate={{ scale: 1 }} transition={{ ...spring.settle, delay: 0.08 }}>
        <PlayerAvatar name={player.nickname} color={player.color} size={40} dimmed={away} />
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[15.5px] font-medium">
          <span className="truncate">{player.nickname}</span>
          {isMe && <span className="text-ink-faint font-normal">(you)</span>}
        </p>
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
          <span className={cn("size-1.5 rounded-full", away ? "bg-ink-faint" : "bg-mint-deep")} aria-hidden />
          {away ? "Signal faded" : "Here"}
          {player.isHost && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-butter-tint px-2 py-0.5 text-[11px] font-medium text-butter-deep">
              <Crown className="size-3" strokeWidth={2} aria-hidden />
              Host
            </span>
          )}
        </p>
      </div>
      {canRemove && (
        <IconButton label={`Remove ${player.nickname}`} onClick={onRemove} className="text-ink-faint hover:text-ink">
          <X className="size-4" strokeWidth={1.8} />
        </IconButton>
      )}
    </motion.li>
  );
}

export function LobbyView({
  snapshot,
  isHost,
  starting,
  onStart,
  onRemove,
  onLeave,
  lastMatch,
}: {
  snapshot: RoomSnapshot;
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
  onRemove: (player: PublicPlayer) => void;
  onLeave: () => void;
  lastMatch: PublicMatch | null;
}) {
  const { players, room, me } = snapshot;
  const count = players.length;
  const away = players.filter((p) => p.connection === "disconnected");
  const host = players.find((p) => p.isHost);
  const canStart = count >= MIN_PLAYERS && count <= MAX_PLAYERS && away.length === 0;
  const emptySlots = Math.max(0, MAX_PLAYERS - count);

  const heading =
    count < 2
      ? "Waiting for another mind."
      : count < MAX_PLAYERS
        ? "Minds are gathering."
        : "Four minds. Ready when you are.";

  const startHint =
    count < MIN_PLAYERS
      ? "Unison needs at least one friend. Send them the link."
      : away.length > 0
        ? `Waiting for ${away.map((p) => p.nickname).join(" and ")} to reconnect — or remove them.`
        : count < MAX_PLAYERS
          ? `You can start now, or wait for up to ${MAX_PLAYERS - count} more.`
          : "Everyone's here.";

  return (
    <motion.section
      aria-label="Lobby"
      className="flex w-full flex-1 flex-col items-center pt-4 pb-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.25, ease: ease.out } }}
      transition={{ duration: 0.4, ease: ease.out }}
    >
      <div className="flex w-full max-w-[26rem] flex-col">
        <p
          className="font-display mt-2 text-center text-[clamp(2.9rem,16vw,4rem)] leading-none font-[540] tracking-[0.2em] pl-[0.2em]"
          aria-label={`Room code ${room.code.split("").join(" ")}`}
        >
          {room.code}
        </p>
        <p className="mt-2.5 text-center text-[14px] text-ink-soft">Share the code, or send the link.</p>
        <div className="mt-5">
          <RoomShareControls code={room.code} />
        </div>

        <h2 className="font-display mt-9 text-[clamp(1.5rem,6vw,1.85rem)] font-[540] tracking-[-0.02em]">{heading}</h2>
        <p className="mt-1 text-[14px] text-ink-soft" aria-live="polite">
          {count} of {MAX_PLAYERS} minds
        </p>

        <ul className="mt-4 flex flex-col gap-2" aria-label="Players">
          <AnimatePresence initial={false}>
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                isMe={player.id === me.id}
                canRemove={isHost && player.id !== me.id}
                onRemove={() => onRemove(player)}
              />
            ))}
          </AnimatePresence>
          {Array.from({ length: emptySlots }, (_, i) => (
            <motion.li
              layout
              key={`empty-${i}`}
              className="flex min-h-[3.75rem] items-center gap-3 rounded-[22px] border border-dashed border-line-strong px-2.5 text-[14px] text-ink-faint"
              transition={spring.soft}
            >
              <span className="size-10 rounded-full border border-dashed border-line-strong" aria-hidden />
              {i === 0 ? "Waiting for a mind…" : "Open seat"}
            </motion.li>
          ))}
        </ul>

        {lastMatch?.finalWord && (
          <p className="mt-5 rounded-2xl bg-mint-tint/70 px-4 py-3 text-center text-[14px] text-ink-soft">
            Last game: unison on <span className="word-type text-ink">{lastMatch.finalWord}</span> in{" "}
            {lastMatch.rounds.length} {lastMatch.rounds.length === 1 ? "round" : "rounds"}.
          </p>
        )}

        <div className="mt-7 flex flex-col gap-2.5">
          {isHost ? (
            <>
              <Button size="lg" onClick={onStart} disabled={!canStart} loading={starting}>
                {lastMatch ? "Start another game" : "Start game"}
              </Button>
              <p className="text-center text-[13.5px] text-ink-soft" aria-live="polite">
                {startHint}
              </p>
            </>
          ) : (
            <p className="flex items-center justify-center gap-2.5 py-3 text-center text-[15px] text-ink-soft">
              <span className="size-2 animate-pulse rounded-full bg-lavender" aria-hidden />
              {host ? `Waiting for ${host.nickname} to start the game.` : "Waiting for the host to start."}
            </p>
          )}
        </div>

        <div className="mt-8 rounded-[24px] bg-paper-deep/70 px-5 py-4 text-[14px] leading-relaxed text-ink-soft">
          <p className="font-medium text-ink">How to play</p>
          <p className="mt-1">
            Everyone secretly types any word at all. Then you all see each other&rsquo;s words and try again — aiming
            for the word you think everyone else will pick. Keep going until you all say the same thing.
          </p>
          <p className="mt-2 text-ink">Don&rsquo;t say your word out loud. Find it together.</p>
        </div>

        <Button variant="ghost" className="mt-5 self-center text-ink-soft" onClick={onLeave}>
          Leave room
        </Button>
      </div>
    </motion.section>
  );
}
