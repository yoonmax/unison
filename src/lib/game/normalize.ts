import { NICKNAME_MAX_LENGTH, WORD_MAX_LENGTH } from "./constants";

/**
 * The single canonical answer normalization used for validation and for every
 * comparison, on both client (instant feedback) and server (authority).
 *
 * Pipeline: Unicode NFKC → trim → validate A–Z only → uppercase.
 *
 * Validation happens on the NFKC form *before* uppercasing so characters that
 * expand or fold on uppercase (ß → SS, ı → I) are rejected instead of silently
 * turning into a different word. Nothing inside the word is ever stripped.
 */
export type AnswerError = "empty" | "multiple_words" | "too_long" | "invalid_chars";

export type AnswerResult = { ok: true; word: string } | { ok: false; error: AnswerError };

const LETTERS_ONLY = /^[A-Za-z]+$/;
const WHITESPACE = /\s/u;

export function normalizeAnswer(raw: string): AnswerResult {
  const value = raw.normalize("NFKC").trim();
  if (value.length === 0) return { ok: false, error: "empty" };
  if (WHITESPACE.test(value)) return { ok: false, error: "multiple_words" };
  if (Array.from(value).length > WORD_MAX_LENGTH) return { ok: false, error: "too_long" };
  if (!LETTERS_ONLY.test(value)) return { ok: false, error: "invalid_chars" };
  // ASCII-only at this point, so toUpperCase is locale-independent.
  return { ok: true, word: value.toUpperCase() };
}

/** Exact normalized equality across every answer — the only win condition. */
export function isUnison(words: readonly string[], participantCount: number): boolean {
  if (participantCount < 2 || words.length !== participantCount) return false;
  const normalized = words.map((w) => normalizeAnswer(w));
  if (normalized.some((n) => !n.ok)) return false;
  const first = (normalized[0] as { ok: true; word: string }).word;
  return normalized.every((n) => n.ok && n.word === first);
}

export const ANSWER_ERROR_MESSAGES: Record<AnswerError, string> = {
  empty: "Type a word first.",
  multiple_words: "Just one word for now.",
  too_long: `That's a long one — ${WORD_MAX_LENGTH} letters max.`,
  invalid_chars: "Letters only, please.",
};

export type NicknameError = "empty" | "too_long" | "invalid_chars";
export type NicknameResult = { ok: true; nickname: string } | { ok: false; error: NicknameError };

// Letters and numbers from any script, spaces, and a little friendly punctuation.
const NICKNAME_ALLOWED = /^[\p{L}\p{M}\p{N} .,'’_\-!?&()]+$/u;

export function normalizeNickname(raw: string): NicknameResult {
  const value = raw.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (value.length === 0) return { ok: false, error: "empty" };
  if (Array.from(value).length > NICKNAME_MAX_LENGTH) return { ok: false, error: "too_long" };
  if (!NICKNAME_ALLOWED.test(value)) return { ok: false, error: "invalid_chars" };
  return { ok: true, nickname: value };
}

export const NICKNAME_ERROR_MESSAGES: Record<NicknameError, string> = {
  empty: "What should we call you?",
  too_long: `Keep it under ${NICKNAME_MAX_LENGTH + 1} characters.`,
  invalid_chars: "Letters, numbers and simple punctuation only.",
};
