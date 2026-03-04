-- Migration: Add laterality column to charges table
-- Issue: https://github.com/achrispratt/clearcost/issues/48
--
-- Run each statement SEPARATELY in the Supabase SQL editor.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- ============================================================================
-- Statement 1: Add the column
-- ============================================================================
ALTER TABLE charges ADD COLUMN IF NOT EXISTS laterality text;

-- ============================================================================
-- Statement 2: Partial index (run separately — CONCURRENTLY requires it)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_charges_laterality
  ON charges (laterality) WHERE laterality IS NOT NULL;

-- ============================================================================
-- Statement 3: SQL laterality parser function
-- Mirrors the TypeScript parseLaterality() in lib/cpt/parse-laterality.ts.
-- Uses Postgres \m (start-of-word) and \M (end-of-word) boundaries.
-- ============================================================================
CREATE OR REPLACE FUNCTION parse_laterality(
  p_description text,
  p_modifiers text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Priority 1: Modifiers field (CMS standard codes)
    WHEN p_modifiers IS NOT NULL AND upper(p_modifiers) ~ '\m50\M'
      THEN 'bilateral'
    WHEN p_modifiers IS NOT NULL AND upper(p_modifiers) ~ '\mLT\M'
      THEN 'left'
    WHEN p_modifiers IS NOT NULL AND upper(p_modifiers) ~ '\mRT\M'
      THEN 'right'

    -- Priority 2: Suffix abbreviations in description
    -- Note: no \mBI\M here — too many false positives (BI-RADS, BI-V, etc.)
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mLT\M'
      THEN 'left'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mRT\M'
      THEN 'right'

    -- Priority 3: Full words in description
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mBILATERAL\M' OR upper(p_description) ~ '\mBILAT\M')
      THEN 'bilateral'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mLEFT\M'
      THEN 'left'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mRIGHT\M'
      THEN 'right'

    ELSE NULL
  END;
$$;
