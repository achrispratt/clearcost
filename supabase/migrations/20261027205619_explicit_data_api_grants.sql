-- Fresh Supabase projects may disable automatic table exposure. RLS policies
-- alone do not grant Data API access; declare the application's permissions.
-- Existing RLS policies still control which rows each role may access.
grant select on
  public.providers, public.charges, public.payer_rates, public.payers,
  public.medicare_benchmarks, public.episode_definitions, public.episode_components,
  public.provider_cash_ratios, public.code_price_reference
  to anon, authenticated, service_role;

-- Saved searches stay owner-scoped. The application supports create/read/delete.
grant select, insert, delete on public.saved_searches to authenticated;

-- KB and notification capture remain server-only; no public grants or policies.
grant select, insert, update on public.kb_nodes, public.kb_synonyms to service_role;
grant select, insert on public.kb_events to service_role;
grant select on public.kb_path_stats to service_role;
grant select, insert, update on public.waitlist_emails to service_role;
