"use client";

import type { PointerEvent } from "react";

// Moves a .glass surface's specular highlight toward the pointer by setting two
// CSS custom properties directly on the element: no React state, no re-render.

function place(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--sheen-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  el.style.setProperty("--sheen-y", `${((event.clientY - rect.top) / rect.height) * 100 - 40}%`);
}

function reset(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.removeProperty("--sheen-x");
  event.currentTarget.style.removeProperty("--sheen-y");
}

export const sheenHandlers = { onPointerMove: place, onPointerLeave: reset };
