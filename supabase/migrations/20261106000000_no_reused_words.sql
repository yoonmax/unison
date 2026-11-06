-- A word can only be played once per match: anything revealed in an earlier
-- round, by anyone, is off the table. The check reads revealed rounds only, so a
-- rejection can never reveal what another player has locked in this round, and
-- raising rolls everything back: nothing is stored or broadcast to the others.
--
-- CREATE OR REPLACE resets function settings, so this repeats the empty
-- search_path from 20261021000000.

create or replace function unison.submit_answer(
  p_code text, p_token_hash text, p_round_number integer, p_word text, p_reveal_ms integer
) returns jsonb
language plpgsql
set search_path = ''
as $$
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

  if exists (select 1 from unison.revealed_answers a
             where a.match_id = v_match.id and a.normalized_word = p_word) then
    raise exception 'WORD_ALREADY_USED';
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
