-- Unison — initial schema.
--
-- Everything lives in a private `unison` schema that is never exposed through the
-- Supabase Data API. Browsers never talk to these tables: the Next.js server calls
-- the functions below over a privileged connection, and every game transition
-- happens inside one of them.
--
-- Concurrency model: every mutating function first takes a row lock on the room
-- (`select ... for update`). All operations for a room are therefore serialized,
-- which makes "evaluate round completion once", "reveal once", "create the next
-- round once" and "never exceed four players" straightforward to guarantee.

create schema if not exists unison;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table unison.starting_words (
  word text primary key check (word ~ '^[A-Z]{1,24}$')
);

create table unison.rooms (
  id uuid primary key default gen_random_uuid(),
  -- 5 characters, alphabet without the easily confused 0/O, 1/I/L.
  code text not null check (code ~ '^[2-9A-HJKMNP-Z]{5}$'),
  host_player_id uuid,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'finished', 'expired')),
  -- Monotonic state version. Bumped on every visible change and broadcast so
  -- clients can discard out-of-order notifications.
  version bigint not null default 1,
  -- Last human-facing event ("Sam left. The match ended."), keyed by version.
  notice jsonb,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 hours'
);

-- Codes only need to be unique among rooms that are still alive.
create unique index rooms_code_live_idx on unison.rooms (code) where status <> 'expired';
create index rooms_expires_idx on unison.rooms (expires_at);

create table unison.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references unison.rooms (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 16),
  avatar_color text not null
    check (avatar_color in ('lavender', 'mint', 'peach', 'sky', 'butter')),
  -- SHA-256 of the opaque session token. The raw token only ever lives in an
  -- httpOnly cookie in the player's browser.
  session_token_hash text not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'active' check (state in ('active', 'left', 'removed')),
  join_seq integer not null check (join_seq >= 1),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  connection_status text not null default 'connected'
    check (connection_status in ('connected', 'disconnected')),
  disconnected_at timestamptz,
  -- The browser tab currently "holding" this player. A newer tab replaces it.
  active_connection_id text,
  unique (room_id, join_seq)
);

-- Nicknames are unique (case-insensitively) among the people currently in a room.
create unique index players_nickname_live_idx
  on unison.players (room_id, lower(nickname)) where state = 'active';
create unique index players_color_live_idx
  on unison.players (room_id, avatar_color) where state = 'active';
create index players_room_idx on unison.players (room_id);

alter table unison.rooms
  add constraint rooms_host_fk foreign key (host_player_id)
  references unison.players (id) on delete set null;

create table unison.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references unison.rooms (id) on delete cascade,
  starting_word text not null check (starting_word ~ '^[A-Z]{1,24}$'),
  status text not null default 'active' check (status in ('active', 'won', 'abandoned')),
  current_round_number integer not null default 1 check (current_round_number >= 1),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  final_word text check (final_word ~ '^[A-Z]{1,24}$'),
  end_reason text check (end_reason in ('won', 'host_ended', 'player_left')),
  check ((status = 'won') = (final_word is not null))
);

-- A room has at most one match in progress.
create unique index matches_one_active_idx on unison.matches (room_id) where status = 'active';
create index matches_room_started_idx on unison.matches (room_id, started_at desc);

create table unison.match_participants (
  match_id uuid not null references unison.matches (id) on delete cascade,
  player_id uuid not null references unison.players (id) on delete cascade,
  participant_order integer not null check (participant_order between 1 and 4),
  primary key (match_id, player_id),
  unique (match_id, participant_order)
);

create table unison.rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references unison.matches (id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  status text not null default 'collecting' check (status in ('collecting', 'revealed', 'closed')),
  created_at timestamptz not null default now(),
  -- Answers are accepted from this moment. For round 1 it leaves room for the
  -- intro; for later rounds it is the end of the previous reveal window.
  opens_at timestamptz not null default now(),
  revealed_at timestamptz,
  next_round_at timestamptz,
  is_unison boolean,
  unique (match_id, round_number)
);

