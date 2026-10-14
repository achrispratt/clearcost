-- Restored from supabase_migrations.schema_migrations: this ran on production
-- but its file was never committed.

-- Episode definitions (Turquoise Health Standard Service Packages)
create table if not exists episode_definitions (
  id uuid primary key default gen_random_uuid(),
  ssp_code text unique not null,
  principal_code text not null,
  principal_code_type text not null default 'cpt',
  label text not null,
  category text,
  source text default 'turquoise_ssp',
  source_claim_count integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_episode_defs_principal on episode_definitions (principal_code);

alter table episode_definitions enable row level security;
create policy "Anyone can view episode definitions"
  on episode_definitions for select using (true);

-- Episode components
create table if not exists episode_components (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episode_definitions(id) on delete cascade,
  code text not null,
  code_type text not null,
  tier text not null,
  billing_class text,
  association float not null,
  charge_weight float,
  total_count integer,
  resolved_from text[],
  constraint uq_episode_component unique (episode_id, code)
);

create index if not exists idx_episode_components_episode on episode_components (episode_id);
create index if not exists idx_episode_components_code on episode_components (code);

alter table episode_components enable row level security;
create policy "Anyone can view episode components"
  on episode_components for select using (true);

-- Batch RPC: lookup episode component charges
create or replace function lookup_episode_component_charges(
  p_principal_code text,
  p_provider_ids uuid[],
  p_min_association float default 0.4
)
returns table (
  provider_id uuid,
  component_code text,
  component_code_type text,
  component_tier text,
  component_association float,
  cash_price numeric,
  gross_charge numeric,
  avg_negotiated_rate numeric,
  min_price numeric,
  max_price numeric
)
language sql
stable
as $$
  with episode as (
    select id from episode_definitions
    where principal_code = p_principal_code
    limit 1
  ),
  components as (
    select ec.code, ec.code_type, ec.tier, ec.association
    from episode_components ec
    join episode e on e.id = ec.episode_id
    where ec.association >= p_min_association
      and ec.code_type in ('cpt', 'hcpcs')
  )
  select
    c.provider_id,
    comp.code as component_code,
    comp.code_type as component_code_type,
    comp.tier as component_tier,
    comp.association as component_association,
    c.cash_price,
    c.gross_charge,
    c.avg_negotiated_rate,
    c.min_price,
    c.max_price
  from components comp
  join charges c on (
    (comp.code_type = 'cpt' and (c.cpt = comp.code or c.hcpcs = comp.code))
    or (comp.code_type = 'hcpcs' and c.hcpcs = comp.code)
  )
  where c.provider_id = any(p_provider_ids);
$$;
