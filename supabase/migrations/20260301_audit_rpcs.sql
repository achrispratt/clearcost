-- Audit RPC functions for scripts/db-audit.ts
-- Replaces ~6,700 individual REST API calls with 5 server-side aggregations.

-- RPC 1: Per-provider charge counts (replaces 5,400+ individual count queries)
CREATE OR REPLACE FUNCTION audit_provider_charge_counts()
RETURNS TABLE (provider_id uuid, charge_count bigint)
LANGUAGE SQL STABLE
AS $$
  SELECT c.provider_id, COUNT(*) AS charge_count
  FROM charges c
  GROUP BY c.provider_id;
$$;

-- RPC 2: Zero-price charges grouped by provider state (replaces ~180 batched queries)
CREATE OR REPLACE FUNCTION audit_zero_price_by_state()
RETURNS TABLE (state text, zero_price_count bigint)
LANGUAGE SQL STABLE
AS $$
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
$$;

-- RPC 3: Orphan charge count (replaces LEFT JOIN query that timed out via REST)
CREATE OR REPLACE FUNCTION audit_orphan_charges()
RETURNS bigint
LANGUAGE SQL STABLE
AS $$
  SELECT COUNT(*)
  FROM charges c
  WHERE NOT EXISTS (
    SELECT 1 FROM providers p WHERE p.id = c.provider_id
  );
$$;

-- RPC 4: Code coverage for curated billing codes (replaces 1,010 individual queries)
CREATE OR REPLACE FUNCTION audit_code_coverage(p_codes text[])
RETURNS TABLE (code text, match_count bigint)
LANGUAGE SQL STABLE
AS $$
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
    u.code,
    COALESCE(SUM(ch.cnt), 0) AS match_count
  FROM UNNEST(p_codes) AS u(code)
  LEFT JOIN code_hits ch ON ch.matched_code = u.code
  GROUP BY u.code;
$$;

-- RPC 5: Duplicate charge detection for specified providers (replaces 120 fetch+hash queries)
-- Groups by (provider_id, code, cash_price) only — no description regex to keep it fast.
CREATE OR REPLACE FUNCTION audit_duplicate_charges(p_provider_ids uuid[])
RETURNS TABLE (
  provider_id uuid,
  provider_name text,
  code_value text,
  cash_price numeric,
  occurrences bigint
)
LANGUAGE SQL STABLE
AS $$
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
$$;

-- Partial index to speed up zero-price aggregation
CREATE INDEX IF NOT EXISTS idx_charges_all_prices_null
ON charges (provider_id)
WHERE cash_price IS NULL
  AND min_price IS NULL
  AND max_price IS NULL
  AND avg_negotiated_rate IS NULL;