create table unison.submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references unison.rounds (id) on delete cascade,
  player_id uuid not null references unison.players (id) on delete cascade,
  normalized_word text not null check (normalized_word ~ '^[A-Z]{1,24}$'),
  submitted_at timestamptz not null default now(),
  -- One answer per player per round. Inserts use ON CONFLICT DO NOTHING so the
  -- first valid submission always wins.
  unique (round_id, player_id)
);

create table unison.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (bucket, window_start)
);

-- The only way to read another player's word: a projection limited to rounds
-- that have already been revealed.
create view unison.revealed_answers as
  select r.match_id, r.round_number, s.player_id, s.normalized_word, s.submitted_at
  from unison.submissions s
  join unison.rounds r on r.id = s.round_id
  where r.status = 'revealed';

-- ---------------------------------------------------------------------------
-- Integrity triggers (defence in depth: the functions below already obey these)
-- ---------------------------------------------------------------------------

create function unison.enforce_room_capacity() returns trigger
language plpgsql as $$
begin
  if new.state = 'active' and (tg_op = 'INSERT' or old.state <> 'active') then
    if (select count(*) from unison.players
        where room_id = new.room_id and state = 'active' and id <> new.id) >= 4 then
      raise exception 'ROOM_FULL';
    end if;
  end if;
  return new;
end $$;

create trigger players_capacity before insert or update of state on unison.players
  for each row execute function unison.enforce_room_capacity();

create function unison.guard_match_update() returns trigger
language plpgsql as $$
declare
  v_participants integer;
  v_submitted integer;
  v_distinct integer;
  v_word text;
begin
  if new.starting_word is distinct from old.starting_word then
    raise exception 'STARTING_WORD_IMMUTABLE';
  end if;

  if new.status = 'won' and old.status <> 'won' then
    select count(*) into v_participants from unison.match_participants where match_id = new.id;
    select count(*), count(distinct s.normalized_word), min(s.normalized_word)
      into v_submitted, v_distinct, v_word
      from unison.submissions s
      join unison.rounds r on r.id = s.round_id
      where r.match_id = new.id and r.round_number = new.current_round_number;
    if v_submitted <> v_participants or v_distinct <> 1 or v_word is distinct from new.final_word then
      raise exception 'WIN_NOT_EARNED';
    end if;
  end if;
  return new;
end $$;

create trigger matches_guard before update on unison.matches
  for each row execute function unison.guard_match_update();

create function unison.guard_roster() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'ROSTER_LOCKED';
  end if;
  -- The roster can only be written before the first round exists.
  if exists (select 1 from unison.rounds where match_id = new.match_id) then
    raise exception 'ROSTER_LOCKED';
  end if;
  return new;
end $$;

create trigger match_participants_guard before insert or update on unison.match_participants
  for each row execute function unison.guard_roster();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Fan out "room changed" to subscribers. Both channels are transactional: the
-- message is only delivered if the surrounding transaction commits.
--   * pg_notify  -> local/self-hosted mode (the Next.js server LISTENs)
--   * realtime.send -> Supabase Realtime Broadcast (when available)
-- Payloads only carry the new version number; clients then fetch their own
-- authorized snapshot, so nothing private ever travels over the broadcast.
create function unison.publish(p_room_id uuid, p_version bigint, p_kind text) returns void
language plpgsql as $$
begin
  perform pg_notify('unison_room',
    json_build_object('roomId', p_room_id, 'v', p_version, 'k', p_kind)::text);
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      execute 'select realtime.send($1, $2, $3, false)'
        using jsonb_build_object('v', p_version, 'k', p_kind), 'state', 'unison:room:' || p_room_id::text;
    exception when others then
      -- Never fail a game transition because the broadcast side channel hiccupped;
      -- clients also reconcile via heartbeat version checks.
      raise warning 'unison.publish failed: %', sqlerrm;
    end;
  end if;
