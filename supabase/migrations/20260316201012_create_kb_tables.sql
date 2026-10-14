-- ============================================================================
-- KB: SYNONYMS (query normalization — many surface forms → one canonical query)
-- ============================================================================
create table if not exists kb_synonyms (
  query_hash     text primary key,          -- sha256 of normalized_query
  normalized_query text not null,           -- lowercased, whitespace-collapsed input
  canonical_query  text not null,           -- authoritative query string for this concept
  created_at     timestamptz default now()
);

create index if not exists idx_kb_synonyms_canonical on kb_synonyms (canonical_query);

-- ============================================================================
-- KB: NODES (one node per canonical_query + answer_path combination)
-- node_type='question'   → AI responded with a clarifying question
-- node_type='resolution' → AI resolved to billing codes (terminal node)
-- ============================================================================
create table if not exists kb_nodes (
  path_hash      text primary key,          -- sha256(canonical_query|seg1|seg2|...)
  canonical_query text not null,            -- matches kb_synonyms.canonical_query
  answer_path    text[] not null default '{}', -- ordered answer segments leading to this node
  depth          integer not null default 0,-- length of answer_path
  node_type      text not null,             -- 'question' | 'resolution'
  payload        jsonb not null,            -- KBQuestionPayload or KBResolutionPayload
  hit_count      integer not null default 0,
  version        integer not null default 1,
  source         text not null default 'claude', -- 'claude' | 'admin' | 'migrated'
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  constraint chk_kb_nodes_node_type check (node_type in ('question', 'resolution')),
  constraint chk_kb_nodes_source     check (source    in ('claude', 'admin', 'migrated'))
);

create index if not exists idx_kb_nodes_canonical on kb_nodes (canonical_query);

-- ============================================================================
-- KB: EVENTS (interaction telemetry per session × path)
-- ============================================================================
create table if not exists kb_events (
  id          uuid primary key default gen_random_uuid(),
  path_hash   text not null,               -- references kb_nodes.path_hash (soft FK)
  event_type  text not null,               -- 'walk' | 'result_click' | 'save' | 'bounce' | 'skip'
  session_id  text not null,
  created_at  timestamptz default now(),
  constraint chk_kb_events_event_type check (
    event_type in ('walk', 'result_click', 'save', 'bounce', 'skip')
  )
);

create index if not exists idx_kb_events_created_at on kb_events (created_at desc);
create index if not exists idx_kb_events_path_hash  on kb_events (path_hash);

-- ============================================================================
-- KB: PATH STATS (materialized aggregates per path × calendar period)
-- Populated by pg_cron rollup job (see NOTE below).
-- NOTE: To enable the rollup job, run the following in the Supabase SQL Editor
-- after enabling the pg_cron extension:
--
--   select cron.schedule(
--     'kb-stats-rollup-monthly',
--     '0 4 1 * *',
--     $$
--       insert into kb_path_stats (path_hash, period, walk_count, click_count, save_count, bounce_count, skip_count)
--       select
--         path_hash,
--         date_trunc('month', created_at)::date as period,
--         count(*) filter (where event_type = 'walk')         as walk_count,
--         count(*) filter (where event_type = 'result_click') as click_count,
--         count(*) filter (where event_type = 'save')         as save_count,
--         count(*) filter (where event_type = 'bounce')       as bounce_count,
--         count(*) filter (where event_type = 'skip')         as skip_count
--       from kb_events
--       where created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
--         and created_at < date_trunc('month', NOW())
--       group by path_hash, date_trunc('month', created_at)::date
--       on conflict (path_hash, period) do update set
--         walk_count   = excluded.walk_count,
--         click_count  = excluded.click_count,
--         save_count   = excluded.save_count,
--         bounce_count = excluded.bounce_count,
--         skip_count   = excluded.skip_count;
--     $$
--   );
--
-- Daily: delete kb_events older than 30 days
-- select cron.schedule('kb-events-ttl-daily', '0 3 * * *', $$DELETE FROM kb_events WHERE created_at < NOW() - INTERVAL '30 days';$$);
--
-- ============================================================================
create table if not exists kb_path_stats (
  path_hash    text not null,
  period       date not null,               -- truncated to month by rollup job
  walk_count   integer not null default 0,
  click_count  integer not null default 0,
  save_count   integer not null default 0,
  bounce_count integer not null default 0,
  skip_count   integer not null default 0,
  constraint pk_kb_path_stats primary key (path_hash, period)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table kb_synonyms   enable row level security;
alter table kb_nodes      enable row level security;
alter table kb_events     enable row level security;
alter table kb_path_stats enable row level security;

-- kb_synonyms: public read + write (server writes new synonym mappings)
create policy "Anyone can view kb_synonyms"
  on kb_synonyms for select using (true);
create policy "Anyone can insert kb_synonyms"
  on kb_synonyms for insert with check (true);
create policy "Anyone can update kb_synonyms"
  on kb_synonyms for update using (true) with check (true);

-- kb_nodes: public read + write (server writes new nodes on cache miss)
create policy "Anyone can view kb_nodes"
  on kb_nodes for select using (true);
create policy "Anyone can insert kb_nodes"
  on kb_nodes for insert with check (true);
create policy "Anyone can update kb_nodes"
  on kb_nodes for update using (true) with check (true);

-- kb_events: public read + insert (clients log events; no update/delete)
create policy "Anyone can view kb_events"
  on kb_events for select using (true);
create policy "Anyone can insert kb_events"
  on kb_events for insert with check (true);

-- kb_path_stats: public read only (written by pg_cron rollup, not clients)
create policy "Anyone can view kb_path_stats"
  on kb_path_stats for select using (true);
