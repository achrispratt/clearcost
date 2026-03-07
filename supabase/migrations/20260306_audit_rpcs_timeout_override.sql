-- Update audit RPCs with statement_timeout override to avoid 8s Supabase timeout
-- on large table scans (charges has 8.3M+ rows).
-- SECURITY DEFINER + SET statement_timeout lets these run up to 120s.

-- Helper: estimated row count from pg_class (instant, no scan)
CREATE OR REPLACE FUNCTION audit_estimated_count(p_table text)
RETURNS bigint
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT reltuples::bigint FROM pg_class WHERE relname = p_table),
    0
  );
$$;

-- RPC 1: Per-provider charge counts
CREATE OR REPLACE FUNCTION audit_provider_charge_counts()
RETURNS TABLE (provider_id uuid, charge_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  RETURN QUERY
    SELECT c.provider_id, COUNT(*) AS charge_count
    FROM charges c
    GROUP BY c.provider_id;
END;
$$;

-- RPC 2: Zero-price charges grouped by provider state
CREATE OR REPLACE FUNCTION audit_zero_price_by_state()
RETURNS TABLE (state text, zero_price_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  RETURN QUERY
    SELECT
      COALESCE(UPPER(TRIM(p.state)), 'UNKNOWN') AS state,
      COUNT(*) AS zero_price_count
    FROM charges c
    JOIN providers p ON p.id = c.provider_id
    WHERE c.cash_price IS NULL
      AND c.min_price IS NULL
      AND c.max_price IS NULL
      AND c.avg_negotiated_rate IS NULL
    GROUP BY COALESCE(UPPER(TRIM(p.state)), 'UNKNOWN');
END;
$$;

-- RPC 3: Orphan charge count
CREATE OR REPLACE FUNCTION audit_orphan_charges()
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  result bigint;
BEGIN
  SELECT COUNT(*) INTO result
  FROM charges c
  WHERE NOT EXISTS (
    SELECT 1 FROM providers p WHERE p.id = c.provider_id
  );
  RETURN result;
END;
$$;

-- RPC 4: Code coverage for curated billing codes
CREATE OR REPLACE FUNCTION audit_code_coverage(p_codes text[])
RETURNS TABLE (code text, match_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  RETURN QUERY
    WITH code_hits AS (
      SELECT cpt AS matched_code, COUNT(*) AS cnt
      FROM charges
      WHERE cpt = ANY(p_codes)
      GROUP BY cpt
      UNION ALL
      SELECT hcpcs AS matched_code, COUNT(*) AS cnt
      FROM charges
      WHERE hcpcs = ANY(p_codes)
      GROUP BY hcpcs
    )
    SELECT
      u.code::text AS code,
      COALESCE(SUM(ch.cnt), 0)::bigint AS match_count
    FROM UNNEST(p_codes) AS u(code)
    LEFT JOIN code_hits ch ON ch.matched_code = u.code
    GROUP BY u.code;
END;
$$;

-- RPC 5: Duplicate charge detection for specified providers
CREATE OR REPLACE FUNCTION audit_duplicate_charges(p_provider_ids uuid[])
RETURNS TABLE (
  provider_id uuid,
  provider_name text,
  code_value text,
  cash_price numeric,
  occurrences bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  RETURN QUERY
    WITH duplicates AS (
      SELECT
        c.provider_id,
        COALESCE(NULLIF(TRIM(c.cpt), ''), NULLIF(TRIM(c.hcpcs), '')) AS code_value,
        c.cash_price,
        COUNT(*) AS occurrences
      FROM charges c
      WHERE c.provider_id = ANY(p_provider_ids)
        AND (COALESCE(NULLIF(TRIM(c.cpt), ''), NULLIF(TRIM(c.hcpcs), '')) IS NOT NULL)
      GROUP BY
        c.provider_id,
        COALESCE(NULLIF(TRIM(c.cpt), ''), NULLIF(TRIM(c.hcpcs), '')),
        c.cash_price
      HAVING COUNT(*) > 1
    )
    SELECT
      d.provider_id,
      p.name AS provider_name,
      d.code_value,
      d.cash_price,
      d.occurrences
    FROM duplicates d
    JOIN providers p ON p.id = d.provider_id
    ORDER BY d.occurrences DESC;
END;
$$;
