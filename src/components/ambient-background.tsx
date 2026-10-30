import type { CSSProperties } from "react";

interface Field {
  className: string;
  rgb: string;
  strength: number;
  animation: string;
}

// Four huge, soft color fields in the player palette. They give the glass
// surfaces something to pick up and refract, while staying calm on paper.
const FIELDS: Field[] = [
  {
    className: "-left-[30vmax] -top-[25vmax] size-[80vmax]",
    rgb: "169 155 234",
    strength: 0.62,
    animation: "drift-a 38s var(--ease-in-out-soft) infinite",
  },
  {
    className: "-right-[30vmax] top-[8vh] size-[75vmax]",
    rgb: "149 215 193",
    strength: 0.55,
    animation: "drift-b 46s var(--ease-in-out-soft) infinite",
  },
  {
    className: "-bottom-[35vmax] left-[5vw] size-[85vmax]",
    rgb: "244 185 165",
    strength: 0.55,
    animation: "drift-c 52s var(--ease-in-out-soft) infinite",
  },
  {
    className: "top-[38vh] -left-[20vmax] size-[55vmax]",
    rgb: "168 200 238",
    strength: 0.42,
    animation: "drift-b 60s var(--ease-in-out-soft) infinite reverse",
  },
];

/**
 * Pure CSS transforms on pre-softened radial gradients (no filters), so it is
 * cheap on phones and freezes under prefers-reduced-motion.
 */
export function AmbientBackground({ intensity = "normal" }: { intensity?: "normal" | "quiet" }) {
  const scale = intensity === "quiet" ? 0.8 : 1;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {FIELDS.map((field) => (
        <div
          key={field.rgb}
          className={`absolute rounded-full ${field.className}`}
          style={
            {
              opacity: field.strength * scale,
              background: `radial-gradient(closest-side, rgb(${field.rgb} / 0.55), rgb(${field.rgb} / 0) 70%)`,
              animation: field.animation,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
