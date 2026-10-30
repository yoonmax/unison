import "server-only";
import { cookies } from "next/headers";
import type { z } from "zod";
import { SESSION_TTL_SECONDS } from "../game/constants";
import { parseRoomCode } from "../game/room-code";
import type { ApiErrorBody } from "../types";
import { GameError, toGameError } from "./errors";
import { isWellFormedToken, sessionCookieName } from "./session";

const NO_STORE = { "cache-control": "no-store" };

export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function errorResponse(error: unknown): Response {
  const gameError = toGameError(error);
  if (gameError.code === "INTERNAL") console.error("[unison]", error);
  const body: ApiErrorBody = { error: { code: gameError.code, message: gameError.message } };
  return json(body, gameError.status);
}

/**
 * Light CSRF protection for cookie-authenticated mutations: when a browser
 * sends an Origin, it must match the host serving the API.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new GameError("FORBIDDEN_ORIGIN");
  } catch (error) {
    if (error instanceof GameError) throw error;
    throw new GameError("FORBIDDEN_ORIGIN");
  }
}

export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new GameError("BAD_REQUEST");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new GameError("BAD_REQUEST");
  return parsed.data;
}

export async function roomCodeFrom(params: Promise<{ code: string }>): Promise<string> {
  const { code } = await params;
  const parsed = parseRoomCode(code);
  if (!parsed) throw new GameError("INVALID_CODE");
  return parsed;
}

export async function readSessionToken(code: string): Promise<string | null> {
  const value = (await cookies()).get(sessionCookieName(code))?.value;
  return isWellFormedToken(value) ? value : null;
}

export async function requireSessionToken(code: string): Promise<string> {
  const token = await readSessionToken(code);
  if (!token) throw new GameError("SESSION_INVALID");
  return token;
}

export async function setSessionCookie(code: string, token: string): Promise<void> {
  (await cookies()).set(sessionCookieName(code), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.UNISON_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(code: string): Promise<void> {
  (await cookies()).delete(sessionCookieName(code));
}

export function clientIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

/** Run a route body, turning any thrown error into a JSON error response. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return errorResponse(error);
  }
}