end $$;

-- Record activity, bump the version, optionally attach a notice, and publish.
create function unison.bump(p_room_id uuid, p_kind text, p_notice jsonb default null)
returns bigint
language plpgsql as $$
declare
  v_version bigint;
begin
  update unison.rooms
     set version = version + 1,
         last_activity_at = now(),
         -- Rooms live while people are in them; an empty room fades after ~30 minutes.
         expires_at = case
           when exists (select 1 from unison.players where room_id = p_room_id and state = 'active')
             then now() + interval '3 hours'
           else now() + interval '30 minutes'
         end,
         notice = case
           when p_notice is null then notice
           else p_notice || jsonb_build_object('id', version + 1, 'at', now())
         end
   where id = p_room_id
  returning version into v_version;
  perform unison.publish(p_room_id, v_version, p_kind);
  return v_version;
end $$;

-- Resolve a session to its player, lock the player's room, and re-read the player
-- under that lock. Every mutating operation starts here.
create function unison.lock_player(p_code text, p_token_hash text) returns unison.players
language plpgsql as $$
declare
  v_room_id uuid;
  v_player unison.players;
begin
  select p.room_id into v_room_id
    from unison.players p
    join unison.rooms r on r.id = p.room_id
   where p.session_token_hash = p_token_hash
     and r.code = p_code
     and r.status <> 'expired'
     and r.expires_at > now();
  if v_room_id is null then
    raise exception 'SESSION_INVALID';
  end if;

  perform 1 from unison.rooms where id = v_room_id for update;

  select * into v_player from unison.players where session_token_hash = p_token_hash;
  if v_player.state = 'removed' then
    raise exception 'REMOVED';
  elsif v_player.state <> 'active' then
    raise exception 'SESSION_INVALID';
  end if;
  return v_player;
end $$;

-- Make sure the host is an active, connected player. Host privileges go to the
-- longest-present connected player (lowest join_seq). Returns the new host id
-- when it changed, otherwise null. Caller must hold the room lock.
create function unison.ensure_host(p_room_id uuid) returns uuid
language plpgsql as $$
declare
  v_host uuid;
  v_host_ok boolean;
  v_host_active boolean;
  v_candidate uuid;
begin
  select host_player_id into v_host from unison.rooms where id = p_room_id;

  select coalesce(bool_or(state = 'active' and connection_status = 'connected'), false),
         coalesce(bool_or(state = 'active'), false)
    into v_host_ok, v_host_active
    from unison.players where id = v_host;

  if v_host_ok then
    return null;
  end if;

  select id into v_candidate
    from unison.players
   where room_id = p_room_id and state = 'active' and connection_status = 'connected'
   order by join_seq
   limit 1;

  if v_candidate is null then
    -- Nobody is connected. Keep a merely-disconnected host; otherwise fall back
    -- to the longest-present active player (or nobody, for an empty room).
    if v_host_active then
      return null;
    end if;
    select id into v_candidate
      from unison.players
     where room_id = p_room_id and state = 'active'
     order by join_seq
     limit 1;
  end if;

  if v_candidate is distinct from v_host then
    update unison.rooms set host_player_id = v_candidate where id = p_room_id;
    return v_candidate;
  end if;
  return null;
end $$;

create function unison.cleanup() returns void
language plpgsql as $$
begin
  update unison.rooms set status = 'expired'
   where status <> 'expired' and expires_at < now();
  delete from unison.rooms
   where status = 'expired' and expires_at < now() - interval '1 day';
  delete from unison.rate_limits where window_start < now() - interval '2 hours';
end $$;

-- Fixed-window rate limiter shared by every server instance. Returns true when
-- the hit is allowed.
create function unison.rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into unison.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = unison.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- ---------------------------------------------------------------------------
-- Room lifecycle
-- ---------------------------------------------------------------------------

