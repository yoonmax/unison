import { describe, expect, it } from "vitest";
import { createRoom, getSnapshot, joinRoom, startMatch, submitAnswer } from "@/lib/server/rooms";
import { adminSql, roomWith, startedRoom } from "../support/game";

// These tests fire real concurrent transactions over separate pooled
// connections; the room-row lock in every database function must serialize them.

async function roundRows(code: string) {
  return adminSql()`
    select r.round_number, r.status from unison.rounds r
      join unison.matches m on m.id = r.match_id
      join unison.rooms ro on ro.id = m.room_id
     where ro.code = ${code} order by r.round_number`;
}

describe("concurrency", () => {
  it("evaluates and reveals a round exactly once when the last answers arrive together", async () => {
    for (let trial = 0; trial < 8; trial++) {
      const room = await startedRoom(4);
      await submitAnswer(room.code, room.players[0].token, 1, "ALPHA");
      await submitAnswer(room.code, room.players[1].token, 1, "BRAVO");
      const results = await Promise.all([
        submitAnswer(room.code, room.players[2].token, 1, "CHARLIE"),
        submitAnswer(room.code, room.players[3].token, 1, "DELTA"),
      ]);
      expect(results.filter((r) => r.revealed)).toHaveLength(1);
      const rounds = await roundRows(room.code);
      expect(rounds.map((r) => [r.round_number, r.status])).toEqual([
        [1, "revealed"],
        [2, "collecting"],
      ]);
    }
  });

  it("declares victory exactly once when everyone answers the same word at once", async () => {
    const room = await startedRoom(4);
    const results = await Promise.all(room.players.map((p) => submitAnswer(room.code, p.token, 1, "UNISON")));
    expect(results.filter((r) => r.unison)).toHaveLength(1);
    const snap = await getSnapshot(room.code, room.players[0].token);
    expect(snap.match).toMatchObject({ status: "won", finalWord: "UNISON" });
    expect(await roundRows(room.code)).toHaveLength(1);
  });

  it("stores duplicate simultaneous requests from one player only once", async () => {
    const room = await startedRoom(3);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => submitAnswer(room.code, room.players[0].token, 1, i % 2 ? "ODD" : "EVEN")),
    );
    const accepted = results.filter((r) => r.status === "accepted");
    expect(accepted).toHaveLength(1);
    // Every duplicate acknowledgment echoes the one stored answer.
    expect(new Set(results.map((r) => r.word))).toEqual(new Set([accepted[0].word]));
    const rows = await adminSql()`
      select count(*)::int as n from unison.submissions s
        join unison.players p on p.id = s.player_id
        join unison.rooms r on r.id = p.room_id where r.code = ${room.code}`;
    expect(rows[0].n).toBe(1);
  });

  it("never lets simultaneous joins push a room past four players", async () => {
    const { code } = await createRoom("Host");
    const attempts = await Promise.allSettled(
      ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus"].map((name) => joinRoom(code, name)),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    const rejected = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(rejected.every((r) => r.reason.code === "ROOM_FULL")).toBe(true);
    const rows = await adminSql()`
      select count(*)::int as n from unison.players p join unison.rooms r on r.id = p.room_id
       where r.code = ${code} and p.state = 'active'`;
    expect(rows[0].n).toBe(4);
  });

  it("creates a single match when the host's start requests race", async () => {
    const room = await roomWith(3);
    const results = await Promise.all(Array.from({ length: 5 }, () => startMatch(room.code, room.players[0].token)));
    expect(results.filter((r) => r.started)).toHaveLength(1);
    const rows = await adminSql()`
      select count(*)::int as n from unison.matches m join unison.rooms r on r.id = m.room_id
       where r.code = ${room.code}`;
    expect(rows[0].n).toBe(1);
  });

  it("creates a single next match when restarts race after a win", async () => {
    const room = await startedRoom(2);
    await submitAnswer(room.code, room.players[0].token, 1, "DONE");
    await submitAnswer(room.code, room.players[1].token, 1, "DONE");
    await Promise.all(Array.from({ length: 4 }, () => startMatch(room.code, room.players[0].token)));
    const rows = await adminSql()`
      select count(*) filter (where m.status = 'active')::int as active, count(*)::int as total
        from unison.matches m join unison.rooms r on r.id = m.room_id where r.code = ${room.code}`;
    expect(rows[0]).toEqual({ active: 1, total: 2 });
  });
});
