import type { ApiErrorBody, RoomPreview, RoomSnapshot } from "../types";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("NETWORK", "Can't reach Unison right now.", 0);
  }
  const data = (await response.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!response.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Something went sideways.", response.status);
  }
  return data as T;
}

const room = (code: string, action = "") => `/api/rooms/${code}${action ? `/${action}` : ""}`;

export interface SubmitResponse {
  result: { status: "accepted" | "duplicate"; word: string; revealed?: boolean; unison?: boolean };
  snapshot: RoomSnapshot;
}

export const api = {
  createRoom: (nickname: string) => request<{ code: string }>("/api/rooms", { method: "POST", body: { nickname } }),
  preview: (code: string) => request<{ preview: RoomPreview; member: boolean; removed: boolean }>(room(code)),
  state: (code: string, signal?: AbortSignal) => request<RoomSnapshot>(room(code, "state"), { signal }),
  join: (code: string, nickname: string) =>
    request<RoomSnapshot>(room(code, "join"), { method: "POST", body: { nickname } }),
  leave: (code: string) => request<{ ok: true }>(room(code, "leave"), { method: "POST", body: {} }),
  start: (code: string) => request<RoomSnapshot>(room(code, "start"), { method: "POST", body: {} }),
  end: (code: string) => request<RoomSnapshot>(room(code, "end"), { method: "POST", body: {} }),
  kick: (code: string, playerId: string) =>
    request<RoomSnapshot>(room(code, "kick"), { method: "POST", body: { playerId } }),
  submit: (code: string, round: number, word: string) =>
    request<SubmitResponse>(room(code, "submit"), { method: "POST", body: { round, word } }),
  heartbeat: (code: string, connectionId: string, claim: boolean) =>
    request<{ version: number; superseded: boolean }>(room(code, "heartbeat"), {
      method: "POST",
      body: { connectionId, claim },
    }),
};
