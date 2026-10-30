import "server-only";

const ERRORS = {
  BAD_REQUEST: [400, "That request didn't look right."],
  INVALID_WORD: [400, "Letters only, please."],
  INVALID_NICKNAME: [400, "Letters, numbers and simple punctuation only."],
  INVALID_CODE: [400, "Room codes are five letters and numbers."],
  CANNOT_REMOVE_SELF: [400, "You can't remove yourself — use Leave instead."],
  SESSION_INVALID: [401, "You're not in this room yet."],
  REMOVED: [403, "The host removed you from this room."],
  NOT_HOST: [403, "Only the host can do that."],
  NOT_PARTICIPANT: [403, "You're watching this one — join the next game."],
  FORBIDDEN_ORIGIN: [403, "Requests must come from Unison itself."],
  ROOM_NOT_FOUND: [404, "We couldn't find that room. It may have faded away."],
  PLAYER_NOT_FOUND: [404, "That player already left."],
  ROOM_FULL: [409, "This room is full. Unison is best with up to four minds."],
  MATCH_IN_PROGRESS: [409, "These minds are already syncing. Join their next game."],
  NICKNAME_TAKEN: [409, "Someone here already goes by that name."],
  NOT_ENOUGH_PLAYERS: [409, "Unison needs at least one friend. Send the link!"],
  PLAYERS_DISCONNECTED: [409, "Someone's signal faded. Wait for them, or remove them first."],
  NO_ACTIVE_MATCH: [409, "There's no game in progress."],
  STALE_ROUND: [409, "That round already moved on."],
  ROUND_CLOSED: [409, "That round already closed."],
  ROUND_NOT_OPEN: [409, "Hold that thought — the round hasn't opened yet."],
  RATE_LIMITED: [429, "Easy there — take a breath and try again in a moment."],
  INTERNAL: [500, "Something went sideways. Please try again."],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERRORS;

export class GameError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERRORS[code][1]);
    this.code = code;
    this.status = ERRORS[code][0];
  }
}

function isKnownCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERRORS, value);
}

/**
 * Database functions raise `RAISE EXCEPTION 'CODE'` (SQLSTATE P0001). Translate
 * those into typed GameErrors; anything else is an unexpected failure.
 */
export function toGameError(error: unknown): GameError {
  if (error instanceof GameError) return error;
  const pg = error as { code?: string; message?: string };
  if (pg?.code === "P0001" && pg.message && isKnownCode(pg.message)) {
    return new GameError(pg.message);
  }
  return new GameError("INTERNAL");
}

export function isDbErrorCode(error: unknown, code: string): boolean {
  const pg = error as { code?: string; message?: string };
  return pg?.code === "P0001" && pg.message === code;
}
