-- FPL Snake Draft — online multiplayer schema.
--
-- Security model (Approach A, no accounts):
--   * Public tables (drafts, seats, draft_players, picks) are READ-ONLY to the
--     anonymous key, which is what powers realtime. All writes are rejected by
--     RLS and must go through the SECURITY DEFINER functions below.
--   * Secrets (host_token, per-seat claim_token) live in separate tables with
--     NO read policy, so the anon key can never see them. The RPCs validate a
--     caller by matching the token they hold against these tables.
--
-- Run this whole file in the Supabase SQL editor (or via the CLI) once.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists drafts (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  status       text not null default 'lobby'
                 check (status in ('lobby', 'drafting', 'done')),
  settings     jsonb not null default '{}'::jsonb, -- { timerSec, autoOnTimeout }
  current_pick int  not null default 0,            -- next overall pick (0-based)
  deadline     timestamptz,                        -- current pick's clock deadline
  created_at   timestamptz not null default now()
);

create table if not exists seats (
  id         uuid primary key default gen_random_uuid(),
  draft_id   uuid not null references drafts(id) on delete cascade,
  ordinal    int  not null,                        -- draft order (0-based)
  name       text not null,
  claimed    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (draft_id, ordinal)
);

create table if not exists draft_players (
  draft_id     uuid not null references drafts(id) on delete cascade,
  player_id    int  not null,
  position     text not null,                      -- GKP/DEF/MID/FWD
  total_points int  not null default 0,
  price        numeric not null default 0,
  data         jsonb not null,                     -- full Player object for the UI
  primary key (draft_id, player_id)
);

create table if not exists picks (
  id         uuid primary key default gen_random_uuid(),
  draft_id   uuid not null references drafts(id) on delete cascade,
  overall    int  not null,                        -- 0-based overall pick number
  round      int  not null,
  seat_id    uuid not null references seats(id) on delete cascade,
  player_id  int  not null,
  auto       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (draft_id, overall),                      -- one pick per slot (anti-race)
  unique (draft_id, player_id)                     -- a player can't go twice
);

-- Secret tables (never selectable by the anon key) --------------------------
create table if not exists draft_secrets (
  draft_id   uuid primary key references drafts(id) on delete cascade,
  host_token uuid not null default gen_random_uuid()
);

create table if not exists seat_secrets (
  seat_id     uuid primary key references seats(id) on delete cascade,
  claim_token uuid not null default gen_random_uuid()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: public tables readable, writes only via RPC
-- ---------------------------------------------------------------------------
alter table drafts        enable row level security;
alter table seats         enable row level security;
alter table draft_players enable row level security;
alter table picks         enable row level security;
alter table draft_secrets enable row level security;
alter table seat_secrets  enable row level security;

drop policy if exists read_drafts on drafts;
drop policy if exists read_seats on seats;
drop policy if exists read_players on draft_players;
drop policy if exists read_picks on picks;

create policy read_drafts  on drafts        for select using (true);
create policy read_seats   on seats         for select using (true);
create policy read_players on draft_players for select using (true);
create policy read_picks   on picks         for select using (true);
-- draft_secrets / seat_secrets: no policies => anon has no access at all.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function pos_limit(_pos text) returns int
language sql immutable as $$
  select case _pos
    when 'GKP' then 2 when 'DEF' then 5 when 'MID' then 5 when 'FWD' then 3
    else 0 end;
$$;

-- Squad size is 15 (2+5+5+3); kept as a constant helper for total-pick math.
create or replace function squad_size() returns int
language sql immutable as $$ select 15; $$;

-- Which seat is on the clock for a given 0-based overall pick (snake order).
create or replace function seat_on_clock(_draft_id uuid, _overall int) returns uuid
language sql stable as $$
  with s as (select id, ordinal from seats where draft_id = _draft_id),
       n as (select count(*)::int c from s)
  select s.id
  from s cross join n
  where s.ordinal = case
    when (_overall / n.c) % 2 = 0 then _overall % n.c
    else n.c - 1 - (_overall % n.c)
  end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create a draft with an ordered set of seats and a snapshot of the player pool.
create or replace function create_draft(_settings jsonb, _seat_names text[], _players jsonb)
returns table(draft_id uuid, code text, host_token uuid)
language plpgsql security definer set search_path = public as $$
declare
  _draft_id uuid;
  _code text;
  _host uuid;
  i int;
  _seat_id uuid;
begin
  loop
    _code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from drafts where code = _code);
  end loop;

  insert into drafts(code, settings)
  values (_code, coalesce(_settings, '{}'::jsonb))
  returning id into _draft_id;

  insert into draft_secrets(draft_id) values (_draft_id)
  returning host_token into _host;

  for i in 1 .. coalesce(array_length(_seat_names, 1), 0) loop
    insert into seats(draft_id, ordinal, name)
    values (_draft_id, i - 1, _seat_names[i])
    returning id into _seat_id;
    insert into seat_secrets(seat_id) values (_seat_id);
  end loop;

  insert into draft_players(draft_id, player_id, position, total_points, price, data)
  select _draft_id,
         (p->>'id')::int,
         p->>'position',
         coalesce((p->>'totalPoints')::int, 0),
         coalesce((p->>'price')::numeric, 0),
         p
  from jsonb_array_elements(_players) p;

  return query select _draft_id, _code, _host;
