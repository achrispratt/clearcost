-- KB growth machinery (#125, #126, #127). Built ahead of the traffic it
-- needs: every job below is a cheap no-op until kb_events has data.
--
--   1. Daily roll-up kb_events -> kb_path_stats (previous + current month,
--      idempotent upsert), replacing the monthly job that was only ever
--      documented in a comment (20260316201012_create_kb_tables.sql).
--   2. Daily kb_events TTL that rolls events up before deleting them and
--      only ever deletes whole months that are already final.
--   3. kb_resolution_confidence view + daily auto-flagging of resolution
--      nodes whose bounce rate is high and rising. Flagged nodes are served
--      as KB misses (lib/kb/lookup.ts), so Claude re-answers the path and
--      write-back replaces the node, archiving the old one in kb_node_history.
--   4. 'miss' event type so emerging (uncached) queries can be counted.
--
-- Safe to re-run: every statement is guarded or replaces in place.

-- ============================================================================
-- pg_cron (Supabase installs it in pg_catalog; see supabase.com/docs/guides/cron)
-- ============================================================================
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ============================================================================
-- Schema additions
-- ============================================================================

-- Auto-flagging state. A flagged node is treated as a cache miss until a
-- fresh Claude answer replaces it (kb_replace_flagged_node below).
alter table public.kb_nodes add column if not exists flagged_at timestamptz;
alter table public.kb_nodes add column if not exists flag_reason text;
-- When the current version replaced a flagged one (null = original version).
-- Auto-flagging only looks at stats from months after this, so a replaced
-- node is judged on its own traffic, not its predecessor's.
alter table public.kb_nodes add column if not exists replaced_at timestamptz;

create index if not exists idx_kb_nodes_flagged
  on public.kb_nodes (flagged_at) where flagged_at is not null;

-- Previous versions of replaced nodes, kept for comparison and rollback.
create table if not exists public.kb_node_history (
  id            bigint generated always as identity primary key,
  path_hash     text not null,
  version       integer not null,
  canonical_query text not null,
  answer_path   text[] not null,
  depth         integer not null,
  node_type     text not null,
  payload       jsonb not null,
  source        text not null,
  hit_count     integer not null,
  flagged_at    timestamptz,
  flag_reason   text,
  created_at    timestamptz,             -- when this version was first written
  archived_at   timestamptz not null default now()
);

create index if not exists idx_kb_node_history_path
  on public.kb_node_history (path_hash, version);

alter table public.kb_node_history enable row level security;
revoke all on public.kb_node_history from anon, authenticated;

-- 'miss' = /api/clarify fell through to Claude on the first turn. Logged
-- server-side only (the public /api/kb/events route does not accept it).
-- For 'miss' rows, path_hash holds the query_hash (kb_synonyms key) of the
-- normalized user query, not a node hash.
alter table public.kb_events drop constraint if exists chk_kb_events_event_type;
alter table public.kb_events add constraint chk_kb_events_event_type check (
  event_type in ('walk', 'result_click', 'save', 'bounce', 'skip', 'miss')
);

-- ============================================================================
-- Roll-up: kb_events -> kb_path_stats
-- Counts are DISTINCT SESSIONS per event type (a user clicking five hospitals
-- is one click-through, not five), so rates per walk stay meaningful.
-- Re-running recomputes each month from scratch, so it is idempotent as long
-- as the month's events are complete -- which kb_purge_old_events guarantees
-- by only deleting whole months.
-- ============================================================================
create or replace function public.kb_rollup_path_stats(p_from timestamptz default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from timestamptz := date_trunc(
    'month', coalesce(p_from, now() - interval '1 month')
  );
  affected integer;
begin
  insert into kb_path_stats
    (path_hash, period, walk_count, click_count, save_count, bounce_count, skip_count)
  select
    path_hash,
    date_trunc('month', created_at)::date as period,
    count(distinct session_id) filter (where event_type = 'walk'),
    count(distinct session_id) filter (where event_type = 'result_click'),
    count(distinct session_id) filter (where event_type = 'save'),
    count(distinct session_id) filter (where event_type = 'bounce'),
    count(distinct session_id) filter (where event_type = 'skip')
  from kb_events
  where created_at >= v_from
    and event_type in ('walk', 'result_click', 'save', 'bounce', 'skip')
  group by path_hash, date_trunc('month', created_at)::date
  on conflict (path_hash, period) do update set
    walk_count   = excluded.walk_count,
    click_count  = excluded.click_count,
    save_count   = excluded.save_count,
    bounce_count = excluded.bounce_count,
    skip_count   = excluded.skip_count;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ============================================================================
-- TTL: delete raw events once they are at least 30 days old AND their month
-- is before the previous month (so the daily roll-up has had the whole
-- following month to finalize it). Always cuts on a month boundary, so a
-- month is never left half-deleted, and rolls up everything it is about to
-- delete in the same transaction -- if the roll-up fails, nothing is deleted.
-- Effective retention: 30-62 days.
-- ============================================================================
create or replace function public.kb_purge_old_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz := least(
    date_trunc('month', now() - interval '30 days'),
    date_trunc('month', now()) - interval '1 month'
  );
  v_oldest timestamptz;
  deleted integer;
begin
  select min(created_at) into v_oldest from kb_events where created_at < v_cutoff;
  if v_oldest is null then
    return 0;
  end if;

  perform kb_rollup_path_stats(v_oldest);

  delete from kb_events where created_at < v_cutoff;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- ============================================================================
-- Confidence per resolution node per month (#126 starting formula):
--   confidence = click_rate*0.5 + save_rate*0.3 - bounce_rate*0.4 + ln(walks)*0.1
-- Rates are distinct sessions per walking session, capped at 1: results-page
-- events also arrive for sessions whose resolution came from Claude on the
-- same path (no walk logged), which could otherwise push a rate past 100%.
-- Null when the month has no walks.
-- ============================================================================
create or replace view public.kb_resolution_confidence
with (security_invoker = true) as
select
  s.path_hash,
  s.period,
  n.canonical_query,
  n.answer_path,
  n.version,
  n.flagged_at,
  s.walk_count,
  s.click_count,
  s.save_count,
  s.bounce_count,
  s.skip_count,
  r.click_rate,
  r.save_rate,
  r.bounce_rate,
  case when s.walk_count > 0 then
    round(
      r.click_rate * 0.5 + r.save_rate * 0.3 - r.bounce_rate * 0.4
        + ln(s.walk_count::numeric) * 0.1,
      4
    )
  end as confidence
from public.kb_path_stats s
join public.kb_nodes n on n.path_hash = s.path_hash and n.node_type = 'resolution'
cross join lateral (
  select
    case when s.walk_count > 0
      then round(least(1, s.click_count::numeric / s.walk_count), 4) end as click_rate,
    case when s.walk_count > 0
      then round(least(1, s.save_count::numeric / s.walk_count), 4) end as save_rate,
    case when s.walk_count > 0
      then round(least(1, s.bounce_count::numeric / s.walk_count), 4) end as bounce_rate
) r;

revoke all on public.kb_resolution_confidence from anon, authenticated;
grant select on public.kb_resolution_confidence to service_role;

-- ============================================================================
-- Auto-flag (#126): a resolution node is flagged when
--   walk_count >= p_min_walks in the current month
--   AND bounce_rate > p_bounce_threshold in the current month
--   AND bounce_rate rose month over month p_rising_months times in a row
--       (default 2: two months ago < last month < this month)
-- Only months after the node's last replacement count. Already-flagged nodes
-- are skipped. Returns the number of nodes flagged.
-- ============================================================================
create or replace function public.kb_flag_resolution_nodes(
  p_min_walks integer default 50,
  p_bounce_threshold numeric default 0.25,
  p_rising_months integer default 2
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current date := date_trunc('month', now())::date;
  v_window_start date := (date_trunc('month', now())
    - make_interval(months => p_rising_months))::date;
  flagged integer;
begin
  with monthly as (
    select c.path_hash, c.period, c.walk_count, c.bounce_rate
    from kb_resolution_confidence c
    join kb_nodes n on n.path_hash = c.path_hash
    where n.flagged_at is null
      and c.period between v_window_start and v_current
      and (n.replaced_at is null
           or c.period > date_trunc('month', n.replaced_at)::date)
  ),
  seq as (
    select path_hash, period, walk_count, bounce_rate,
      lag(bounce_rate) over (partition by path_hash order by period) as prev_rate
    from monthly
  ),
  candidates as (
    select
      path_hash,
      max(bounce_rate) filter (where period = v_current) as current_rate,
      max(walk_count) filter (where period = v_current) as current_walks
    from seq
    group by path_hash
    having count(*) = p_rising_months + 1
      and count(*) filter (
        where prev_rate is not null and bounce_rate > prev_rate
      ) = p_rising_months
      and bool_or(
        period = v_current
        and walk_count >= p_min_walks
        and bounce_rate > p_bounce_threshold
      )
  )
  update kb_nodes n
  set flagged_at = now(),
      flag_reason = format(
        'auto: bounce rate %s%% on %s walks this month, rising %s months in a row',
        round(c.current_rate * 100, 1), c.current_walks, p_rising_months
      )
  from candidates c
  where n.path_hash = c.path_hash
    and n.flagged_at is null;

  get diagnostics flagged = row_count;
  return flagged;
end;
$$;

-- ============================================================================
-- Replace a flagged node with a fresh answer (called by lib/kb/write-back.ts
-- after the first-write-wins upsert). Archives the old version into
-- kb_node_history and bumps version. No-op (returns false) if the node is
-- missing or not flagged, so ordinary write-backs can never overwrite a node.
-- ============================================================================
create or replace function public.kb_replace_flagged_node(
  p_path_hash text,
  p_canonical_query text,
  p_answer_path text[],
  p_depth integer,
  p_node_type text,
  p_payload jsonb,
  p_source text default 'claude'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_node kb_nodes%rowtype;
begin
  select * into old_node
  from kb_nodes
  where path_hash = p_path_hash and flagged_at is not null
  for update;

  if not found then
    return false;
  end if;

  insert into kb_node_history (
    path_hash, version, canonical_query, answer_path, depth, node_type,
    payload, source, hit_count, flagged_at, flag_reason, created_at
  ) values (
    old_node.path_hash, old_node.version, old_node.canonical_query,
    old_node.answer_path, old_node.depth, old_node.node_type,
    old_node.payload, old_node.source, old_node.hit_count,
    old_node.flagged_at, old_node.flag_reason,
    coalesce(old_node.replaced_at, old_node.created_at)
  );

  update kb_nodes set
    canonical_query = p_canonical_query,
    answer_path     = p_answer_path,
    depth           = p_depth,
    node_type       = p_node_type,
    payload         = p_payload,
    source          = p_source,
    version         = old_node.version + 1,
    hit_count       = 0,
    flagged_at      = null,
    flag_reason     = null,
    replaced_at     = now(),
    updated_at      = now()
  where path_hash = p_path_hash;

  return true;
end;
$$;

-- Owned by postgres; callable only by the service role (and cron as postgres).
alter function public.kb_rollup_path_stats(timestamptz) owner to postgres;
alter function public.kb_purge_old_events() owner to postgres;
alter function public.kb_flag_resolution_nodes(integer, numeric, integer) owner to postgres;
alter function public.kb_replace_flagged_node(text, text, text[], integer, text, jsonb, text)
  owner to postgres;

revoke execute on function public.kb_rollup_path_stats(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.kb_purge_old_events()
  from public, anon, authenticated;
revoke execute on function public.kb_flag_resolution_nodes(integer, numeric, integer)
  from public, anon, authenticated;
revoke execute on function public.kb_replace_flagged_node(text, text, text[], integer, text, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.kb_rollup_path_stats(timestamptz) to service_role;
grant execute on function public.kb_purge_old_events() to service_role;
grant execute on function public.kb_flag_resolution_nodes(integer, numeric, integer) to service_role;
grant execute on function public.kb_replace_flagged_node(text, text, text[], integer, text, jsonb, text)
  to service_role;

-- ============================================================================
-- Schedules (UTC). cron.schedule upserts by job name, so re-running this
-- migration updates the jobs in place. Order matters: roll up, then flag,
-- then purge (which rolls up again before deleting anything).
-- The monthly roll-up from the original KB migration may have been scheduled
-- by hand; it counted raw events rather than sessions, so remove it.
-- ============================================================================
select cron.unschedule(jobid)
from cron.job
where jobname = 'kb-stats-rollup-monthly';

select cron.schedule(
  'kb-path-stats-rollup-daily',
  '0 3 * * *',
  $$select public.kb_rollup_path_stats()$$
);

select cron.schedule(
  'kb-flag-resolution-nodes-daily',
  '15 3 * * *',
  $$select public.kb_flag_resolution_nodes()$$
);

select cron.schedule(
  'kb-events-ttl-daily',
  '30 3 * * *',
  $$select public.kb_purge_old_events()$$
);
