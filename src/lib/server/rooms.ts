import "server-only";
import { randomInt } from "node:crypto";
import { DISCONNECT_AFTER_MS, REVEAL_DURATION_MS, START_INTRO_MS } from "../game/constants";
import { normalizeAnswer, normalizeNickname } from "../game/normalize";
import { generateRoomCode } from "../game/room-code";
import type {
  ConnectionStatus,
  MatchStatus,
  Participant,
  PlayerColor,
  PublicMatch,
  RevealedRound,
  RoomNotice,
  RoomPreview,
  RoomSnapshot,
  RoomStatus,
} from "../types";
import { db } from "./db";
import { GameError, isDbErrorCode, toGameError } from "./errors";
import { hashToken, newSessionToken } from "./session";

// Server operations. Every state transition is a single call into a database
// function (see supabase/migrations), which locks the room row and validates the
// move. This module only translates inputs/outputs and builds viewer snapshots.

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString());

async function callFn<T>(run: () => Promise<{ result: T }[]>): Promise<T> {
  try {
    const rows = await run();
    return rows[0].result;
  } catch (error) {
    throw toGameError(error);
  }
}

function requireNickname(raw: string): string {
  const result = normalizeNickname(raw);
  if (!result.ok) throw new GameError("INVALID_NICKNAME");
  return result.nickname;
}

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------

export async function createRoom(rawNickname: string): Promise<{ code: string; token: string }> {
  const nickname = requireNickname(rawNickname);
  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const sql = db();

  // 31^5 ≈ 28.6M codes; collisions with live rooms are rare, so a few retries suffice.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode(randomInt);
    try {
      await sql`select unison.create_room(${code}, ${nickname}, ${tokenHash}) as result`;
      return { code, token };
    } catch (error) {
      if (isDbErrorCode(error, "CODE_TAKEN")) continue;
      throw toGameError(error);
    }
  }
  throw new GameError("INTERNAL");
}

export async function joinRoom(code: string, rawNickname: string): Promise<{ token: string }> {
  const nickname = requireNickname(rawNickname);
  const token = newSessionToken();
  await callFn(() => db()`select unison.join_room(${code}, ${nickname}, ${hashToken(token)}) as result`);
  return { token };
}

export async function leaveRoom(code: string, token: string): Promise<void> {
  await callFn(() => db()`select unison.leave_room(${code}, ${hashToken(token)}) as result`);
}

export async function removePlayer(code: string, token: string, targetId: string): Promise<void> {
  await callFn(() => db()`select unison.remove_player(${code}, ${hashToken(token)}, ${targetId}::uuid) as result`);
}

export interface HeartbeatResult {
  version: number;
  superseded: boolean;
}

export async function heartbeat(
  code: string,
  token: string,
  connectionId: string,
  claim: boolean,
): Promise<HeartbeatResult> {
  return callFn(
    () =>
      db()`select unison.heartbeat(${code}, ${hashToken(token)}, ${connectionId}, ${claim}, ${DISCONNECT_AFTER_MS}) as result`,
  );
}

// ---------------------------------------------------------------------------
// Match lifecycle
// ---------------------------------------------------------------------------

export async function startMatch(code: string, token: string): Promise<{ started: boolean }> {
  return callFn(
    () =>
      db()`select unison.start_match(${code}, ${hashToken(token)}, ${START_INTRO_MS}, ${DISCONNECT_AFTER_MS}) as result`,
  );
}

export interface SubmitResult {
  status: "accepted" | "duplicate";
  word: string;
  revealed?: boolean;
  unison?: boolean;
}

export async function submitAnswer(
  code: string,
  token: string,
  roundNumber: number,
  rawWord: string,
): Promise<SubmitResult> {
  // Never trust the browser's formatting: normalize again with the shared rules.
  const normalized = normalizeAnswer(rawWord);
  if (!normalized.ok) throw new GameError("INVALID_WORD");
  return callFn(
    () =>
      db()`select unison.submit_answer(${code}, ${hashToken(token)}, ${roundNumber}, ${normalized.word}, ${REVEAL_DURATION_MS}) as result`,
  );
}

