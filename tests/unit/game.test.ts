import { describe, expect, it } from "vitest";
import { randomInt } from "node:crypto";
import { agreementLine, clusterAnswers } from "@/lib/game/clusters";
import { derivePhase, nextPhaseBoundary } from "@/lib/game/phase";
import { generateRoomCode, parseRoomCode, ROOM_CODE_ALPHABET } from "@/lib/game/room-code";
import type { RoomSnapshot } from "@/lib/types";

describe("room codes", () => {
  it("never uses easily confused characters", () => {
    for (const ch of "0O1IL") expect(ROOM_CODE_ALPHABET).not.toContain(ch);
  });

  it("generates valid five-character codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(randomInt);
      expect(parseRoomCode(code)).toBe(code);
    }
  });

  it("parses friendly input", () => {
    expect(parseRoomCode("k7p2q")).toBe("K7P2Q");
    expect(parseRoomCode(" K7P-2Q ")).toBe("K7P2Q");
    expect(parseRoomCode("K0P2Q")).toBeNull();
    expect(parseRoomCode("K7P2")).toBeNull();
  });
});

describe("clusters", () => {
  const a = (playerId: string, word: string) => ({ playerId, word });

  it("groups matching words, biggest group first", () => {
    const clusters = clusterAnswers([a("1", "APPLE"), a("2", "BANANA"), a("3", "APPLE"), a("4", "APPLE")]);
    expect(clusters.map((c) => [c.word, c.answers.length])).toEqual([
      ["APPLE", 3],
      ["BANANA", 1],
    ]);
  });

  it("describes agreement gently", () => {
    expect(agreementLine([a("1", "A"), a("2", "A"), a("3", "A"), a("4", "B")])).toBe("Three minds met. One to go.");
    expect(agreementLine([a("1", "A"), a("2", "A"), a("3", "B"), a("4", "B")])).toBe("Two pairs. Getting warmer.");
    expect(agreementLine([a("1", "A"), a("2", "B"), a("3", "C")])).toBe("Every mind took its own path.");
    expect(agreementLine([a("1", "A"), a("2", "A"), a("3", "B"), a("4", "C")])).toBe("Almost in sync.");
    expect(agreementLine([a("1", "A"), a("2", "A")])).toBe("One word. All of you.");
  });

  it("treats a scattered first round as the expected starting point", () => {
    expect(agreementLine([a("1", "A"), a("2", "B"), a("3", "C")], 1)).toBe(
      "Three starting points. Now find the middle.",
    );
    expect(agreementLine([a("1", "A"), a("2", "B")], 1)).toBe("Two starting points. Now find the middle.");
    expect(agreementLine([a("1", "A"), a("2", "A"), a("3", "B")], 1)).toBe("Two minds met. One to go.");
  });
});

describe("phase", () => {
  const base = (overrides: Partial<RoomSnapshot["match"]> = {}, status: RoomSnapshot["room"]["status"] = "playing") =>
    ({
      version: 1,
      serverNow: new Date(0).toISOString(),
      room: { id: "r", code: "K7P2Q", status, hostPlayerId: "p", channel: "c" },
      me: { id: "p", nickname: "A", color: "mint" },
      players: [],
      notice: null,
      match: {
        id: "m",
        status: "active",
        startedAt: new Date(0).toISOString(),
        completedAt: null,
        finalWord: null,
        participants: [],
        rounds: [],
        currentRound: {
          number: 1,
          status: "collecting",
          opensAt: new Date(1000).toISOString(),
          revealedAt: null,
          submittedPlayerIds: [],
          mySubmission: null,
        },
        ...overrides,
      },
    }) as RoomSnapshot;

  it("walks STARTING → COLLECTING for round one", () => {
    const snap = base();
    expect(derivePhase(snap, 500)).toBe("starting");
    expect(nextPhaseBoundary(snap, 500)).toBe(1000);
    expect(derivePhase(snap, 1000)).toBe("collecting");
    expect(nextPhaseBoundary(snap, 1000)).toBeNull();
  });

  it("shows REVEALING until the next round opens", () => {
    const snap = base({
      currentRound: { ...base().match!.currentRound, number: 2, opensAt: new Date(5000).toISOString() },
    });
    expect(derivePhase(snap, 4000)).toBe("revealing");
    expect(derivePhase(snap, 5000)).toBe("collecting");
  });

  it("maps won and lobby states", () => {
    expect(derivePhase(base({ status: "won" }, "finished"), 0)).toBe("won");
    expect(derivePhase({ ...base(), room: { ...base().room, status: "lobby" }, match: null }, 0)).toBe("lobby");
  });
});
