-- KB cache tables are server-only. Apply AFTER the service-role KB client
-- (lib/supabase/admin.ts) is deployed, or KB reads/writes degrade to Claude.

-- Accessed only via service role in lib/kb/.
-- Previously "Anyone can insert/update" policies let any holder of the
-- public anon key rewrite cached billing codes (cache poisoning).
drop policy if exists "Anyone can insert kb_nodes" on public.kb_nodes;
drop policy if exists "Anyone can update kb_nodes" on public.kb_nodes;
drop policy if exists "Anyone can view kb_nodes" on public.kb_nodes;
drop policy if exists "Anyone can insert kb_synonyms" on public.kb_synonyms;
drop policy if exists "Anyone can update kb_synonyms" on public.kb_synonyms;
drop policy if exists "Anyone can view kb_synonyms" on public.kb_synonyms;
drop policy if exists "Anyone can insert kb_events" on public.kb_events;
drop policy if exists "Anyone can view kb_events" on public.kb_events;
drop policy if exists "Anyone can view kb_path_stats" on public.kb_path_stats;

revoke all on public.kb_nodes, public.kb_synonyms, public.kb_events, public.kb_path_stats
  from anon, authenticated;