end;
$$;

-- Claim a seat; returns the secret claim_token (stored client-side).
create or replace function claim_seat(_code text, _seat_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _draft_id uuid; _tok uuid;
begin
  select id into _draft_id from drafts where code = upper(_code);
  if _draft_id is null then raise exception 'Draft not found'; end if;

  update seats set claimed = true
   where id = _seat_id and draft_id = _draft_id and claimed = false;
  if not found then
    if exists (select 1 from seats where id = _seat_id and draft_id = _draft_id) then
      raise exception 'Seat already claimed';
    else
      raise exception 'Seat not found';
    end if;
  end if;

  select claim_token into _tok from seat_secrets where seat_id = _seat_id;
  return _tok;
end;
$$;

-- Release a seat (so someone else can take it). Requires the claim token.
create or replace function release_seat(_claim_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare _seat_id uuid;
begin
  select seat_id into _seat_id from seat_secrets where claim_token = _claim_token;
  if _seat_id is null then raise exception 'Invalid claim token'; end if;
  update seats set claimed = false where id = _seat_id;
end;
$$;

-- Host starts the draft.
create or replace function start_draft(_host_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare _draft_id uuid; _timer int;
begin
  select draft_id into _draft_id from draft_secrets where host_token = _host_token;
  if _draft_id is null then raise exception 'Invalid host token'; end if;

  select coalesce((settings->>'timerSec')::int, 0) into _timer
    from drafts where id = _draft_id;

  update drafts set
    status = 'drafting',
    current_pick = 0,
    deadline = case when _timer > 0 then now() + make_interval(secs => _timer) else null end
  where id = _draft_id;
end;
$$;

-- Internal: advance the draft clock/status after a pick lands.
create or replace function advance_after_pick(_draft_id uuid)
returns void
language plpgsql set search_path = public as $$
declare _timer int; _n int; _cur int; _total int;
begin
  select coalesce((settings->>'timerSec')::int, 0), current_pick
    into _timer, _cur from drafts where id = _draft_id;
  select count(*) into _n from seats where draft_id = _draft_id;
  _total := _n * squad_size();
  update drafts set
    current_pick = _cur + 1,
    status = case when _cur + 1 >= _total then 'done' else 'drafting' end,
    deadline = case
      when _timer > 0 and _cur + 1 < _total then now() + make_interval(secs => _timer)
      else null end
  where id = _draft_id;
end;
$$;

-- A claimed seat drafts a specific player on their turn.
create or replace function make_pick(_claim_token uuid, _player_id int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _seat_id uuid; _draft_id uuid; _overall int; _n int; _onclock uuid;
  _pos text; _cnt int; _status text;
begin
  select seat_id into _seat_id from seat_secrets where claim_token = _claim_token;
  if _seat_id is null then raise exception 'Invalid claim token'; end if;
  select draft_id into _draft_id from seats where id = _seat_id;

  -- Lock the draft row so concurrent picks serialize.
  select status, current_pick into _status, _overall
    from drafts where id = _draft_id for update;
  if _status <> 'drafting' then raise exception 'Draft is not in progress'; end if;

  _onclock := seat_on_clock(_draft_id, _overall);
  if _onclock is distinct from _seat_id then raise exception 'Not your turn'; end if;

  select position into _pos from draft_players
    where draft_id = _draft_id and player_id = _player_id;
  if _pos is null then raise exception 'Player not in this draft''s pool'; end if;
  if exists (select 1 from picks where draft_id = _draft_id and player_id = _player_id) then
    raise exception 'Player already drafted';
  end if;

  select count(*) into _cnt
    from picks pk
    join draft_players dp on dp.draft_id = pk.draft_id and dp.player_id = pk.player_id
   where pk.draft_id = _draft_id and pk.seat_id = _seat_id and dp.position = _pos;
  if _cnt >= pos_limit(_pos) then raise exception 'Position % is full', _pos; end if;

  select count(*) into _n from seats where draft_id = _draft_id;
  insert into picks(draft_id, overall, round, seat_id, player_id, auto)
  values (_draft_id, _overall, _overall / _n, _seat_id, _player_id, false);

  perform advance_after_pick(_draft_id);
end;
$$;

-- Auto-pick the best available player for the seat on the clock.
-- Allowed when the host forces it, OR when the pick clock has expired (so any
-- connected client can advance a draft whose current picker has gone away).
create or replace function auto_pick(_draft_id uuid, _host_token uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _status text; _overall int; _n int; _deadline timestamptz;
  _onclock uuid; _use_price boolean; _player_id int;
begin
  select status, current_pick, deadline into _status, _overall, _deadline
    from drafts where id = _draft_id for update;
  if _status <> 'drafting' then raise exception 'Draft is not in progress'; end if;

  if _host_token is null
     or not exists (select 1 from draft_secrets
                     where draft_id = _draft_id and host_token = _host_token) then
    if _deadline is null or now() < _deadline then
      raise exception 'Auto-pick not authorized (clock has not expired)';
    end if;
  end if;

  _onclock := seat_on_clock(_draft_id, _overall);
  select not exists (select 1 from draft_players
                      where draft_id = _draft_id and total_points > 0)
    into _use_price;

  select dp.player_id into _player_id
  from draft_players dp
  where dp.draft_id = _draft_id
    and not exists (select 1 from picks p
                     where p.draft_id = _draft_id and p.player_id = dp.player_id)
    and (select count(*)
           from picks pk
           join draft_players d2 on d2.draft_id = pk.draft_id and d2.player_id = pk.player_id
          where pk.draft_id = _draft_id and pk.seat_id = _onclock
            and d2.position = dp.position) < pos_limit(dp.position)
  order by (case when _use_price then dp.price else dp.total_points end) desc, dp.player_id
  limit 1;

  if _player_id is null then raise exception 'No eligible player to auto-pick'; end if;

  select count(*) into _n from seats where draft_id = _draft_id;
  insert into picks(draft_id, overall, round, seat_id, player_id, auto)
  values (_draft_id, _overall, _overall / _n, _onclock, _player_id, true);

  perform advance_after_pick(_draft_id);
end;
$$;

-- Host undoes the last pick.
create or replace function undo_pick(_host_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare _draft_id uuid; _timer int; _last uuid;
begin
  select draft_id into _draft_id from draft_secrets where host_token = _host_token;
  if _draft_id is null then raise exception 'Invalid host token'; end if;

  select id into _last from picks where draft_id = _draft_id order by overall desc limit 1;
  if _last is null then return; end if;
  delete from picks where id = _last;

  select coalesce((settings->>'timerSec')::int, 0) into _timer
    from drafts where id = _draft_id;
  update drafts set
    current_pick = greatest(0, current_pick - 1),
    status = 'drafting',
    deadline = case when _timer > 0 then now() + make_interval(secs => _timer) else null end
  where id = _draft_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: let the anon/authenticated roles call the RPCs.
-- ---------------------------------------------------------------------------
grant execute on function create_draft(jsonb, text[], jsonb) to anon, authenticated;
grant execute on function claim_seat(text, uuid)            to anon, authenticated;
grant execute on function release_seat(uuid)                to anon, authenticated;
grant execute on function start_draft(uuid)                 to anon, authenticated;
grant execute on function make_pick(uuid, int)              to anon, authenticated;
grant execute on function auto_pick(uuid, uuid)             to anon, authenticated;
grant execute on function undo_pick(uuid)                   to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes on the public tables (not the secret ones).
-- REPLICA IDENTITY FULL makes DELETE/UPDATE events include the old row, so
-- clients can filter them by draft_id (e.g. to remove an undone pick).
-- ---------------------------------------------------------------------------
alter table seats replica identity full;
alter table picks replica identity full;

alter publication supabase_realtime add table drafts;
alter publication supabase_realtime add table seats;
alter publication supabase_realtime add table picks;
