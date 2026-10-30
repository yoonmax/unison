"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

/**
 * Native <dialog> confirm: real modal semantics, focus trapping and Escape
 * handling for free, restyled to match the game.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Not yet",
  destructive,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(92vw,24rem)] rounded-[28px] bg-card p-0 text-ink shadow-lift ring-1 ring-line backdrop:bg-ink/25 backdrop:backdrop-blur-[2px] open:animate-[dialog-in_220ms_var(--ease-soft)]"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="font-display text-[22px] font-[560] tracking-[-0.02em]">
          {title}
        </h2>
        {body && <div className="mt-2 text-[15px] leading-relaxed text-ink-soft">{body}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="quiet" onClick={onClose} autoFocus>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={onConfirm}
            className={destructive ? "bg-peach-deep hover:bg-[#8e4430]" : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
