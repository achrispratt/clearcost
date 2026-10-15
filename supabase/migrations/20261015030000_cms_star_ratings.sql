-- CMS Overall Hospital Quality Star Ratings on providers (#141).
-- Filled by scripts/import-cms-star-ratings.ts; re-run when CMS refreshes.
alter table public.providers
  add column if not exists cms_ccn text,
  add column if not exists cms_star_rating smallint
    check (cms_star_rating between 1 and 5),
  add column if not exists cms_rating_as_of date;

comment on column public.providers.cms_ccn is
  'CMS Certification Number, set only when the provider matched a CMS hospital with confidence';
comment on column public.providers.cms_star_rating is
  'CMS Overall Hospital Quality Star Rating (1-5); null when CMS does not rate it or no confident match';

-- Replace all ratings in one call: providers in p_rows get their CCN and
-- rating, every other provider is cleared, so a re-run drops stale matches.
create or replace function public.apply_cms_star_ratings(
  p_rows jsonb,
  p_as_of date
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  update providers p
  set cms_ccn = null, cms_star_rating = null, cms_rating_as_of = null
  where p.cms_ccn is not null
    and not exists (
      select 1 from jsonb_array_elements(p_rows) r
      where (r->>'provider_id')::uuid = p.id
    );

  update providers p
  set cms_ccn = r.ccn,
      cms_star_rating = r.stars,
      cms_rating_as_of = p_as_of
  from jsonb_to_recordset(p_rows) as r(provider_id uuid, ccn text, stars smallint)
  where p.id = r.provider_id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.apply_cms_star_ratings(jsonb, date)
  from public, anon, authenticated;
grant execute on function public.apply_cms_star_ratings(jsonb, date) to service_role;
