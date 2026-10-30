"use client";

import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { fade } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Visually hide the label (still announced). */
  hideLabel?: boolean;
  inputClassName?: string;
}

/** Large, soft input with an accessible label and inline error. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, hideLabel, className, inputClassName, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={inputId}
        className={cn("text-[13px] font-medium tracking-[0.01em] text-ink-soft", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          "glass h-14 w-full rounded-2xl px-5 text-[17px] text-ink placeholder:text-ink-faint",
          // Outline (not ring) for focus/error, so the glass rim and shadow stay intact.
          "outline-2 outline-offset-2 outline-transparent transition-[outline-color,background-color] duration-200 ease-[var(--ease-soft)]",
          "focus:bg-white/85 focus:outline-lavender-deep/35",
          error && "outline-peach-deep/45 focus:outline-peach-deep/45",
          inputClassName,
        )}
        {...props}
      />
      <div id={messageId} className="min-h-5 text-[13px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.p
              key={error}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={fade}
              className="text-peach-deep"
              role="alert"
            >
              {error}
            </motion.p>
          ) : hint ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-ink-faint"
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
});
