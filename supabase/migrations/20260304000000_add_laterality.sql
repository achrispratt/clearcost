-- Laterality column, index and parser (issue #48). This was run by hand in the
-- SQL editor (first draft in scripts/migration-laterality.sql) before it was
-- tracked, and it is marked applied. The parser matches production's live
-- definition. The index is built without CONCURRENTLY so it can run inside a
-- migration transaction.
-- The search RPCs gained a laterality column and parameter at the same time: the
-- old versions are dropped here, and 20260304221836_rollback_dedup_rpc.sql creates
-- the laterality versions.

ALTER TABLE charges ADD COLUMN IF NOT EXISTS laterality text;

CREATE INDEX IF NOT EXISTS idx_charges_laterality
  ON charges (laterality) WHERE laterality IS NOT NULL;

-- Mirrors the TypeScript parseLaterality() in lib/cpt/parse-laterality.ts.
-- Uses Postgres \m (start-of-word) and \M (end-of-word) boundaries.
CREATE OR REPLACE FUNCTION parse_laterality(p_description text, p_modifiers text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
declare
  v_desc text;
  v_mods text;
begin
  v_mods := upper(p_modifiers);
  v_desc := upper(p_description);

  if v_mods is not null then
    if v_mods ~ '\m50\M' then return 'bilateral'; end if;
    if v_mods ~ '\mLT\M' then return 'left'; end if;
    if v_mods ~ '\mRT\M' then return 'right'; end if;
  end if;

  if v_desc is not null then
    if v_desc ~ '\mLT\M' then return 'left'; end if;
    if v_desc ~ '\mRT\M' then return 'right'; end if;
    if v_desc ~ '\mBILATERAL\M' or v_desc ~ '\mBILAT\M' then return 'bilateral'; end if;
    if v_desc ~ '\mLEFT\M' then return 'left'; end if;
    if v_desc ~ '\mRIGHT\M' then return 'right'; end if;
  end if;

  return null;
end;
$function$;

drop function if exists search_charges_nearby(text, text[], double precision, double precision, double precision, integer, integer);
drop function if exists search_charges_by_description(text, double precision, double precision, double precision, integer, integer);
