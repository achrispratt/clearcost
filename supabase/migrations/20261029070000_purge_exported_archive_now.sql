-- Run the archive purge once now instead of waiting for the 05:15 UTC job:
-- every hospital in charges_archive was exported to Storage and checked on
-- 2026-10-29 (scripts/archive-to-storage.ts), so this truncates the table and
-- returns its ~570 MB of disk before the next state load. Guarded: hospitals
-- archived after their Storage file are left in place.
select public.purge_exported_archive();
