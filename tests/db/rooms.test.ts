import { describe, expect, it } from "vitest";
import {
  createRoom,
  getSnapshot,
  heartbeat,
  joinRoom,
  leaveRoom,
  previewRoom,
  removePlayer,
  startMatch,
} from "@/lib/server/rooms";
import { adminSql, expectGameError, goSilent, roomWith } from "../support/game";

describe("rooms", () => {
  it("lets a host create a room and become its host", async () => {
    const { code, token } = await createRoom("Alex");
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}$/);
    const snap = await getSnapshot(code, token);
    expect(snap.room.status).toBe("lobby");
    expect(snap.players).toHaveLength(1);
    expect(snap.players[0]).toMatchObject({ nickname: "Alex", isHost: true, color: "lavender" });
    expect(snap.room.hostPlayerId).toBe(snap.me.id);
  });

  it("stores only a hash of the session token", async () => {
    const { code, token } = await createRoom("Hashy");
    const rows = await adminSql()`
      select session_token_hash from unison.players p join unison.rooms r on r.id = p.room_id where r.code = ${code}`;
    expect(rows[0].session_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].session_token_hash).not.toContain(token);
  });

  it("admits a second through fourth player and rejects the fifth", async () => {
    const room = await roomWith(4);
    const snap = await getSnapshot(room.code, room.players[3].token);
    expect(snap.players.map((p) => p.nickname)).toEqual(["Alex", "Jamie", "Sam", "Taylor"]);
    expect(new Set(snap.players.map((p) => p.color)).size).toBe(4);
    await expectGameError(joinRoom(room.code, "Fifth"), "ROOM_FULL");
    expect((await previewRoom(room.code)).isFull).toBe(true);
  });

  it("rejects unknown room codes", async () => {
    await expectGameError(previewRoom("ZZZZZ"), "ROOM_NOT_FOUND");
    await expectGameError(joinRoom("ZZZZZ", "Nobody"), "ROOM_NOT_FOUND");
  });

  it("rejects duplicate nicknames, ignoring case", async () => {
    const room = await roomWith(1);
    await expectGameError(joinRoom(room.code, "alex"), "NICKNAME_TAKEN");
    await expectGameError(joinRoom(room.code, "ALEX "), "NICKNAME_TAKEN");
  });

  it("rejects invalid nicknames on the server", async () => {
    const room = await roomWith(1);
    await expectGameError(joinRoom(room.code, "   "), "INVALID_NICKNAME");
    await expectGameError(joinRoom(room.code, "a".repeat(17)), "INVALID_NICKNAME");
    await expectGameError(joinRoom(room.code, "bad\u0007name"), "INVALID_NICKNAME");
  });

  it("only lets the host start, and never with one player", async () => {
    const solo = await roomWith(1);
    await expectGameError(startMatch(solo.code, solo.players[0].token), "NOT_ENOUGH_PLAYERS");

    const room = await roomWith(2);
    await expectGameError(startMatch(room.code, room.players[1].token), "NOT_HOST");
    await startMatch(room.code, room.players[0].token);
    expect((await getSnapshot(room.code, room.players[1].token)).room.status).toBe("playing");
  });

  it("does not let new players join a match in progress", async () => {
    const room = await roomWith(2);
    await startMatch(room.code, room.players[0].token);
    await expectGameError(joinRoom(room.code, "Late"), "MATCH_IN_PROGRESS");
  });

  it("transfers host to the longest-present player when the host leaves", async () => {
    const room = await roomWith(3);
    await leaveRoom(room.code, room.players[0].token);
    const snap = await getSnapshot(room.code, room.players[2].token);
    expect(snap.players.find((p) => p.isHost)?.nickname).toBe("Jamie");
    expect(snap.notice).toMatchObject({ kind: "player_left", name: "Alex" });
    // The old session no longer works.
    await expectGameError(getSnapshot(room.code, room.players[0].token), "SESSION_INVALID");
  });

  it("transfers host when the host's connection fades", async () => {
    const room = await roomWith(3);
    await goSilent(room.code, "Alex");
    await heartbeat(room.code, room.players[2].token, "conn-sam-0001", true);
    const snap = await getSnapshot(room.code, room.players[2].token);
    const alex = snap.players.find((p) => p.nickname === "Alex");
    expect(alex?.connection).toBe("disconnected");
    expect(snap.players.find((p) => p.isHost)?.nickname).toBe("Jamie");
    // The host cannot be claimed by a client: Alex returning does not restore it.
    await heartbeat(room.code, room.players[0].token, "conn-alex-001", true);
    const after = await getSnapshot(room.code, room.players[0].token);
    expect(after.players.find((p) => p.isHost)?.nickname).toBe("Jamie");
    expect(after.players.find((p) => p.nickname === "Alex")?.connection).toBe("connected");
  });

  it("lets the host remove a player from the lobby, and only the host", async () => {
    const room = await roomWith(3);
    const snap = await getSnapshot(room.code, room.players[0].token);
    const sam = snap.players.find((p) => p.nickname === "Sam")!;
    await expectGameError(removePlayer(room.code, room.players[1].token, sam.id), "NOT_HOST");
    await removePlayer(room.code, room.players[0].token, sam.id);
    await expectGameError(getSnapshot(room.code, room.players[2].token), "REMOVED");
    expect((await getSnapshot(room.code, room.players[0].token)).players).toHaveLength(2);
    // Their nickname is free again.
    await joinRoom(room.code, "Sam");
  });

  it("refuses to start while a lobby player is disconnected", async () => {
    const room = await roomWith(2);
    await goSilent(room.code, "Jamie");
    await expectGameError(startMatch(room.code, room.players[0].token), "PLAYERS_DISCONNECTED");
  });

  it("does not let a room code act as a credential", async () => {
    const a = await roomWith(2);
    const b = await roomWith(2);
    // A valid session for room B cannot be used against room A.
    await expectGameError(getSnapshot(a.code, b.players[0].token), "SESSION_INVALID");
    await expectGameError(startMatch(a.code, b.players[0].token), "SESSION_INVALID");
  });

  it("marks a tab as superseded when another tab claims the player", async () => {
    const room = await roomWith(2);
    const first = await heartbeat(room.code, room.players[1].token, "tab-one-0001", true);
    expect(first.superseded).toBe(false);
    await heartbeat(room.code, room.players[1].token, "tab-two-0002", true);
    const stale = await heartbeat(room.code, room.players[1].token, "tab-one-0001", false);
    expect(stale.superseded).toBe(true);
  });
});
