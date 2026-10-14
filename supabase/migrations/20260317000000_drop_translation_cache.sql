-- translation_cache (from 20260228123000_search_stability_hardening.sql) was
-- replaced by the KB tables; scripts/migrate-translation-cache.ts copied its rows
-- into kb_synonyms/kb_nodes. The table was then dropped by hand in the SQL
-- editor. This file records that drop and is marked applied.

drop table if exists translation_cache;
