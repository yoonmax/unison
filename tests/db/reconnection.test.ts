import { describe, expect, it } from "vitest";
import { getSnapshot, heartbeat, leaveRoom, submitAnswer } from "@/lib/server/rooms";
import { goSilent, snapshotOf, startedRoom } from "../support/game";

describe("reconnection and departures", () => {
  it("restores identity and the locked answer from the session alone", async () => {
    const room = await startedRoom(3);
    await submitAnswer(room.code, room.players[1].token, 1, "LANTERN");
    // A "refresh" is just a new snapshot request with the same cookie.
    const restored = await getSnapshot(room.code, room.players[1].token);
    expect(restored.me.nickname).toBe("Jamie");
    expect(restored.match!.currentRound.mySubmission).toBe("LANTERN");
    expect(restored.match!.currentRound.submittedPlayerIds).toContain(restored.me.id);
  });

  it("never exposes private answers in any other player's reconnection snapshot", async () => {
    const room = await startedRoom(3);
    await submitAnswer(room.code, room.players[0].token, 1, "ZEPHYR");
    await submitAnswer(room.code, room.players[1].token, 1, "QUASAR");
    const third = JSON.stringify(await snapshotOf(room, 2));
    expect(third).not.toContain("ZEPHYR");
    expect(third).not.toContain("QUASAR");
    const first = JSON.stringify(await snapshotOf(room, 0));
    expect(first).toContain("ZEPHYR");
    expect(first).not.toContain("QUASAR");
  });

  it("keeps a disconnected player in the roster so the round waits for them", async () => {
    const room = await startedRoom(3);
    await goSilent(room.code, "Sam");
    await heartbeat(room.code, room.players[0].token, "tab-alex-0001", true);
    let snap = await snapshotOf(room, 0);
    expect(snap.players.find((p) => p.nickname === "Sam")?.connection).toBe("disconnected");
    expect(snap.notice).toMatchObject({ kind: "player_faded", names: ["Sam"] });
    expect(snap.match!.participants).toHaveLength(3);

    await submitAnswer(room.code, room.players[0].token, 1, "WAIT");
    await submitAnswer(room.code, room.players[1].token, 1, "WAIT");
    snap = await snapshotOf(room, 0);
    // Two of three in: no reveal, no victory manufactured.
    expect(snap.match!.rounds).toHaveLength(0);
    expect(snap.match!.status).toBe("active");

    // Sam comes back and finishes the round.
    await heartbeat(room.code, room.players[2].token, "tab-sam-00001", true);
    await submitAnswer(room.code, room.players[2].token, 1, "WAIT");
    expect((await snapshotOf(room, 2)).match).toMatchObject({ status: "won", finalWord: "WAIT" });
  });

  it("ends the match safely when a participant leaves for good", async () => {
    const room = await startedRoom(3);
    await submitAnswer(room.code, room.players[0].token, 1, "SOLO");
    await leaveRoom(room.code, room.players[2].token);
    const snap = await snapshotOf(room, 0);
    expect(snap.room.status).toBe("lobby");
    expect(snap.match).toBeNull();
    expect(snap.players).toHaveLength(2);
    expect(snap.notice).toMatchObject({ kind: "match_abandoned", name: "Sam" });
  });

  it("reassigns host and abandons the match when the host leaves mid-game", async () => {
    const room = await startedRoom(3);
    await leaveRoom(room.code, room.players[0].token);
    const snap = await snapshotOf(room, 1);
    expect(snap.room.status).toBe("lobby");
    expect(snap.players.find((p) => p.isHost)?.nickname).toBe("Jamie");
  });
});
