-- Move PostGIS out of the API-exposed public schema (lints 0013, 0014, 0028).
-- public.spatial_ref_sys is owned by supabase_admin, so RLS can't be enabled
-- and anon's write grants can't be revoked from the postgres role. PostGIS 3.x
-- is not relocatable, so it is dropped and recreated in "extensions".
--
-- No data loss: providers.location is a GENERATED column derived from lat/lng.
-- The RPCs reference PostGIS in string bodies and resolve it through the
-- search_path pinned in 20261013_security_hardening.sql (apply that first).

drop extension postgis cascade;  -- drops providers.location + idx_providers_location
create extension postgis with schema extensions;

alter table public.providers add column location extensions.geography(Point, 4326)
  generated always as (
    case when lat is not null and lng is not null
         then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
         else null end
  ) stored;

create index idx_providers_location on public.providers using gist (location);
