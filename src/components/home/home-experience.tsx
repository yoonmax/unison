"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AmbientBackground } from "../ambient-background";
import { UnisonWordmark } from "../unison-wordmark";
import { Button } from "../ui/button";
import { TextField } from "../ui/text-field";
import { HowItWorksLoop } from "./how-it-works-loop";
import { api, ApiError } from "@/lib/client/api";
import { ease, spring } from "@/lib/client/motion";
import { NICKNAME_ERROR_MESSAGES, normalizeNickname } from "@/lib/game/normalize";
import { parseRoomCode, ROOM_CODE_LENGTH } from "@/lib/game/room-code";
import { NICKNAME_MAX_LENGTH } from "@/lib/game/constants";
import { rememberedNickname, rememberNickname } from "@/lib/client/nickname-store";

type Panel = "choose" | "create" | "join";

const panelMotion = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
  transition: { duration: 0.32, ease: ease.out },
};

export function HomeExperience() {
  const [panel, setPanel] = useState<Panel>("choose");

  return (
    <main className="safe-x safe-top safe-bottom relative flex min-h-dvh flex-col items-center">
      <AmbientBackground />
      <div className="relative z-10 flex w-full max-w-[26rem] flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center pt-[8vh] pb-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: ease.out }}
          >
            <h1>
              <UnisonWordmark />
            </h1>
          </motion.div>
          <motion.p
            className="font-display mt-4 text-[clamp(1.15rem,4.6vw,1.45rem)] text-ink-soft italic"
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: ease.out }}
          >
            Different minds. One word.
          </motion.p>
          <motion.div
            className="mt-9 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.6 }}
          >
            <HowItWorksLoop paused={panel !== "choose"} />
          </motion.div>
        </div>

        <motion.section
          layout
          transition={spring.soft}
          className="relative w-full"
          aria-label="Start playing"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {panel === "choose" && (
              <motion.div key="choose" {...panelMotion} className="flex flex-col gap-3">
                <Button size="lg" onClick={() => setPanel("create")}>
                  Create a room
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setPanel("join")}>
                  Join a room
                </Button>
              </motion.div>
            )}
            {panel === "create" && (
              <motion.div key="create" {...panelMotion}>
                <CreatePanel onBack={() => setPanel("choose")} />
              </motion.div>
            )}
            {panel === "join" && (
              <motion.div key="join" {...panelMotion}>
                <JoinPanel onBack={() => setPanel("choose")} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        <motion.footer
          className="mt-10 pb-2 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.6 }}
        >
          <ol className="mx-auto grid max-w-[22rem] gap-1.5 text-[14px] leading-snug text-ink-soft">
            <li>Everyone sees the same word.</li>
            <li>Each of you answers with one word, in secret.</li>
            <li>Use what you saw to meet in the middle — until you all say the same thing.</li>
          </ol>
          <p className="mt-4 text-[12.5px] tracking-[0.01em] text-ink-faint">
            2–4 players · no accounts · don&rsquo;t say your word out loud
          </p>
        </motion.footer>
      </div>
    </main>
  );
}

function PanelShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] bg-card/90 p-5 shadow-lift ring-1 ring-line backdrop-blur-[2px]">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 size-11 px-0" aria-label="Back" onClick={onBack}>
          <ArrowLeft className="size-[18px]" strokeWidth={1.75} />
        </Button>
        <h2 className="font-display text-[22px] font-[560] tracking-[-0.02em]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function CreatePanel({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Prefill from the last visit (local only).
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
      const { code } = await api.createRoom(result.nickname);
      rememberNickname(result.nickname);
      router.push(`/r/${code}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : "Something went sideways. Try again?");
    }
  }

  return (
    <PanelShell title="Create a room" onBack={onBack}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-1">
        <TextField
          ref={inputRef}
          label="Your name"
          placeholder="e.g. Alex"
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
        <Button type="submit" size="lg" loading={busy} icon={null}>
          Create room <ArrowRight className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </Button>
      </form>
    </PanelShell>
  );
}

function JoinPanel({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseRoomCode(code);
    if (!parsed) return setError("Room codes are five letters and numbers.");
    setBusy(true);
    router.push(`/r/${parsed}`);
  }

  return (
    <PanelShell title="Join a room" onBack={onBack}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-1">
        <TextField
          ref={inputRef}
          label="Room code"
          placeholder="K7P2Q"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={ROOM_CODE_LENGTH + 2}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          error={error}
          inputClassName="font-display text-center text-[26px] font-[560] uppercase tracking-[0.32em] placeholder:tracking-[0.32em]"
        />
        <Button type="submit" size="lg" loading={busy}>
          Continue <ArrowRight className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </Button>
      </form>
    </PanelShell>
  );
}
