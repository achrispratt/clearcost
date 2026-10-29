-- Preserve resolved code types, pricing plan and laterality when a search is saved.
-- Additive and nullable: existing saves and old clients continue to work.
-- Existing owner-scoped saved_searches RLS policies also cover this column.
alter table public.saved_searches
  add column if not exists search_context jsonb;

comment on column public.saved_searches.search_context is
  'Versioned resolved search context (v1), validated by /api/saved; no price snapshot.';
