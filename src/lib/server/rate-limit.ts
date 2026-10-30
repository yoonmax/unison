import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { serverEnv } from "./env";
import { GameError } from "./errors";

/** Limits per fixed window. Shared across server instances via Postgres. */
export const LIMITS = {
  createRoom: { max: 12, windowSeconds: 600 },
  joinRoom: { max: 30, windowSeconds: 600 },
  lookupRoom: { max: 60, windowSeconds: 60 },
  submit: { max: 40, windowSeconds: 60 },
  action: { max: 60, windowSeconds: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Client IPs are only ever stored as salted hashes. */
export function hashIdentity(value: string): string {
  return createHash("sha256").update(`${serverEnv().RATE_LIMIT_SALT}:${value}`).digest("hex").slice(0, 32);
}

export async function enforceRateLimit(name: LimitName, identity: string): Promise<void> {
  const { max, windowSeconds } = LIMITS[name];
  const scaled = Math.max(1, Math.round(max * serverEnv().RATE_LIMIT_SCALE));
  const [row] = await db()`
    select unison.rate_limit(${`${name}:${hashIdentity(identity)}`}, ${scaled}, ${windowSeconds}) as allowed`;
  if (!row.allowed) throw new GameError("RATE_LIMITED");
}
