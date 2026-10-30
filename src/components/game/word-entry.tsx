"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useSound } from "../providers";
import { ApiError } from "@/lib/client/api";
import { fade, spring } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";
import { WORD_MAX_LENGTH } from "@/lib/game/constants";
import { ANSWER_ERROR_MESSAGES, normalizeAnswer } from "@/lib/game/normalize";

/**
 * The word input. Uppercase as you type, friendly inline validation, Enter or
 * the arrow to lock in. The box itself shares a layoutId with the locked pill
 * in WaitingAnimation, so submitting visibly lifts the thought away.
 */
export function WordEntry({
  roundNumber,
  prompt,
  onSubmit,
}: {
  roundNumber: number;
  prompt: string;
  onSubmit: (word: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { play } = useSound();
  const id = useId();

  const result = normalizeAnswer(value);
  // Only complain once there's something to complain about.
  const liveError = !result.ok && result.error !== "empty" ? ANSWER_ERROR_MESSAGES[result.error] : null;
  const error = serverError ?? liveError;
  const canSubmit = result.ok && !sending;

  useEffect(() => {
    // Desktop: put the cursor in the box when the round opens. On touch devices
    // we wait for a tap so the keyboard doesn't jump up uninvited.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [roundNumber]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!result.ok) {
      setServerError(ANSWER_ERROR_MESSAGES[result.ok ? "empty" : result.error]);
      inputRef.current?.focus();
      return;
    }
    setSending(true);
    setServerError(null);
    play("pop");
    try {
      await onSubmit(result.word);
    } catch (e) {
      setSending(false);
      setServerError(e instanceof ApiError ? e.message : "That didn't go through. Try again?");
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col items-center" aria-labelledby={`${id}-prompt`}>
      <p id={`${id}-prompt`} className="mb-4 text-center text-[16px] text-ink-soft">
        {prompt}
      </p>
      <motion.div
        className={cn(
          "relative flex h-[4.5rem] w-full max-w-[26rem] items-center rounded-[26px] bg-card ring-1 ring-line-strong shadow-soft",
          "transition-shadow duration-200 focus-within:shadow-[0_0_0_6px_var(--color-lavender-tint),var(--shadow-soft)] focus-within:ring-lavender-deep/40",
          error && "ring-peach-deep/45",
        )}
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
          className="word-type h-full w-full min-w-0 bg-transparent pr-[4.25rem] pl-6 text-center text-[clamp(1.5rem,7vw,2rem)] text-ink placeholder:font-sans placeholder:text-[17px] placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-ink-faint focus:placeholder:text-transparent focus:outline-none disabled:opacity-70"
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
      <div id={`${id}-error`} className="mt-3 min-h-5 text-center text-[13.5px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {error && (
            <motion.p
              key={error}
              className="text-peach-deep"
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
