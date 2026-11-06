"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useSound } from "../providers";
import { ApiError } from "@/lib/client/api";
import { fade, spring } from "@/lib/client/motion";
import { sheenHandlers } from "@/lib/client/sheen";
import { cn } from "@/lib/client/cn";
import { WORD_MAX_LENGTH } from "@/lib/game/constants";
import { ANSWER_ERROR_MESSAGES, normalizeAnswer, REUSED_WORD_MESSAGE } from "@/lib/game/normalize";

const REJECT_FLASH_MS = 1000;

/**
 * The word input. Uppercase as you type, friendly inline validation, Enter or
 * the arrow to lock in. Submitting compresses the box; the locked thought then
 * lifts into the waiting orbit (see WaitingAnimation).
 *
 * A word already played this match is turned away right here: it shakes, goes
 * red for a second, and a note stays until the player edits it. The request is
 * never sent, so nobody else sees anything. (The server enforces the same rule
 * and its refusal lands in the same place.)
 */
export function WordEntry({
  roundNumber,
  usedWords,
  prompt,
  onSubmit,
}: {
  roundNumber: number;
  usedWords: readonly string[];
  prompt: string;
  onSubmit: (word: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reused, setReused] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shake = useAnimationControls();
  const { play } = useSound();
  const id = useId();

  const result = normalizeAnswer(value);
  // Only complain once there's something to complain about.
  const liveError = !result.ok && result.error !== "empty" ? ANSWER_ERROR_MESSAGES[result.error] : null;
  const error = reused ? REUSED_WORD_MESSAGE : (serverError ?? liveError);
  const canSubmit = result.ok && !sending;

  useEffect(() => {
    // Desktop: put the cursor in the box when the round opens. On touch devices
    // we wait for a tap so the keyboard doesn't jump up uninvited.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [roundNumber]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  function rejectReused() {
    setReused(true);
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), REJECT_FLASH_MS);
    void shake.start({ x: [0, -10, 9, -7, 5, -3, 0], transition: { duration: 0.45, ease: "easeOut" } });
    play("reject");
    // Selected, so the next keystroke replaces the word. Waits a frame in case
    // the input was disabled while a request was in flight.
    requestAnimationFrame(() => inputRef.current?.select());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!result.ok) {
      setServerError(ANSWER_ERROR_MESSAGES[result.ok ? "empty" : result.error]);
      inputRef.current?.focus();
      return;
    }
    if (usedWords.includes(result.word)) {
      rejectReused();
      return;
    }
    setSending(true);
    setServerError(null);
    play("pop");
    try {
      await onSubmit(result.word);
    } catch (e) {
      setSending(false);
      if (e instanceof ApiError && e.code === "WORD_ALREADY_USED") {
        rejectReused();
        return;
      }
      setServerError(e instanceof ApiError ? e.message : "That didn't go through. Try again?");
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col items-center" aria-labelledby={`${id}-prompt`}>
      <p id={`${id}-prompt`} className="mb-4 text-center text-[16px] text-balance text-ink-soft">
        {prompt}
      </p>
      <motion.div animate={shake} className="w-full max-w-[26rem]">
        <motion.div
          className={cn(
            // Focus and error use an outline so the glass rim and shadow stay intact.
            "glass flex h-[4.5rem] w-full items-center rounded-[26px] outline-offset-4",
            "transition-[outline-color] duration-200 outline-2",
            flash
              ? "outline-alert/60"
              : error
                ? "outline-peach-deep/40"
                : "outline-transparent focus-within:outline-lavender-deep/30",
          )}
          {...sheenHandlers}
          animate={{ scale: sending ? 0.975 : 1 }}
          transition={spring.press}
        >
          <label htmlFor={id} className="sr-only">
            Your word for round {roundNumber}
          </label>
          <input
            ref={inputRef}
            id={id}
            name="word"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setServerError(null);
              setReused(false);
              setFlash(false);
              if (e.target.value.length > value.length) play("tick");
            }}
            maxLength={WORD_MAX_LENGTH + 1}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="send"
            inputMode="text"
            disabled={sending}
            placeholder="One word"
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-error`}
            data-rejected={flash || undefined}
            className={cn(
              "word-type h-full w-full min-w-0 bg-transparent pr-[4.25rem] pl-6 text-center text-[clamp(1.5rem,7vw,2rem)]",
              "transition-colors duration-150",
              flash ? "text-alert selection:bg-alert/15 selection:text-alert" : "text-ink",
              "placeholder:font-sans placeholder:text-[17px] placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-ink-faint focus:placeholder:text-transparent focus:outline-none disabled:opacity-70",
            )}
          />
          <motion.button
            type="submit"
            aria-label="Lock in your word"
            disabled={!canSubmit}
            whileTap={canSubmit ? { scale: 0.9 } : undefined}
            transition={spring.press}
            className={cn(
              "absolute right-2.5 flex size-12 items-center justify-center rounded-full transition-colors duration-200",
              canSubmit ? "bg-ink text-paper" : "bg-ink/10 text-ink/35",
            )}
          >
            <ArrowUp className="size-5" strokeWidth={2} aria-hidden />
          </motion.button>
        </motion.div>
      </motion.div>
      <div id={`${id}-error`} className="mt-3 min-h-5 text-center text-[13.5px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {error && (
            <motion.p
              key={error}
              className={reused ? "text-alert" : "text-peach-deep"}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
