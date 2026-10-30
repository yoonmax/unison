import "server-only";
import { z } from "zod";

const ServerEnv = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required (see .env.example)." })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// connection string."),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  /** Salt for hashing client IPs in rate-limit buckets (never stored raw). */
  RATE_LIMIT_SALT: z.string().default("unison-dev-salt"),
  /** Multiplies every rate limit. Tests raise it; production leaves it at 1. */
  RATE_LIMIT_SCALE: z.coerce.number().positive().default(1),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | undefined;

/** Validated lazily so `next build` works without a database configured. */
export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = ServerEnv.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid server environment — ${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}
