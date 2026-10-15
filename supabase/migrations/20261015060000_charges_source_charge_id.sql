-- Row-level lineage for imported charges (#59): Trilliant Oria's
-- standard_charges.charge_id, so lib/data/import-trilliant.ts can upsert on it
-- instead of blind INSERTs, and future imports can diff by source row.
--
-- Existing rows stay NULL until the next re-import from the local Oria data.
--
-- Cost on ~8M rows: adding a nullable column with no default is a catalog-only
-- change (instant). The partial unique index still scans the whole table once,
-- but indexes no rows (all NULL today), so it builds in seconds to a few
-- minutes. Plain CREATE INDEX (not CONCURRENTLY, which cannot run inside a
-- migration transaction) blocks writes to charges while it builds; charges is
-- only written by the import script, so that is acceptable. The timeout is
-- raised for this transaction only in case the role default is short.
set local statement_timeout = '30min';

alter table public.charges add column if not exists source_charge_id bigint;

create unique index if not exists idx_charges_source_charge_id
  on public.charges (source_charge_id)
  where source_charge_id is not null;
