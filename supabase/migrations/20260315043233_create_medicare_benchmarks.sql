-- Restored from supabase_migrations.schema_migrations: this ran on production
-- but its file was never committed.

create table if not exists medicare_benchmarks (
  code              text primary key,
  description       text,
  facility_rate     numeric(10, 2),
  non_facility_rate numeric(10, 2),
  conversion_factor numeric(8, 4),
  pfs_year          smallint not null,
  status_code       text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_medicare_benchmarks_code
  on medicare_benchmarks (code);

alter table medicare_benchmarks enable row level security;
create policy "Anyone can view medicare benchmarks"
  on medicare_benchmarks for select using (true);
