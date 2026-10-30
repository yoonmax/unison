-- Round one no longer starts from a word the game hands out: every player opens
-- with any word of their own, in secret, and the game converges from there.
-- The curated starting-word list and each match's starting word go away.
--
-- CREATE OR REPLACE resets function settings, so each replaced function repeats
-- the empty search_path from 20261021000000.

create or replace function unison.guard_match_update() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_participants integer;
  v_submitted integer;
  v_distinct integer;
  v_word text;
begin
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

alter table unison.matches drop column starting_word;
drop table unison.starting_words;

create or replace function unison.start_match(
  p_code text, p_token_hash text, p_intro_ms integer, p_stale_ms integer
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_player unison.players;
  v_room unison.rooms;
  v_total integer;
  v_connected integer;
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

  insert into unison.matches (room_id) values (v_room.id)
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
