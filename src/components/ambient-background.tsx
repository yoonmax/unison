import { cn } from "@/lib/client/cn";

/**
 * Three huge, faint color fields drifting very slowly. Pure CSS transforms on
 * pre-softened radial gradients (no filters), so it is cheap on phones and
 * freezes under prefers-reduced-motion.
 */
export function AmbientBackground({ intensity = "normal" }: { intensity?: "normal" | "quiet" }) {
  const alpha = intensity === "quiet" ? 0.5 : 1;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className={cn("absolute -left-[30vmax] -top-[25vmax] size-[80vmax] rounded-full")}
        style={{
          opacity: 0.55 * alpha,
          background: "radial-gradient(closest-side, rgb(169 155 234 / 0.45), rgb(169 155 234 / 0) 70%)",
          animation: "drift-a 38s var(--ease-in-out-soft) infinite",
        }}
      />
      <div
        className="absolute -right-[30vmax] top-[10vh] size-[75vmax] rounded-full"
        style={{
          opacity: 0.5 * alpha,
          background: "radial-gradient(closest-side, rgb(149 215 193 / 0.45), rgb(149 215 193 / 0) 70%)",
          animation: "drift-b 46s var(--ease-in-out-soft) infinite",
        }}
      />
      <div
        className="absolute -bottom-[35vmax] left-[5vw] size-[85vmax] rounded-full"
        style={{
          opacity: 0.5 * alpha,
          background: "radial-gradient(closest-side, rgb(244 185 165 / 0.42), rgb(244 185 165 / 0) 70%)",
          animation: "drift-c 52s var(--ease-in-out-soft) infinite",
        }}
      />
    </div>
  );
}
