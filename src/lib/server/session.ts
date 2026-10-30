import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 256 bits of entropy, URL-safe. Only its SHA-256 hash is stored. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(token: string | undefined): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** One cookie per room, so a browser can be in a couple of rooms at once. */
export function sessionCookieName(code: string): string {
  return `unison_${code}`;
}
