# Unison

**Different minds. One word.**

A cooperative real-time word game for 2–4 friends. Everyone sees the same starting word and
secretly types one word it brings to mind. The words are revealed together; then everyone tries
again, aiming for the word they think the others will pick. You win when every player submits the
exact same word in the same round.

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Motion for React
- Postgres with all game rules in transactional SQL functions (an embedded Postgres locally, so
  there's nothing to install)
- Server-Sent Events locally, or Supabase Realtime Broadcast when hosted, as a "something changed"
  doorbell
- Vitest unit + database tests, Playwright multi-browser end-to-end tests

## Quick start

Needs Node 20.9+ (tested on Node 24). No Docker, database install or accounts required.

```bash
npm install
```

```bash
npm run dev:local
```

Then open http://localhost:3000, create a room, and open the invite link in a private window (or a
second browser) to play against yourself. Each window counts as its own player.

This is a personal project that runs locally; it isn't hosted anywhere. The app is built to be
deployable (see [Deploying](#deploying-optional-vercel--supabase)), and the Supabase path was
verified end to end against a real Supabase project.

---

## How it works

### Server-authoritative game state

Browsers never write game state. Every action is an HTTP call to a Next.js route handler, which
validates input with Zod and the shared normalizer, authenticates the player's session cookie, and
calls one Postgres function (`supabase/migrations/…_unison_init.sql`):

| Action             | Route                             | Function               |
| ------------------ | --------------------------------- | ---------------------- |
| Create room        | `POST /api/rooms`                 | `unison.create_room`   |
| Room preview       | `GET /api/rooms/:code`            | (read)                 |
| Join               | `POST /api/rooms/:code/join`      | `unison.join_room`     |
| Snapshot/reconnect | `GET /api/rooms/:code/state`      | (read, one snapshot)   |
| Round history      | `GET /api/rooms/:code/history`    | (read, revealed only)  |
| Heartbeat          | `POST /api/rooms/:code/heartbeat` | `unison.heartbeat`     |
| Start / restart    | `POST /api/rooms/:code/start`     | `unison.start_match`   |
| Submit answer      | `POST /api/rooms/:code/submit`    | `unison.submit_answer` |
| End match (host)   | `POST /api/rooms/:code/end`       | `unison.end_match`     |
| Remove player      | `POST /api/rooms/:code/kick`      | `unison.remove_player` |
| Leave              | `POST /api/rooms/:code/leave`     | `unison.leave_room`    |
| Realtime (local)   | `GET /api/rooms/:code/stream`     | SSE over `LISTEN`      |

**Concurrency.** Each mutating function first locks the room row (`SELECT … FOR UPDATE`), so all
operations on one room are serialized. That makes "store each answer once", "reveal once", "decide
victory once", "create the next round once", "never exceed four players" and "one active match"
straightforward, and they are backed by constraints and triggers too (unique `(round_id,
player_id)`, partial unique index on active matches, capacity trigger, a trigger that refuses to
mark a match won unless every participant's answer matches, an immutable participant roster and
starting word). The concurrency tests fire real parallel transactions; removing the lock makes them
fail.

**Answer secrecy.** Unrevealed answers are only ever read by the server, and only to tell a player
their _own_ locked word. Other players' words come exclusively from `unison.revealed_answers`, a
view limited to revealed rounds. Realtime messages carry nothing but `{ v: version }`; each client
then fetches its own authorized snapshot. The whole `unison` schema has RLS enabled with no
policies and no grants to `anon`/`authenticated`, and is not exposed through the Supabase Data API.

**Time.** The server stores `opens_at` / `revealed_at` for each round. The reveal window (4.5 s) and
the round-one intro are just "the next round opens at T"; clients schedule their presentation from
the server clock (offset measured on each fetch). No background jobs or cron are needed:
disconnection sweeps and host hand-off happen inside heartbeats, and room expiry is lazy.

**Sessions.** Joining issues a 256-bit random token in an `httpOnly`, `SameSite=Lax` cookie (one per
room). Only its SHA-256 is stored. A room code never grants identity or host rights. Refreshing,
backgrounding the app or reconnecting restores the same player; opening a second tab takes over
the seat and the first tab offers "Play here instead".

**Disconnects and departures.** A player with no heartbeat for 20 s is shown as away but stays in
the immutable roster, so the round waits for them; after 30 s the host is offered "End game for
everyone". Leaving for good ends the match without a result and returns everyone to the lobby.
Host privileges move on the server to the longest-present connected player.

**Abuse limits.** Room creation, joining, lookups, submissions and host actions are rate limited
in Postgres (shared across serverless instances), with client IPs stored only as salted hashes.
Mutations check the `Origin` header. All user text is rendered by React (escaped) and validated
server-side.

### Normalization

`src/lib/game/normalize.ts` is the single source of truth, used by the browser for instant feedback
and again by the server (and re-checked by a database constraint): NFKC → trim → letters A–Z only,
1–24 characters → uppercase. `apple`, `Apple` and `APPLE` match; `ice cream`, `can't`, `hello!`,
`123`, `café` are rejected with friendly inline messages. Winning is exact equality of normalized
words — never similarity.

### Front end

`src/components` holds the experience: `UnisonWordmark` (four colored minds converge into the dot
of the i), `AmbientBackground`, `LobbyView`, `WordEntry`, `WaitingAnimation` (minds orbit and settle
as players lock in), `RoundWords` (reveal → matching words drift together → the same pills become
the next round's clues), `VictoryView` (pills converge, fringe, merge into one word with a ripple),
`RoundHistory`, `SubmissionProgress`, `ReconnectBanner`, `SoundToggle`. Motion values live in
`src/lib/client/motion.ts`. `useRoomSync` keeps state in sync (version-ordered snapshots, realtime
pings, heartbeats, backoff). Sound is synthesized with Web Audio after the first user gesture and
can be muted (persisted locally). `prefers-reduced-motion` is honored throughout.

---

## Local development

`npm run dev:local` starts an embedded PostgreSQL (data in `.data/postgres`), applies migrations, seeds the
starting words and runs `next dev` on http://localhost:3000. Realtime runs over Server-Sent Events.

To play with yourself, open the room link in a second browser profile or a private window (each
needs its own cookies). To try it on your phone over your LAN, run
`UNISON_INSECURE_COOKIES=1 npm run dev:local -- --hostname 0.0.0.0` and open
`http://<your-computer's-IP>:3000`.

### Using a Supabase database locally

Copy `.env.example` to `.env.local`, fill in `DATABASE_URL` (and optionally the two
`NEXT_PUBLIC_SUPABASE_*` values to use Supabase Realtime), apply the schema, then `npm run dev`:

```bash
npm run db:migrate
```

```bash
npm run dev
```

---

## Tests

```bash
npm test
```

Vitest boots a throwaway embedded Postgres, applies the migrations and runs:

- `tests/unit` — normalization, room codes, starting words, phase derivation, agreement grouping
- `tests/db/rooms` — create/join, 4-player cap, invalid codes, duplicate nicknames, host-only
  start, one-player start refused, host transfer (leave and disconnect), kicking, session scoping
- `tests/db/rounds` — same starting word, secrecy, single submission, reveal timing, next round
  contents, partial vs full agreement, repeated words, stale rounds, server-side validation,
  ending, restart, the win-guard trigger
- `tests/db/concurrency` — simultaneous final answers, simultaneous identical answers, duplicate
  requests, seven simultaneous joins, racing starts and restarts (real parallel transactions)
- `tests/db/reconnection` — refresh restores identity and locked answer, no leaks on reconnect,
  disconnected players keep the round open, departures end the match safely

```bash
npm run test:e2e
```

Playwright builds the app into `.next-e2e`, starts it against a fresh embedded Postgres, and runs:

- `multiplayer.spec.ts` — the full acceptance scenario in three isolated browser contexts (create,
  join by link, join by code, same starting word, BEACH stays secret on screen / in the state and
  history APIs / in every response Jamie's browser received, simultaneous reveal, round 2, all
  converge on SEA, identical victory everywhere, play again)
- `ui.spec.ts` — 320 px layouts with 24-letter words and no horizontal overflow, 44 px targets,
  16 px input text, copy invite link (clipboard), inline validation, mute persistence, a whole
  game played with the keyboard only (focus lands sensibly after each transition), reduced motion
- `resilience.spec.ts` — refresh mid-round, unknown/full/in-progress rooms and taken nicknames,
  leaving mid-game (match ends, host moves), kicking, host ending a game, second-tab takeover

First run only: `npx playwright install chromium`.

Everything at once (typecheck, lint, unit/db tests, production build):

```bash
npm run check
```

---

## Deploying (optional: Vercel + Supabase)

1. **Create a Supabase project** (free tier is fine). In **Project → Connect** copy:
   - the **Transaction pooler** URI (port 6543) → `DATABASE_URL`
   - the **Session pooler** or direct URI (port 5432) → `MIGRATION_DATABASE_URL` (migrations only)

   In **Project Settings → API** copy the Project URL and the **Publishable key**.
   Realtime needs no extra setup: the database broadcasts on public topics named
   `unison:room:<room uuid>` via `realtime.send`, and the payload is only a version number. Public
   (non-private) channels must be allowed in the Realtime settings, which is the default.

2. **Apply the schema and starting words** from your machine:

   ```bash
   MIGRATION_DATABASE_URL="postgresql://…:5432/postgres" npm run db:migrate
   ```

   (Alternatively paste `supabase/migrations/*.sql` and then `supabase/seed.sql` into the SQL
   editor.)

3. **Create the Vercel project** from this repository (framework: Next.js, defaults are fine) and
   set these environment variables for Production (and Preview if you like):

   | Variable                               | Value                                  |
   | -------------------------------------- | -------------------------------------- |
   | `DATABASE_URL`                         | Supabase transaction-pooler URI (6543) |
   | `RATE_LIMIT_SALT`                      | any long random string                 |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`            |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`                     |

   `vercel.json` pins functions to `iad1`, next to a `us-east-1` database; change it if your
   database lives elsewhere.

4. **Deploy**, then verify with real devices: create a room on your phone, open the invite link on
   a laptop and a second phone, play to a win, refresh mid-round, and check `/r/<code>` loads when
   opened directly (nested routes are rendered on demand, so refresh works).

Free-tier notes: Supabase pauses inactive free projects after a week without traffic; Vercel
Hobby is for non-commercial use. Rooms are temporary (empty rooms expire after ~30 minutes, idle
ones after ~3 hours) and are deleted a day after expiring, so storage stays tiny.

### Sharing an existing Supabase project

Everything Unison creates lives in its own `unison` schema (tables, functions, a view, and the
`unison.schema_migrations` bookkeeping table), so it can live inside a project that already hosts
something else without touching that project's tables.

To remove Unison from a shared project completely:

```sql
drop schema unison cascade;
```

### Other hosts

Any long-running Node host works without Supabase Realtime: leave the `NEXT_PUBLIC_SUPABASE_*`
variables unset and the app uses its own SSE stream (`pg_notify` → `LISTEN`). Run a single instance
in that mode, and give it a session-mode (not transaction-pooler) database connection so `LISTEN`
works.

---

## Project layout

```
src/app                    pages (/, /r/[code]) and API route handlers
src/components             home, room (loader, gate, lobby, top bar), game (entry, waiting,
                           reveal, victory, history), ui primitives
src/lib/game               shared rules: normalization, constants, phases, room codes, words
src/lib/server             env validation, db client, sessions, rate limits, operations, SSE bus
src/lib/client             API client, realtime, sync hook, sound engine, motion tokens
supabase/migrations        schema, constraints, RLS, game functions
supabase/seed.sql          starting words (generated: npm run db:seed-sql)
scripts                    migrate, dev-local (embedded Postgres), e2e server
tests, e2e                 Vitest and Playwright suites
```

## Known limitations

- Only one-word English A–Z answers in this version (no accents, digits, phrases).
- Players who leave a room can rejoin as a new seat; there is no spectator mode, so someone
  arriving mid-match is asked to wait for the next game.
- Realtime topics are public-but-unguessable (they use the room's UUID, which only members learn)
  and only ever carry a version number; a removed player who kept that UUID could still see _that_
  the room changed, never what changed.
