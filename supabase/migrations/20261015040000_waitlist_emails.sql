-- "Notify me" sign-ups when ClearCost can't price a search yet (#149).
-- Written only by /api/waitlist with the service role; RLS with no policies
-- means the anon and authenticated roles can neither read nor write it.
create table if not exists public.waitlist_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254),
  procedure_code text not null default '',
  procedure_name text not null check (char_length(procedure_name) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, procedure_code)
);

alter table public.waitlist_emails enable row level security;
