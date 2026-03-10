-- Migration: Add body_site column to charges table
-- Issue: https://github.com/achrispratt/clearcost/issues/51
--
-- Run each statement SEPARATELY in the Supabase SQL editor.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- ============================================================================
-- Statement 1: Add the column
-- ============================================================================
ALTER TABLE charges ADD COLUMN IF NOT EXISTS body_site text;

-- ============================================================================
-- Statement 2: Partial index (run separately — CONCURRENTLY requires it)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_charges_body_site
  ON charges (body_site) WHERE body_site IS NOT NULL;

-- ============================================================================
-- Statement 3: SQL body-site parser function
-- Mirrors the TypeScript parseBodySite() in lib/cpt/parse-body-site.ts.
-- Uses Postgres \m (start-of-word) and \M (end-of-word) boundaries.
-- ============================================================================
CREATE OR REPLACE FUNCTION parse_body_site(p_description text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Generic exclusions: return null for multi-site descriptions
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mLOW(ER)?\s+EXTREMITY\s+JOINT\M'
      THEN NULL
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mUPPER\s+EXTREMITY\s+JOINT\M'
      THEN NULL
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mANY\s+JOINT\M'
      THEN NULL

    -- Joints (most specific first)
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mKNEE\M'
      THEN 'knee'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mHIP\M'
      THEN 'hip'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mANKLE\M'
      THEN 'ankle'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mSHOULDER\M'
      THEN 'shoulder'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mELBOW\M'
      THEN 'elbow'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mWRIST\M'
      THEN 'wrist'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mHAND\M'
      THEN 'hand'
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mFOOT\M' OR upper(p_description) ~ '\mFEET\M')
      THEN 'foot'

    -- Spine segments
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mCERVICAL\M' OR upper(p_description) ~ '\mC[\s-]?SPINE\M')
      THEN 'cervical_spine'
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mTHORACIC\M' OR upper(p_description) ~ '\mT[\s-]?SPINE\M')
      THEN 'thoracic_spine'
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mLUMBAR\M' OR upper(p_description) ~ '\mL[\s-]?SPINE\M')
      THEN 'lumbar_spine'
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mSACRAL\M' OR upper(p_description) ~ '\mSACRUM\M')
      THEN 'sacral_spine'

    -- Torso/body regions
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mCHEST\M'
      THEN 'chest'
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mABDOMEN\M' OR upper(p_description) ~ '\mABDOMINAL\M')
      THEN 'abdomen'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mPELVI[SC]\M'
      THEN 'pelvis'

    -- Head/neck
    WHEN p_description IS NOT NULL AND (upper(p_description) ~ '\mHEAD\M' OR upper(p_description) ~ '\mBRAIN\M' OR upper(p_description) ~ '\mCRANIAL\M')
      THEN 'head'
    WHEN p_description IS NOT NULL AND upper(p_description) ~ '\mNECK\M'
      THEN 'neck'

    ELSE NULL
  END;
$$;
