-- (provider_id, cpt) and (provider_id, hcpcs) were added for the nearby-search
-- query shape (20260228123000), but the planner uses the code-first indexes
-- (idx_charges_cpt_provider, idx_charges_hcpcs_provider) instead: 9 and 12
-- scans since May 2026 against hundreds of thousands for the others. They take
-- ~510 MB, which matters as hospital price files grow the charges table.
-- Lookups by provider alone still use idx_charges_provider.
drop index if exists public.idx_charges_provider_cpt;
drop index if exists public.idx_charges_provider_hcpcs;
