-- Semantic KB matching (#164): embeddings of depth-0 canonical queries, so a
-- new phrasing of a known query is matched in Postgres instead of pasting every
-- canonical into the Claude prompt. Server-only, like the other KB tables.
-- Vectors come from the `embed` Edge Function (gte-small, 384 dims).

create extension if not exists vector with schema extensions;

create table if not exists public.kb_canonical_embeddings (
  canonical_query text primary key,
  embedding       extensions.vector(384) not null,
  model           text not null,
  created_at      timestamptz default now()
);

create index if not exists idx_kb_canonical_embeddings_hnsw
  on public.kb_canonical_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.kb_canonical_embeddings enable row level security;
revoke all on public.kb_canonical_embeddings from anon, authenticated;

-- Nearest canonical with cosine similarity >= match_threshold.
create or replace function public.match_canonical(
  query_embedding extensions.vector(384),
  match_threshold double precision,
  match_count     integer default 1
)
returns table (canonical_query text, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select e.canonical_query,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.kb_canonical_embeddings e
  where 1 - (e.embedding <=> query_embedding) >= match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_canonical(extensions.vector, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.match_canonical(extensions.vector, double precision, integer)
  to service_role;
