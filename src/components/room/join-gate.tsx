"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AmbientBackground } from "../ambient-background";
import { UnisonWordmark } from "../unison-wordmark";
import { Button } from "../ui/button";
import { TextField } from "../ui/text-field";
import { api, ApiError } from "@/lib/client/api";
import { rememberedNickname, rememberNickname } from "@/lib/client/nickname-store";
import { ease } from "@/lib/client/motion";
import { NICKNAME_MAX_LENGTH } from "@/lib/game/constants";
import { NICKNAME_ERROR_MESSAGES, normalizeNickname } from "@/lib/game/normalize";
import type { RoomPreview, RoomSnapshot } from "@/lib/types";

const NUMBER_WORDS = ["No one", "One mind", "Two minds", "Three minds", "Four minds"];

export function JoinGate({
  code,
  preview,
  onJoined,
  onBlocked,
}: {
  code: string;
  preview: RoomPreview;
  onJoined: (snapshot: RoomSnapshot) => void;
  onBlocked: (reason: "full" | "in_progress" | "not_found") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(rememberedNickname());
    inputRef.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = normalizeNickname(name);
    if (!result.ok) return setError(NICKNAME_ERROR_MESSAGES[result.error]);
    setBusy(true);
    setError(null);
    try {
      const snapshot = await api.join(code, result.nickname);
      rememberNickname(result.nickname);
      onJoined(snapshot);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError) {
        if (e.code === "ROOM_FULL") return onBlocked("full");
        if (e.code === "MATCH_IN_PROGRESS") return onBlocked("in_progress");
        if (e.code === "ROOM_NOT_FOUND") return onBlocked("not_found");
        return setError(e.message);
      }
      setError("Can't reach Unison right now. Try again?");
    }
  }

  const waiting = preview.playerCount;

  return (
    <main className="safe-x safe-top safe-bottom relative flex min-h-dvh flex-col items-center">
      <AmbientBackground />
      <header className="relative z-10 flex w-full max-w-[34rem] items-center py-2">
        <Link href="/" className="rounded-lg px-1" aria-label="Unison home">
          <UnisonWordmark size="small" />
        </Link>
      </header>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: ease.out }}
        className="relative z-10 flex w-full max-w-[24rem] flex-1 flex-col justify-center pb-[8vh]"
      >
        <p className="text-[13px] font-medium tracking-[0.12em] text-ink-soft uppercase">You&rsquo;re invited</p>
        <h1 className="font-display mt-2 text-[clamp(2rem,9vw,2.6rem)] font-[540] leading-[1.05] tracking-[-0.03em]">
          {preview.hostName ? (
            <>
              Sync up with <span className="italic">{preview.hostName}</span>
            </>
          ) : (
            "Find your word together"
          )}
        </h1>
        <p className="mt-3 text-[15px] text-ink-soft">
          Room <span className="font-display font-[600] tracking-[0.18em] text-ink">{code}</span> ·{" "}
          {NUMBER_WORDS[waiting]} {waiting === 1 ? "is" : "are"} waiting
        </p>

        <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-1">
          <TextField
            ref={inputRef}
            label="Your name"
            placeholder="e.g. Jamie"
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            maxLength={NICKNAME_MAX_LENGTH + 4}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            error={error}
          />
          <Button type="submit" size="lg" loading={busy}>
            Join room <ArrowRight className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </Button>
        </form>
        <p className="mt-6 text-center text-[13px] text-ink-faint">
          No account needed. Your name is only shared with this room.
        </p>
      </motion.section>
    </main>
  );
}
