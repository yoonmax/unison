"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { spring } from "@/lib/client/motion";
import { cn } from "@/lib/client/cn";

type Variant = "primary" | "secondary" | "ghost" | "quiet";
type Size = "lg" | "md" | "sm";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-paper shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_10px_24px_-14px_rgb(38_38_38/0.7)] hover:bg-[#333] disabled:bg-ink/25 disabled:text-paper/90 disabled:shadow-none",
  secondary:
    "bg-card text-ink ring-1 ring-line-strong shadow-soft hover:ring-ink/25 disabled:text-ink-faint disabled:shadow-none",
  ghost: "bg-transparent text-ink hover:bg-ink/5 disabled:text-ink-faint",
  quiet: "bg-ink/[0.045] text-ink hover:bg-ink/[0.08] disabled:text-ink-faint",
};

const sizes: Record<Size, string> = {
  lg: "h-14 px-7 text-[17px] gap-2.5",
  md: "h-12 px-5 text-[15px] gap-2",
  sm: "h-11 px-4 text-[14px] gap-1.5",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

/** Tactile button: compresses on press, springs back on release. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...props },
  ref,
) {
  const inactive = disabled || loading;
  return (
    <motion.button
      ref={ref}
      whileHover={inactive ? undefined : { y: -1 }}
      whileTap={inactive ? undefined : { scale: 0.965, y: 0 }}
      transition={spring.press}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center rounded-full font-medium tracking-[-0.01em]",
        "transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-soft)]",
        "disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "opacity-0")}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-current"
              animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }}
            />
          ))}
        </span>
      )}
    </motion.button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, children, variant = "ghost", ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size="sm"
      aria-label={label}
      title={label}
      className={cn("size-11 px-0", className)}
      {...props}
    >
      {children}
    </Button>
  );
});
