-- Key Oria row lineage per hospital, not globally.
--
-- 20261015060000_charges_source_charge_id.sql made source_charge_id (Oria
-- standard_charges.charge_id) unique across all of charges. Oria's charge_id
-- is only a row number inside one hospital's file: over the 59 stay DRGs,
-- 2,386,357 charge_ids are 312,307 distinct values, every repeat spans several
-- hospitals, and (hospital_id, charge_id) is fully unique. So the import's
-- guard (lib/data/charge-id-guard.ts) stopped every multi-hospital import.
--
-- Each Oria hospital_id maps to one provider (providers.trilliant_hospital_id
-- is unique), so (provider_id, source_charge_id) is the source row's key.
-- lib/data/import-trilliant.ts and lib/data/backfill-inpatient.ts upsert with
-- ON CONFLICT (provider_id, source_charge_id) WHERE source_charge_id IS NOT NULL.
--
-- No row has source_charge_id set yet (checked 2026-10-22), so no data moves.
-- Dropping the old index is instant. Building the new partial index reads all
-- of charges once but indexes no rows; plain CREATE INDEX (not CONCURRENTLY,
-- which cannot run inside a migration transaction) blocks writes to charges
-- while it builds, and charges is only written by the import and crawler
-- loads. Run it when no load is going.
set local statement_timeout = '30min';

drop index if exists public.idx_charges_source_charge_id;

create unique index if not exists idx_charges_provider_source_charge_id
  on public.charges (provider_id, source_charge_id)
  where source_charge_id is not null;
