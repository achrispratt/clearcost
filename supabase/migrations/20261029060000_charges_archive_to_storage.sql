-- Rows a crawler load replaces (charges_archive) only matter for undoing a
-- load, but they take database disk: 571 MB after Texas, against an 8 GB
-- plan that auto-grows (billed) at 90%. Supabase Pro includes 100 GB of
-- Storage, so the archive moves there: scripts/archive-to-storage.ts writes
-- one gzipped NDJSON file per hospital to the private `charges-archive`
-- bucket, and the nightly purge below then empties the table of every
-- hospital whose file is newer than its last archived row.
--
-- To undo a load after a purge: `scripts/archive-to-storage.ts --restore
-- <provider_id>` puts the hospital's rows back in charges_archive, then
-- `select restore_mrf_load('<provider_id>')` as before.

insert into storage.buckets (id, name, public)
values ('charges-archive', 'charges-archive', false)
on conflict (id) do nothing;

-- Per hospital: archived rows and the newest archive time, for the export.
-- Reads only charges_archive.
create or replace function public.charges_archive_providers()
returns table (provider_id uuid, rows bigint, last_archived timestamptz)
language sql
stable
set search_path = public
as $$
  select provider_id, count(*), max(archived_at)
  from charges_archive
  group by provider_id
  order by provider_id
$$;

-- Empties the archive of hospitals whose Storage file was written after their
-- last archived row. Truncates (returning the disk at once) when every
-- hospital is covered; otherwise deletes the covered hospitals' rows, and the
-- freed space is reused by later archiving.
create or replace function public.purge_exported_archive()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  total integer;
  covered integer;
  removed bigint := 0;
begin
  drop table if exists archive_export_state;
  create temp table archive_export_state on commit drop as
  select a.provider_id, a.last_archived, o.updated_at as exported_at
  from charges_archive_providers() a
  left join storage.objects o
    on o.bucket_id = 'charges-archive'
    and o.name = a.provider_id::text || '.ndjson.gz';

  select count(*), count(*) filter (where exported_at >= last_archived)
  into total, covered
  from archive_export_state;

  if total = 0 then
    return jsonb_build_object('providers', 0, 'covered', 0, 'removed', 0);
  end if;

  if covered = total then
    lock table charges_archive in access exclusive mode;
    -- Nothing may have been archived between the check and the lock.
    if exists (
      select 1 from charges_archive a
      join archive_export_state s using (provider_id)
      where a.archived_at > s.exported_at
    ) or exists (
      select 1 from charges_archive a
      where not exists (
        select 1 from archive_export_state s where s.provider_id = a.provider_id
      )
    ) then
      raise exception 'charges_archive changed during purge; rerun the export';
    end if;
    select count(*) into removed from charges_archive;
    truncate charges_archive;
  elsif covered > 0 then
    delete from charges_archive a
    using archive_export_state s
    where a.provider_id = s.provider_id
      and s.exported_at >= s.last_archived
      and a.archived_at <= s.exported_at;
    get diagnostics removed = row_count;
  end if;

  return jsonb_build_object(
    'providers', total, 'covered', covered, 'removed', coalesce(removed, 0)
  );
end;
$$;

revoke execute on function public.charges_archive_providers() from public, anon, authenticated;
grant execute on function public.charges_archive_providers() to service_role;
revoke execute on function public.purge_exported_archive() from public, anon, authenticated;
grant execute on function public.purge_exported_archive() to service_role;

-- restore_mrf_load() with no archived rows would delete a hospital's crawled
-- rows and put nothing back. Refuse when the rows are in Storage instead.
create or replace function public.restore_mrf_load(p_provider_id uuid)
returns jsonb
language plpgsql
set search_path = public
set statement_timeout = '55s'
as $$
declare
  removed integer;
  restored integer;
begin
  if not exists (
    select 1 from charges_archive where provider_id = p_provider_id
  ) and exists (
    select 1 from storage.objects
    where bucket_id = 'charges-archive'
      and name = p_provider_id::text || '.ndjson.gz'
  ) then
    raise exception
      'archived rows for % are in Storage; run scripts/archive-to-storage.ts --restore % first',
      p_provider_id, p_provider_id;
  end if;

  delete from charges
  where provider_id = p_provider_id and source = 'cms_mrf';
  get diagnostics removed = row_count;

  with back as (
    delete from charges_archive a
    where a.provider_id = p_provider_id
    returning a.*
  )
  insert into charges (
    id, provider_id, description, setting, billing_class, cpt, hcpcs, ms_drg,
    revenue_code, ndc, icd, modifiers, laterality, body_site, gross_charge,
    cash_price, min_price, max_price, avg_negotiated_rate,
    min_negotiated_rate, max_negotiated_rate, payer_count, source,
    imported_at, source_charge_id, last_updated, created_at
  )
  select
    id, provider_id, description, setting, billing_class, cpt, hcpcs, ms_drg,
    revenue_code, ndc, icd, modifiers, laterality, body_site, gross_charge,
    cash_price, min_price, max_price, avg_negotiated_rate,
    min_negotiated_rate, max_negotiated_rate, payer_count, source,
    imported_at, source_charge_id, last_updated, created_at
  from back;
  get diagnostics restored = row_count;

  perform refresh_provider_cash_ratios(array[p_provider_id]);

  return jsonb_build_object('removed', removed, 'restored', restored);
end;
$$;

-- After the 04:00-04:45 jobs. Cheap: reads charges_archive, never charges.
select cron.schedule(
  'purge-exported-archive-daily',
  '15 5 * * *',
  $$set statement_timeout = '10min'; select public.purge_exported_archive()$$
);