create function unison.create_room(p_code text, p_nickname text, p_token_hash text)
returns jsonb
language plpgsql as $$
declare
  v_room_id uuid;
  v_player_id uuid;
begin
  perform unison.cleanup();
  begin
    insert into unison.rooms (code) values (p_code) returning id into v_room_id;
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  end;
  insert into unison.players (room_id, nickname, avatar_color, session_token_hash, join_seq)
  values (v_room_id, p_nickname, 'lavender', p_token_hash, 1)
  returning id into v_player_id;
  update unison.rooms set host_player_id = v_player_id where id = v_room_id;
  return jsonb_build_object('roomId', v_room_id, 'playerId', v_player_id);
end $$;

create function unison.join_room(p_code text, p_nickname text, p_token_hash text)
returns jsonb
language plpgsql as $$
declare
  v_room unison.rooms;
  v_player_id uuid;
  v_color text;
  v_seq integer;
begin
  -- The room lock makes the capacity check and the insert one atomic step, so
  -- simultaneous joins can never push a room past four players.
  select * into v_room from unison.rooms
   where code = p_code and status <> 'expired'
   for update;
  if not found or v_room.expires_at < now() then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.status = 'playing' then
    raise exception 'MATCH_IN_PROGRESS';
  end if;
  if (select count(*) from unison.players where room_id = v_room.id and state = 'active') >= 4 then
    raise exception 'ROOM_FULL';
  end if;
  if exists (select 1 from unison.players
             where room_id = v_room.id and state = 'active' and lower(nickname) = lower(p_nickname)) then
    raise exception 'NICKNAME_TAKEN';
  end if;

  select c into v_color
    from unnest(array['lavender', 'mint', 'peach', 'sky', 'butter']) with ordinality as t (c, i)
   where c not in (select avatar_color from unison.players where room_id = v_room.id and state = 'active')
   order by i
   limit 1;
  select coalesce(max(join_seq), 0) + 1 into v_seq from unison.players where room_id = v_room.id;

  insert into unison.players (room_id, nickname, avatar_color, session_token_hash, join_seq)
  values (v_room.id, p_nickname, v_color, p_token_hash, v_seq)
  returning id into v_player_id;

  perform unison.ensure_host(v_room.id);
  perform unison.bump(v_room.id, 'player_joined',
    jsonb_build_object('kind', 'player_joined', 'playerId', v_player_id, 'name', p_nickname));
  return jsonb_build_object('roomId', v_room.id, 'playerId', v_player_id);
end $$;

-- Liveness ping from a browser tab. Also sweeps stale connections and repairs
-- host ownership, so no background scheduler is needed.
create function unison.heartbeat(
  p_code text, p_token_hash text, p_connection_id text, p_claim boolean, p_stale_ms integer
) returns jsonb
language plpgsql as $$
declare
  v_player unison.players;
  v_was_disconnected boolean;
  v_changed boolean := false;
  v_notice jsonb := null;
  v_faded text[];
  v_new_host uuid;
  v_version bigint;
begin
  v_player := unison.lock_player(p_code, p_token_hash);
  v_was_disconnected := v_player.connection_status = 'disconnected';

  update unison.players
     set last_seen_at = now(),
         connection_status = 'connected',
         disconnected_at = null,
         active_connection_id = case
           when p_claim or active_connection_id is null then p_connection_id
           else active_connection_id
         end
   where id = v_player.id
  returning * into v_player;

  if v_was_disconnected then
    v_changed := true;
    v_notice := jsonb_build_object('kind', 'player_returned', 'playerId', v_player.id, 'name', v_player.nickname);
  end if;

  with faded as (
    update unison.players
       set connection_status = 'disconnected', disconnected_at = now()
     where room_id = v_player.room_id
       and state = 'active'
       and connection_status = 'connected'
       and last_seen_at < now() - make_interval(secs => p_stale_ms / 1000.0)
    returning nickname
  )
  select array_agg(nickname) into v_faded from faded;

  if v_faded is not null then
    v_changed := true;
    v_notice := jsonb_build_object('kind', 'player_faded', 'names', to_jsonb(v_faded));
  end if;

  v_new_host := unison.ensure_host(v_player.room_id);
  if v_new_host is not null then
    v_changed := true;
  end if;

  if v_changed then
    v_version := unison.bump(v_player.room_id, 'presence', v_notice);
  else
    -- Keep live rooms from expiring without broadcasting anything.
    update unison.rooms set expires_at = now() + interval '3 hours'
     where id = v_player.room_id
    returning version into v_version;
  end if;

  return jsonb_build_object(
    'version', v_version,
    'superseded', v_player.active_connection_id is distinct from p_connection_id
  );
