"use client";

import { Check, Share2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSound } from "../providers";
import { Button } from "../ui/button";
import { COLOR_VAR, PlayerAvatar } from "../ui/player-avatar";
import { RoundHistory } from "./round-history";
import { wordFontSize } from "./word-pill";
import { ease, spring, victoryTiming } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";
import { formatDuration } from "@/lib/client/use-ticker";
import type { Participant, PublicMatch } from "@/lib/types";

type Stage = "scattered" | "converging" | "merged";

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four"];
const FRINGE = [
  { x: -1.5, y: -1 },
  { x: 1.5, y: -0.5 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

export function shareText(match: PublicMatch): string {
  const n = match.participants.length;
  const rounds = match.rounds.length;
  return [
    "UNISON ✦",
    `${n} minds → 1 word`,
    `${rounds} ${rounds === 1 ? "round" : "rounds"}`,
    `Final word: ${match.finalWord}`,
  ].join("\n");
}

/**
 * The signature moment. Every player's pill — all showing the same word —
 * drifts to the center, overlaps, and resolves into one larger word; a soft
 * ripple in everyone's colors goes out; then the result settles in.
 *
 * Offsets to the center are measured from the real layout at the moment of
 * convergence, so the motion is correct at any screen size, and only
 * transforms/opacity animate.
 */
function ConvergenceAnimation({
  word,
  participants,
  stage,
  animateIn,
}: {
  word: string;
  participants: Participant[];
  stage: Stage;
  animateIn: boolean;
}) {
  const merged = stage === "merged";
  const converging = stage !== "scattered";
  const n = participants.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [offsets, setOffsets] = useState<Array<{ x: number; y: number }> | null>(null);

  useLayoutEffect(() => {
    if (!converging || offsets) return;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    // Measuring the DOM has to happen after layout; this runs once per match.
    setOffsets(
      pillRefs.current.map((el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) } : { x: 0, y: 0 };
      }),
    );
  }, [converging, offsets]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-[14rem] w-full items-center justify-center sm:h-[16rem]"
      aria-hidden
    >
      {/* Ripple in everyone's colors once the words become one. */}
      {merged &&
        animateIn &&
        participants.map((p, i) => (
          <motion.span
            key={`ripple-${p.playerId}`}
            className="absolute size-40 rounded-full"
            style={{ boxShadow: `0 0 0 1.5px ${COLOR_VAR[p.color].base}` }}
            initial={{ scale: 0.5, opacity: 0.7 }}
            animate={{ scale: 2.6 + i * 0.25, opacity: 0 }}
            transition={{ duration: 1.6, delay: i * 0.12, ease: ease.out }}
          />
        ))}

      <div
        className={cn(
          "relative grid w-full max-w-[24rem] place-items-center",
          n === 2 ? "grid-cols-2 gap-6" : "grid-cols-2 gap-x-4 gap-y-8",
        )}
      >
        {participants.map((p, i) => {
          const c = COLOR_VAR[p.color];
          const offset = offsets?.[i] ?? { x: 0, y: 0 };
          return (
            <motion.div
              key={p.playerId}
              ref={(el) => {
                pillRefs.current[i] = el;
              }}
              className={cn(
                "flex max-w-full flex-col items-center rounded-[26px] px-5 pt-2.5 pb-3",
                n === 3 && i === 2 && "col-span-2",
              )}
              style={{ boxShadow: `inset 0 0 0 1px ${c.base}` }}
              initial={animateIn ? { opacity: 0, scale: 0.6, x: 0, y: 20 } : false}
              animate={{
                opacity: merged ? 0 : 1,
                scale: merged ? 1.2 : converging ? 1.06 : 1,
                // While overlapping, each mind sits a hair off-center so their
                // colors fringe the shared word before it resolves into one.
                x: converging ? offset.x + FRINGE[i % FRINGE.length].x : 0,
                y: converging ? offset.y + FRINGE[i % FRINGE.length].y : 0,
                backgroundColor: converging ? `${c.base}22` : c.tint,
              }}
              transition={{
                ...spring.drift,
                delay: stage === "scattered" ? 0.1 + i * 0.09 : i * 0.04,
                opacity: { duration: 0.35 },
                backgroundColor: { duration: 0.6 },
              }}
            >
              <motion.span
                className="text-[12px] font-medium text-ink-soft"
                animate={{ opacity: converging ? 0 : 1 }}
                transition={{ duration: 0.3 }}
              >
                {p.nickname}
              </motion.span>
              <motion.span
                className="word-type block leading-[1.05]"
                style={{ fontSize: wordFontSize(word, "reveal") }}
                animate={{ opacity: converging ? (i === 0 ? 1 : 0.35) : 1 }}
                transition={{ duration: 0.5 }}
              >
                {word}
              </motion.span>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {merged && (
          <motion.span
            key="merged"
            className="word-type absolute text-ink"
            style={{ fontSize: wordFontSize(word, "hero") }}
            initial={animateIn ? { opacity: 0, scale: 0.7, letterSpacing: "0.2em" } : false}
            animate={{ opacity: 1, scale: 1, letterSpacing: "0.03em" }}
            transition={{ ...spring.settle, opacity: { duration: 0.4 } }}
          >
            {word}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function VictoryView({
  match,
  serverNow,
  isHost,
  hostName,
  starting,
  onPlayAgain,
  onBackToLobby,
}: {
  match: PublicMatch;
  serverNow: () => number;
  isHost: boolean;
  hostName: string | null;
  starting: boolean;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}) {
  const reduced = useReducedMotion();
  const { play } = useSound();
  const lastRound = match.rounds[match.rounds.length - 1];
  const [fresh] = useState(
    () =>
      !reduced &&
      serverNow() - Date.parse(lastRound?.revealedAt ?? match.completedAt ?? "") < victoryTiming.replayWindow * 1000,
  );
  const [stage, setStage] = useState<Stage>(fresh ? "scattered" : "merged");
  const [showText, setShowText] = useState(!fresh);
  const [copied, setCopied] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showText) return;
    // The input that had focus is gone; give keyboard users the next action
    // (without stealing focus from anything they've already moved to).
    const timer = setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) primaryRef.current?.focus({ preventScroll: true });
    }, (fresh ? victoryTiming.results - victoryTiming.title : 0) * 1000 + 350);
    return () => clearTimeout(timer);
  }, [showText, fresh]);

  useEffect(() => {
    if (!fresh) return;
    const timers = [
      setTimeout(() => setStage("converging"), victoryTiming.converge * 1000),
      setTimeout(() => {
        setStage("merged");
        play("victory", match.participants.length);
      }, victoryTiming.merge * 1000),
      setTimeout(() => setShowText(true), victoryTiming.title * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [fresh, play, match.participants.length]);

  const n = match.participants.length;
  const rounds = match.rounds.length;
  const duration = match.completedAt ? Date.parse(match.completedAt) - Date.parse(match.startedAt) : 0;
  const delay = (t: number) => (fresh ? t - victoryTiming.title : 0);

  async function share() {
    const text = shareText(match);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable; nothing else to do quietly.
    }
  }

  return (
    <motion.section
      aria-label="Unison achieved"
      className="flex w-full flex-1 flex-col items-center pb-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center pt-4">
        {/* Converge at the center of the screen, then glide up as the results arrive. */}
        <motion.div layout="position" transition={spring.soft} className="flex w-full flex-col items-center">
          <ConvergenceAnimation
            word={match.finalWord!}
            participants={match.participants}
            stage={stage}
            animateIn={fresh}
          />

          <motion.div
            className="flex min-h-[8.5rem] flex-col items-center text-center"
            initial={fresh ? "hidden" : false}
            animate={showText ? "shown" : "hidden"}
          >
            <motion.h2
              className="font-display text-[clamp(1.9rem,8.5vw,2.9rem)] leading-none font-[500] tracking-[0.2em]"
              style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1, "opsz" 144' }}
              variants={{
                hidden: { opacity: 0, y: 14, letterSpacing: "0.45em" },
                shown: { opacity: 1, y: 0, letterSpacing: "0.2em" },
              }}
              transition={{ duration: 0.9, ease: ease.out }}
            >
              UNISON.
            </motion.h2>
            <motion.p
              className="font-display mt-3 text-[clamp(1.15rem,5vw,1.45rem)] text-ink-soft italic"
              style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
              variants={{ hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0 } }}
              transition={{ delay: delay(victoryTiming.subtitle), duration: 0.6, ease: ease.out }}
            >
              {n} minds. 1 word.
            </motion.p>
            <motion.p
              className="mt-2 text-[13px] font-medium tracking-[0.16em] text-ink-faint uppercase"
              variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
              transition={{ delay: delay(victoryTiming.subtitle + 0.25), duration: 0.6 }}
            >
              Unison in {rounds} {rounds === 1 ? "round" : "rounds"}
            </motion.p>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showText && (
          <motion.div
            key="results"
            className="mt-6 flex w-full max-w-[26rem] flex-col items-center gap-5"
            initial={fresh ? { opacity: 0, y: 24 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.soft, delay: delay(victoryTiming.results) }}
          >
            <div className="w-full rounded-[28px] bg-card/90 p-5 shadow-soft ring-1 ring-line">
              <p className="text-center text-[14px] text-ink-soft">{NUMBER_WORDS[n]} minds became one.</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[11px] font-medium tracking-[0.14em] text-ink-faint uppercase">Final word</dt>
                  <dd className="word-type mt-1 truncate text-[17px]">{match.finalWord}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium tracking-[0.14em] text-ink-faint uppercase">Rounds</dt>
                  <dd className="font-display mt-1 text-[19px] font-[560]">{rounds}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium tracking-[0.14em] text-ink-faint uppercase">Time</dt>
                  <dd className="font-display mt-1 text-[19px] font-[560] tabular-nums">{formatDuration(duration)}</dd>
                </div>
              </dl>
              <ul className="mt-5 flex justify-center gap-3" aria-label="Players">
                {match.participants.map((p) => (
                  <li key={p.playerId} className="flex flex-col items-center gap-1">
                    <PlayerAvatar name={p.nickname} color={p.color} size={30} />
                    <span className="max-w-16 truncate text-[11.5px] text-ink-soft">{p.nickname}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex w-full flex-col gap-2.5">
              {isHost ? (
                <Button ref={primaryRef} size="lg" onClick={onPlayAgain} loading={starting}>
                  Play again
                </Button>
              ) : (
                <p className="py-2 text-center text-[14.5px] text-ink-soft">
                  {hostName ? `${hostName} can start the next game.` : "The host can start the next game."}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  variant="secondary"
                  onClick={share}
                  icon={copied ? <Check className="size-4" /> : <Share2 className="size-4" strokeWidth={1.8} />}
                >
                  {copied ? "Copied" : "Share result"}
                </Button>
                <Button ref={isHost ? undefined : primaryRef} variant="secondary" onClick={onBackToLobby}>
                  Back to lobby
                </Button>
              </div>
            </div>

            <RoundHistory rounds={match.rounds} participants={match.participants} startingWord={match.startingWord} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
