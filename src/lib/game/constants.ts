// Game rules and timing shared by the server and the browser. The database
// functions receive the timing values as arguments so there is one source.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const WORD_MAX_LENGTH = 24;
export const NICKNAME_MAX_LENGTH = 16;

/** Intro before round 1 accepts answers (starting word blooms in). */
export const START_INTRO_MS = 2_400;
/** How long a non-winning reveal stays on screen before the next round opens. */
export const REVEAL_DURATION_MS = 4_500;

/** Browsers ping this often while a room is open. */
export const HEARTBEAT_INTERVAL_MS = 8_000;
/** A player with no heartbeat for this long is shown as disconnected. */
export const DISCONNECT_AFTER_MS = 20_000;
/** After this much disconnection, the host is offered to end a stuck round. */
export const STUCK_ROUND_GRACE_MS = 30_000;

/** Notices older than this are not shown as toasts (e.g. after a refresh). */
export const NOTICE_TTL_MS = 15_000;

export const SESSION_TTL_SECONDS = 60 * 60 * 12;
