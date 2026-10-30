import postgres from "postgres";
import { createRoom, getSnapshot, joinRoom, startMatch } from "@/lib/server/rooms";

let admin: postgres.Sql | undefined;

/** Direct database access for assertions and for fast-forwarding time. */
export function adminSql(): postgres.Sql {
  admin ??= postgres(process.env.DATABASE_URL!, { max: 2, prepare: false, onnotice: () => {} });
  return admin;
}

export interface TestPlayer {
  name: string;
  token: string;
}

export interface TestRoom {
  code: string;
  players: TestPlayer[];
}

const NAMES = ["Alex", "Jamie", "Sam", "Taylor"];

export async function roomWith(count: number, names = NAMES): Promise<TestRoom> {
  const host = await createRoom(names[0]);
  const players: TestPlayer[] = [{ name: names[0], token: host.token }];
  for (let i = 1; i < count; i++) {
    const { token } = await joinRoom(host.code, names[i]);
    players.push({ name: names[i], token });
  }
  return { code: host.code, players };
}

/** Skip the intro / reveal window so the current round accepts answers now. */
export async function openCurrentRound(code: string): Promise<void> {
  await adminSql()`
    update unison.rounds r set opens_at = now() - interval '2 seconds'
      from unison.matches m, unison.rooms ro
     where r.match_id = m.id and m.room_id = ro.id and ro.code = ${code}
       and m.status = 'active' and r.status = 'collecting'`;
}

export async function startedRoom(count: number): Promise<TestRoom> {
  const room = await roomWith(count);
  await startMatch(room.code, room.players[0].token);
  await openCurrentRound(room.code);
  return room;
}

export async function snapshotOf(room: TestRoom, index: number) {
  return getSnapshot(room.code, room.players[index].token);
}

/** Make a player look like they stopped sending heartbeats long ago. */
export async function goSilent(code: string, nickname: string): Promise<void> {
  await adminSql()`
    update unison.players p set last_seen_at = now() - interval '5 minutes'
      from unison.rooms r
     where p.room_id = r.id and r.code = ${code} and p.nickname = ${nickname}`;
}

export async function expectGameError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual !== code) {
      throw new Error(`Expected GameError ${code}, got ${actual ?? String(error)}`);
    }
    return;
  }
  throw new Error(`Expected GameError ${code}, but the call succeeded`);
}
