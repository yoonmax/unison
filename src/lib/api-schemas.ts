import { z } from "zod";

// Request payload schemas. Lengths here are coarse sanity bounds; the precise
// word / nickname rules live in lib/game/normalize.ts and run on the server.

export const NicknameBody = z.object({
  nickname: z.string().max(64),
});

export const SubmitBody = z.object({
  round: z.number().int().min(1).max(100_000),
  word: z.string().max(64),
});

export const KickBody = z.object({
  playerId: z.uuid(),
});

export const HeartbeatBody = z.object({
  connectionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  claim: z.boolean().default(false),
});