end $$;

create function unison.leave_room(p_code text, p_token_hash text) returns jsonb
language plpgsql as $$
declare
  v_player unison.players;
  v_match_id uuid;
  v_notice jsonb;
begin
  v_player := unison.lock_player(p_code, p_token_hash);

  update unison.players
     set state = 'left', connection_status = 'disconnected', disconnected_at = now(),
         active_connection_id = null
   where id = v_player.id;

  select m.id into v_match_id
    from unison.matches m
    join unison.match_participants mp on mp.match_id = m.id and mp.player_id = v_player.id
   where m.room_id = v_player.room_id and m.status = 'active';

  if v_match_id is not null then
    -- Never quietly shrink the roster: a permanent departure ends the match.
    update unison.matches
       set status = 'abandoned', completed_at = now(), end_reason = 'player_left'
     where id = v_match_id;
    update unison.rounds set status = 'closed' where match_id = v_match_id and status = 'collecting';
    update unison.rooms set status = 'lobby' where id = v_player.room_id;
    v_notice := jsonb_build_object('kind', 'match_abandoned', 'playerId', v_player.id, 'name', v_player.nickname);
  else
    v_notice := jsonb_build_object('kind', 'player_left', 'playerId', v_player.id, 'name', v_player.nickname);
  end if;

  perform unison.ensure_host(v_player.room_id);
  perform unison.bump(v_player.room_id, 'player_left', v_notice);
  return jsonb_build_object('ok', true);
end $$;

create function unison.remove_player(p_code text, p_token_hash text, p_target_id uuid) returns jsonb
language plpgsql as $$
declare
  v_player unison.players;
  v_room unison.rooms;
  v_target unison.players;
begin
  v_player := unison.lock_player(p_code, p_token_hash);
  select * into v_room from unison.rooms where id = v_player.room_id;
  if v_room.host_player_id is distinct from v_player.id then
    raise exception 'NOT_HOST';
  end if;
  if v_room.status = 'playing' then
    raise exception 'MATCH_IN_PROGRESS';
  end if;
  select * into v_target from unison.players
   where id = p_target_id and room_id = v_room.id and state = 'active';
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_target.id = v_player.id then
    raise exception 'CANNOT_REMOVE_SELF';
  end if;

  update unison.players
     set state = 'removed', connection_status = 'disconnected', disconnected_at = now(),
         active_connection_id = null
   where id = v_target.id;
  perform unison.bump(v_room.id, 'player_removed',
    jsonb_build_object('kind', 'player_removed', 'playerId', v_target.id, 'name', v_target.nickname));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Match lifecycle
-- ---------------------------------------------------------------------------

create function unison.start_match(
  p_code text, p_token_hash text, p_intro_ms integer, p_stale_ms integer
) returns jsonb
language plpgsql as $$
declare
  v_player unison.players;
  v_room unison.rooms;
  v_total integer;
  v_connected integer;
  v_word text;
  v_match_id uuid;