export async function endMatch(code: string, token: string): Promise<{ ended: boolean }> {
  return callFn(() => db()`select unison.end_match(${code}, ${hashToken(token)}) as result`);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function previewRoom(code: string): Promise<RoomPreview> {
  const [row] = await db()`
    select r.code, r.status,
           (select count(*)::int from unison.players p where p.room_id = r.id and p.state = 'active') as player_count,
           (select nickname from unison.players p where p.id = r.host_player_id and p.state = 'active') as host_name
      from unison.rooms r
     where r.code = ${code} and r.status <> 'expired' and r.expires_at > now()`;
  if (!row) throw new GameError("ROOM_NOT_FOUND");
  return {
    code: row.code,
    status: row.status as RoomStatus,
    playerCount: row.player_count,
    isFull: row.player_count >= 4,
    hostName: row.host_name ?? null,
  };
}

interface PlayerRow {
  id: string;
  nickname: string;
  avatar_color: PlayerColor;
  state: "active" | "left" | "removed";
  connection_status: ConnectionStatus;
  disconnected_at: Date | null;
  joined_at: Date;
}

/**
 * Build the authorized view of a room for one player. Runs in a single
 * read-only REPEATABLE READ transaction so every part reflects the same instant.
 *
 * Privacy: other players' words are read only through `unison.revealed_answers`
 * (revealed rounds). For the open round we read who submitted, and the
 * viewer's own word — nothing else.
 */
export async function getSnapshot(code: string, token: string): Promise<RoomSnapshot> {
  const tokenHash = hashToken(token);
  try {
    return await db().begin("isolation level repeatable read read only", async (sql) => {
      const [me] = await sql`
        select p.id, p.nickname, p.avatar_color, p.state,
               r.id as room_id, r.code, r.status as room_status, r.host_player_id,
               r.version, r.notice, now() as now
          from unison.players p
          join unison.rooms r on r.id = p.room_id
         where p.session_token_hash = ${tokenHash}
           and r.code = ${code}
           and r.status <> 'expired'
           and r.expires_at > now()`;
      if (!me) throw new GameError("SESSION_INVALID");
      if (me.state === "removed") throw new GameError("REMOVED");
      if (me.state !== "active") throw new GameError("SESSION_INVALID");

      const players = (await sql`
        select id, nickname, avatar_color, state, connection_status, disconnected_at, joined_at
          from unison.players
         where room_id = ${me.room_id}
         order by join_seq`) as unknown as PlayerRow[];

      let match: PublicMatch | null = null;
      const roomStatus = me.room_status as RoomStatus;
      const [matchRow] =
        roomStatus === "playing"
          ? await sql`select * from unison.matches where room_id = ${me.room_id} and status = 'active'`
          : roomStatus === "finished"
            ? await sql`select * from unison.matches where room_id = ${me.room_id} and status = 'won'
                         order by completed_at desc limit 1`
            : [];

      if (matchRow) {
        const roster = await sql`
          select player_id, participant_order from unison.match_participants
           where match_id = ${matchRow.id} order by participant_order`;
        const [round] = await sql`
          select id, round_number, status, opens_at, revealed_at from unison.rounds
           where match_id = ${matchRow.id} and round_number = ${matchRow.current_round_number}`;
        const submitted = await sql`
          select player_id,
                 case when player_id = ${me.id} then normalized_word end as own_word
            from unison.submissions where round_id = ${round.id}`;
        const revealedRounds = await sql`
          select round_number, revealed_at, is_unison from unison.rounds
           where match_id = ${matchRow.id} and status = 'revealed' order by round_number`;
        const answers = await sql`
          select round_number, player_id, normalized_word from unison.revealed_answers
           where match_id = ${matchRow.id}`;

        const byId = new Map(players.map((p) => [p.id, p]));
        const order = new Map<string, number>();
        const participants: Participant[] = roster.map((r) => {
          const p = byId.get(r.player_id);
          order.set(r.player_id, r.participant_order);
          return {
            playerId: r.player_id,
            order: r.participant_order,
            nickname: p?.nickname ?? "Someone",
            color: p?.avatar_color ?? "lavender",
            present: p?.state === "active",
          };
        });

        const rounds: RevealedRound[] = revealedRounds.map((r) => ({
          number: r.round_number,
          revealedAt: iso(r.revealed_at)!,
          isUnison: Boolean(r.is_unison),
          answers: answers
            .filter((a) => a.round_number === r.round_number)
            .sort((a, b) => (order.get(a.player_id) ?? 0) - (order.get(b.player_id) ?? 0))
            .map((a) => ({ playerId: a.player_id, word: a.normalized_word })),
        }));

        match = {
          id: matchRow.id,
          status: matchRow.status as MatchStatus,
          startedAt: iso(matchRow.started_at)!,
          completedAt: iso(matchRow.completed_at),
          finalWord: matchRow.final_word,
          participants,
          currentRound: {
            number: round.round_number,
            status: round.status,
            opensAt: iso(round.opens_at)!,
            revealedAt: iso(round.revealed_at),
            submittedPlayerIds: submitted.map((s) => s.player_id),
            mySubmission: submitted.find((s) => s.player_id === me.id)?.own_word ?? null,
          },
          rounds,
        };
      }

      const snapshot: RoomSnapshot = {
        version: Number(me.version),
        serverNow: iso(me.now)!,
        room: {
          id: me.room_id,
          code: me.code,
          status: roomStatus,
          hostPlayerId: me.host_player_id,
          channel: `unison:room:${me.room_id}`,
        },
        me: { id: me.id, nickname: me.nickname, color: me.avatar_color },
        players: players
          .filter((p) => p.state === "active")
          .map((p) => ({
            id: p.id,
            nickname: p.nickname,
            color: p.avatar_color,
            isHost: p.id === me.host_player_id,
            connection: p.connection_status,
            disconnectedAt: iso(p.disconnected_at),
            joinedAt: iso(p.joined_at)!,
          })),
        match,
        notice: (me.notice as RoomNotice | null) ?? null,
      };
      return snapshot;
    });
  } catch (error) {
    throw toGameError(error);
  }
}

/** Resolve a session to its room without building a full snapshot. */
export async function authenticate(
  code: string,
  token: string,
): Promise<{ roomId: string; playerId: string; version: number }> {
  const [row] = await db()`
    select p.id, p.state, r.id as room_id, r.version
      from unison.players p
      join unison.rooms r on r.id = p.room_id
     where p.session_token_hash = ${hashToken(token)}
       and r.code = ${code} and r.status <> 'expired' and r.expires_at > now()`;
  if (!row) throw new GameError("SESSION_INVALID");
  if (row.state === "removed") throw new GameError("REMOVED");
  if (row.state !== "active") throw new GameError("SESSION_INVALID");
  return { roomId: row.room_id, playerId: row.id, version: Number(row.version) };
}
