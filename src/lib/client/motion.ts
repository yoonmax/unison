import type { Transition } from "motion/react";

// One shared motion vocabulary. Components pick from these instead of
// inventing per-component timings, so the whole game moves with one voice.

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const duration = {
  press: 0.14,
  small: 0.24,
  layout: 0.4,
};

export const spring = {
  /** Buttons and small controls: quick, a touch of bounce. */
  press: { type: "spring", stiffness: 520, damping: 30, mass: 0.6 },
  /** Cards, list items, layout shifts. */
  soft: { type: "spring", stiffness: 260, damping: 28 },
  /** Big, floaty moves: words drifting together, converging. */
  drift: { type: "spring", stiffness: 120, damping: 20, mass: 1.1 },
  /** Things settling into place with a gentle overshoot. */
  settle: { type: "spring", stiffness: 340, damping: 22 },
} satisfies Record<string, Transition>;

export const fade: Transition = { duration: duration.small, ease: ease.out };

/** Reveal choreography (seconds from the moment a round is revealed). */
export const revealTiming = {
  wordsStart: 0.35,
  wordStagger: 0.12,
  cluster: 1.45,
  caption: 2.35,
};

/** Victory choreography (seconds from the reveal). */
export const victoryTiming = {
  converge: 0.9,
  merge: 1.75,
  title: 2.05,
  subtitle: 2.4,
  results: 2.9,
  /** After this, a refresh shows the settled result instead of replaying. */
  replayWindow: 6,
};