begin
  v_player := unison.lock_player(p_code, p_token_hash);
  select * into v_room from unison.rooms where id = v_player.room_id;

  if v_room.host_player_id is distinct from v_player.id then
    raise exception 'NOT_HOST';
  end if;
  if v_room.status = 'playing' then
    -- A concurrent or repeated "start" lost the race: report the existing match
    -- instead of creating another one.
    return jsonb_build_object('started', false, 'alreadyActive', true);
  end if;

  select count(*),
         count(*) filter (where connection_status = 'connected'
                            and last_seen_at > now() - make_interval(secs => p_stale_ms / 1000.0))
    into v_total, v_connected
    from unison.players where room_id = v_room.id and state = 'active';
  if v_total < 2 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;
  if v_connected < v_total then
    raise exception 'PLAYERS_DISCONNECTED';
  end if;

  -- Avoid repeating recent starting words in this lobby when possible.
  select word into v_word from unison.starting_words
   where word not in (
     select starting_word from unison.matches
      where room_id = v_room.id order by started_at desc limit 12)
   order by random() limit 1;
  if v_word is null then
    select word into v_word from unison.starting_words order by random() limit 1;
  end if;
  if v_word is null then
    raise exception 'NO_STARTING_WORDS';
  end if;

  insert into unison.matches (room_id, starting_word) values (v_room.id, v_word)
  returning id into v_match_id;

  -- Freeze the roster before the first round exists (see guard_roster).
  insert into unison.match_participants (match_id, player_id, participant_order)
  select v_match_id, id, row_number() over (order by join_seq)
    from unison.players where room_id = v_room.id and state = 'active';

  insert into unison.rounds (match_id, round_number, opens_at)
  values (v_match_id, 1, now() + make_interval(secs => p_intro_ms / 1000.0));

  update unison.rooms set status = 'playing' where id = v_room.id;
  perform unison.bump(v_room.id, 'match_started', jsonb_build_object('kind', 'match_started'));
  return jsonb_build_object('started', true, 'matchId', v_match_id);
end $$;

create function unison.submit_answer(
  p_code text, p_token_hash text, p_round_number integer, p_word text, p_reveal_ms integer
) returns jsonb
language plpgsql as $$
declare
  v_player unison.players;
  v_match unison.matches;
  v_round unison.rounds;
  v_existing text;
  v_inserted text;
  v_participants integer;
  v_submitted integer;
  v_distinct integer;
  v_unison boolean;
  v_next_at timestamptz;
