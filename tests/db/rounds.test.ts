import { describe, expect, it } from "vitest";
import { endMatch, getSnapshot, startMatch, submitAnswer } from "@/lib/server/rooms";
import { STARTING_WORDS } from "@/lib/game/starting-words";
import { adminSql, expectGameError, openCurrentRound, snapshotOf, startedRoom } from "../support/game";

// Words that are not starting words, so they can't appear in a snapshot by coincidence.
const SECRET = "QUIXOTIC";

describe("rounds", () => {
  it("gives every player the same starting word from the curated list", async () => {
    const room = await startedRoom(3);
    const words = await Promise.all([0, 1, 2].map(async (i) => (await snapshotOf(room, i)).match!.startingWord));
    expect(new Set(words).size).toBe(1);
    expect(STARTING_WORDS).toContain(words[0]);
  });

  it("keeps submitted answers secret until everyone has answered", async () => {
    const room = await startedRoom(3);
    const ack = await submitAnswer(room.code, room.players[0].token, 1, SECRET.toLowerCase());
    expect(ack).toMatchObject({ status: "accepted", word: SECRET, revealed: false });

    const others = await snapshotOf(room, 1);
    expect(JSON.stringify(others)).not.toContain(SECRET);
    expect(others.match!.currentRound.submittedPlayerIds).toHaveLength(1);
    expect(others.match!.currentRound.mySubmission).toBeNull();
    expect(others.match!.rounds).toHaveLength(0);

    // The submitter sees their own locked word.
    const own = await snapshotOf(room, 0);
    expect(own.match!.currentRound.mySubmission).toBe(SECRET);
  });

  it("accepts one answer per player per round and never overwrites it", async () => {
    const room = await startedRoom(2);
    await submitAnswer(room.code, room.players[0].token, 1, "APPLE");
    const again = await submitAnswer(room.code, room.players[0].token, 1, "BANANA");
    expect(again).toEqual({ status: "duplicate", word: "APPLE" });
    const rows = await adminSql()`
      select count(*)::int as n from unison.submissions s
        join unison.rounds r on r.id = s.round_id
        join unison.matches m on m.id = r.match_id
        join unison.rooms ro on ro.id = m.room_id
       where ro.code = ${room.code}`;
    expect(rows[0].n).toBe(1);
  });

  it("reveals only after all participants submit, then opens the next round with those words", async () => {
    const room = await startedRoom(3);
    await submitAnswer(room.code, room.players[0].token, 1, "BEACH");
    await submitAnswer(room.code, room.players[1].token, 1, "WATER");
    expect((await snapshotOf(room, 2)).match!.rounds).toHaveLength(0);

    const last = await submitAnswer(room.code, room.players[2].token, 1, "FISH");
    expect(last).toMatchObject({ revealed: true, unison: false });

    const snap = await snapshotOf(room, 1);
    expect(snap.match!.rounds).toHaveLength(1);
    expect(snap.match!.rounds[0].answers.map((a) => a.word)).toEqual(["BEACH", "WATER", "FISH"]);
    expect(snap.match!.currentRound.number).toBe(2);
    expect(snap.match!.currentRound.submittedPlayerIds).toEqual([]);
    // The next round opens after the synchronized reveal window.
    expect(Date.parse(snap.match!.currentRound.opensAt)).toBeGreaterThan(Date.parse(snap.serverNow));
  });

  it("treats partial agreement as another round and full agreement as a win", async () => {
    const room = await startedRoom(4);
    for (const [i, word] of ["APPLE", "APPLE", "APPLE", "BANANA"].entries()) {
      await submitAnswer(room.code, room.players[i].token, 1, word);
    }
    let snap = await snapshotOf(room, 0);
    expect(snap.match!.status).toBe("active");
    expect(snap.match!.rounds[0].isUnison).toBe(false);

    await openCurrentRound(room.code);
    // Mixed case still matches after normalization.
    for (const [i, word] of ["apple", "APPLE", "Apple", " apple "].entries()) {
      await submitAnswer(room.code, room.players[i].token, 2, word);
    }
    snap = await snapshotOf(room, 3);
    expect(snap.room.status).toBe("finished");
    expect(snap.match).toMatchObject({ status: "won", finalWord: "APPLE" });
    expect(snap.match!.rounds).toHaveLength(2);
    expect(snap.match!.rounds[1].isUnison).toBe(true);
  });

  it("does not treat similar but different words as a match", async () => {
    const room = await startedRoom(2);
    await submitAnswer(room.code, room.players[0].token, 1, "COLOR");
    await submitAnswer(room.code, room.players[1].token, 1, "COLOUR");
    expect((await snapshotOf(room, 0)).match!.status).toBe("active");
  });

  it("allows repeated words, including the starting word", async () => {
    const room = await startedRoom(2);
    const start = (await snapshotOf(room, 0)).match!.startingWord;
    await submitAnswer(room.code, room.players[0].token, 1, "ECHO");
    await submitAnswer(room.code, room.players[1].token, 1, start);
    await openCurrentRound(room.code);
    await submitAnswer(room.code, room.players[0].token, 2, "ECHO");
    await submitAnswer(room.code, room.players[1].token, 2, start);
    await openCurrentRound(room.code);
    await submitAnswer(room.code, room.players[0].token, 3, start);
    await submitAnswer(room.code, room.players[1].token, 3, start);
    const snap = await snapshotOf(room, 0);
    expect(snap.match).toMatchObject({ status: "won", finalWord: start });
    expect(snap.match!.rounds.map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it("rejects answers for a previous round and before a round opens", async () => {
    const room = await startedRoom(2);
    await submitAnswer(room.code, room.players[0].token, 1, "ONE");
    await submitAnswer(room.code, room.players[1].token, 1, "TWO");
    // Round 2 is still in its reveal window.
    await expectGameError(submitAnswer(room.code, room.players[0].token, 2, "THREE"), "ROUND_NOT_OPEN");
    await openCurrentRound(room.code);
    await expectGameError(submitAnswer(room.code, room.players[1].token, 3, "FOUR"), "STALE_ROUND");
    // A retry of round 1 gets the original acknowledgment back rather than a new answer.
    expect(await submitAnswer(room.code, room.players[1].token, 1, "OTHER")).toEqual({
      status: "duplicate",
      word: "TWO",
    });
  });

  it("validates words on the server regardless of the client", async () => {
    const room = await startedRoom(2);
    for (const bad of ["", "ice cream", "can't", "hello!", "123", "café", "a".repeat(25)]) {
      await expectGameError(submitAnswer(room.code, room.players[0].token, 1, bad), "INVALID_WORD");
    }
  });

  it("lets the host end a match, returning everyone to the lobby without a result", async () => {
    const room = await startedRoom(2);
    await expectGameError(endMatch(room.code, room.players[1].token), "NOT_HOST");
    await endMatch(room.code, room.players[0].token);
    const snap = await snapshotOf(room, 1);
    expect(snap.room.status).toBe("lobby");
    expect(snap.match).toBeNull();
    expect(snap.notice).toMatchObject({ kind: "match_ended" });
    await expectGameError(submitAnswer(room.code, room.players[1].token, 1, "LATE"), "NO_ACTIVE_MATCH");
  });

  it("lets the host start another match after a win, with a different starting word", async () => {
    const room = await startedRoom(2);
    const first = (await snapshotOf(room, 0)).match!;
    await submitAnswer(room.code, room.players[0].token, 1, "SAME");
    await submitAnswer(room.code, room.players[1].token, 1, "SAME");
    await startMatch(room.code, room.players[0].token);
    const next = (await getSnapshot(room.code, room.players[1].token)).match!;
    expect(next.id).not.toBe(first.id);
    expect(next.status).toBe("active");
    expect(next.currentRound.number).toBe(1);
    expect(next.startingWord).not.toBe(first.startingWord);
  });

  it("refuses to mark a match won unless every answer matches (database guard)", async () => {
    const room = await startedRoom(2);
    await submitAnswer(room.code, room.players[0].token, 1, "LEFT");
    await expect(adminSql()`
      update unison.matches m set status = 'won', final_word = 'LEFT'
        from unison.rooms r where m.room_id = r.id and r.code = ${room.code}`).rejects.toThrow(/WIN_NOT_EARNED/);
  });
});
