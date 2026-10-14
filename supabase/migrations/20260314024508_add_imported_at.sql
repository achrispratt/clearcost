-- Add imported_at column to track when each charge row was imported.
-- Enables freshness queries (e.g., WHERE imported_at < '2026-01-01')
-- and debugging ("when did this data appear?").
--
-- Existing rows get NULL (they predate this tracking).
-- New imports will have timestamps via DEFAULT now().

ALTER TABLE charges ADD COLUMN IF NOT EXISTS imported_at timestamptz DEFAULT now();