begin
  v_player := unison.lock_player(p_code, p_token_hash);

  if p_word is null or p_word !~ '^[A-Z]{1,24}$' then
    raise exception 'INVALID_WORD';
  end if;

  -- Idempotency first: a retried request for a round this player already
  -- answered gets the original answer back, even if that round has since closed.
  select s.normalized_word into v_existing
    from unison.submissions s
    join unison.rounds r on r.id = s.round_id
    join unison.matches m on m.id = r.match_id
   where s.player_id = v_player.id
     and r.round_number = p_round_number
     and m.id = (select id from unison.matches where room_id = v_player.room_id
                 order by started_at desc limit 1);
  if v_existing is not null then
    return jsonb_build_object('status', 'duplicate', 'word', v_existing);
  end if;

  select * into v_match from unison.matches
   where room_id = v_player.room_id and status = 'active';
  if not found then
    raise exception 'NO_ACTIVE_MATCH';
  end if;
  if not exists (select 1 from unison.match_participants
                 where match_id = v_match.id and player_id = v_player.id) then
    raise exception 'NOT_PARTICIPANT';
  end if;

  select * into v_round from unison.rounds
   where match_id = v_match.id and round_number = v_match.current_round_number;
  if p_round_number <> v_round.round_number then
    raise exception 'STALE_ROUND';
  end if;
  if v_round.status <> 'collecting' then
    raise exception 'ROUND_CLOSED';
  end if;
  -- One second of tolerance for clock skew between the database and browsers.
  if now() < v_round.opens_at - interval '1 second' then
    raise exception 'ROUND_NOT_OPEN';
  end if;

  insert into unison.submissions (round_id, player_id, normalized_word)
  values (v_round.id, v_player.id, p_word)
  on conflict (round_id, player_id) do nothing
  returning normalized_word into v_inserted;
  if v_inserted is null then
    select normalized_word into v_existing from unison.submissions
     where round_id = v_round.id and player_id = v_player.id;
    return jsonb_build_object('status', 'duplicate', 'word', v_existing);
  end if;

  select count(*) into v_participants from unison.match_participants where match_id = v_match.id;
  select count(*), count(distinct normalized_word) into v_submitted, v_distinct
    from unison.submissions where round_id = v_round.id;

  if v_submitted < v_participants then
    perform unison.bump(v_player.room_id, 'answer_submitted');
    return jsonb_build_object('status', 'accepted', 'word', p_word, 'revealed', false);
  end if;

  -- Last answer in. We hold the room lock and the round is still 'collecting',
  -- so this block runs exactly once per round no matter who submits last.
  v_unison := v_distinct = 1;
  v_next_at := case when v_unison then null else now() + make_interval(secs => p_reveal_ms / 1000.0) end;

  update unison.rounds
     set status = 'revealed', revealed_at = now(), is_unison = v_unison, next_round_at = v_next_at
   where id = v_round.id;

  if v_unison then
    update unison.matches
       set status = 'won', completed_at = now(), final_word = p_word, end_reason = 'won'
     where id = v_match.id;
    update unison.rooms set status = 'finished' where id = v_player.room_id;
  else
    insert into unison.rounds (match_id, round_number, opens_at)
    values (v_match.id, v_round.round_number + 1, v_next_at);
    update unison.matches set current_round_number = v_round.round_number + 1 where id = v_match.id;
  end if;

  perform unison.bump(v_player.room_id, case when v_unison then 'match_won' else 'round_revealed' end);
  return jsonb_build_object('status', 'accepted', 'word', p_word, 'revealed', true, 'unison', v_unison);
end $$;

create function unison.end_match(p_code text, p_token_hash text) returns jsonb
language plpgsql as $$
declare
  v_player unison.players;
  v_room unison.rooms;
  v_match_id uuid;
begin
  v_player := unison.lock_player(p_code, p_token_hash);
  select * into v_room from unison.rooms where id = v_player.room_id;
  if v_room.host_player_id is distinct from v_player.id then
    raise exception 'NOT_HOST';
  end if;

  select id into v_match_id from unison.matches where room_id = v_room.id and status = 'active';
  if v_match_id is null then
    return jsonb_build_object('ended', false);
  end if;

  update unison.matches
     set status = 'abandoned', completed_at = now(), end_reason = 'host_ended'
   where id = v_match_id;
  update unison.rounds set status = 'closed' where match_id = v_match_id and status = 'collecting';
  update unison.rooms set status = 'lobby' where id = v_room.id;
  perform unison.bump(v_room.id, 'match_ended',
    jsonb_build_object('kind', 'match_ended', 'name', v_player.nickname));
  return jsonb_build_object('ended', true);
end $$;

-- ---------------------------------------------------------------------------
-- Permissions: server-only access model
-- ---------------------------------------------------------------------------

alter table unison.starting_words enable row level security;
alter table unison.rooms enable row level security;
alter table unison.players enable row level security;
alter table unison.matches enable row level security;
alter table unison.match_participants enable row level security;
alter table unison.rounds enable row level security;
alter table unison.submissions enable row level security;
alter table unison.rate_limits enable row level security;
-- No policies are defined: only the owning server role can read or write.

revoke all on schema unison from public;
revoke all on all tables in schema unison from public;
revoke all on all functions in schema unison from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema unison from anon, authenticated';
    execute 'revoke all on all tables in schema unison from anon, authenticated';
    execute 'revoke all on all functions in schema unison from anon, authenticated';
    execute 'alter default privileges in schema unison revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema unison revoke all on functions from anon, authenticated';
  end if;
end $$;
