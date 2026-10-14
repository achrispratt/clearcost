-- Security hardening: least-privilege for the anon/authenticated API roles.
-- Context: PR #156. KB lockdown lives in 20261013182034_kb_server_only.sql.

-- 1. Public reference data is read-only through the API. RLS already blocks
--    writes (no write policies); revoking the grants is defense in depth.
revoke insert, update, delete, truncate, references, trigger
  on public.providers, public.charges, public.payer_rates, public.payers,
     public.medicare_benchmarks, public.episode_definitions, public.episode_components
  from anon, authenticated;

-- 2. saved_searches: anon never needs it; authenticated keeps CRUD under RLS.
revoke all on public.saved_searches from anon;
revoke truncate, references, trigger on public.saved_searches from authenticated;

-- 3. SECURITY DEFINER audit RPCs run as owner (bypass RLS) and were callable
--    by anyone via /rest/v1/rpc/*. Only scripts/db-audit.ts (service role) uses them.
revoke execute on function public.audit_code_coverage(text[]) from public, anon, authenticated;
revoke execute on function public.audit_duplicate_charges(uuid[]) from public, anon, authenticated;
revoke execute on function public.audit_estimated_count(text) from public, anon, authenticated;
revoke execute on function public.audit_orphan_charges() from public, anon, authenticated;
revoke execute on function public.audit_provider_charge_counts() from public, anon, authenticated;
revoke execute on function public.audit_zero_price_by_state() from public, anon, authenticated;
grant execute on function public.audit_code_coverage(text[]) to service_role;
grant execute on function public.audit_duplicate_charges(uuid[]) to service_role;
grant execute on function public.audit_estimated_count(text) to service_role;
grant execute on function public.audit_orphan_charges() to service_role;
grant execute on function public.audit_provider_charge_counts() to service_role;
grant execute on function public.audit_zero_price_by_state() to service_role;

-- 4. Pin search_path on every app function (lint 0011). "extensions" is
--    included so PostGIS resolves whether it lives in public or extensions.
alter function public.audit_code_coverage(text[]) set search_path = public, extensions;
alter function public.audit_duplicate_charges(uuid[]) set search_path = public, extensions;
alter function public.audit_estimated_count(text) set search_path = public, extensions;
alter function public.audit_orphan_charges() set search_path = public, extensions;
alter function public.audit_provider_charge_counts() set search_path = public, extensions;
alter function public.audit_zero_price_by_state() set search_path = public, extensions;
alter function public.parse_body_site(text) set search_path = public, extensions;
alter function public.parse_laterality(text, text) set search_path = public, extensions;
alter function public.lookup_episode_component_charges(text, uuid[], double precision)
  set search_path = public, extensions;
alter function public.search_charges_by_description(text, double precision, double precision, double precision, integer, integer)
  set search_path = public, extensions;
alter function public.search_charges_nearby(text, text[], double precision, double precision, double precision, integer, integer, text, text)
  set search_path = public, extensions;
