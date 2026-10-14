-- One-time cleanup for #177: store one spelling of billing_class and setting.
-- Run in 16 batches by provider_id prefix (each batch fits the SQL editor's
-- timeout); :lo / :hi are consecutive values of
--   00000000-0000-0000-0000-000000000000, 10000000-…, …, f0000000-…, and
--   ffffffff-ffff-ffff-ffff-ffffffffffff (inclusive on the last batch).
-- Imports normalize on insert (lib/data/normalize-charge.ts), so this only
-- needs to run once. Afterwards: select refresh_provider_cash_ratios();
update charges c
set
  billing_class = case lower(trim(c.billing_class))
    when 'faciltiy' then 'facility'
    when 'hospital' then 'facility'
    when '' then null
    else lower(trim(c.billing_class))
  end,
  setting = nullif(lower(trim(c.setting)), '')
where c.provider_id >= :'lo'::uuid
  and c.provider_id < :'hi'::uuid
  and (
    c.billing_class is distinct from (case lower(trim(c.billing_class))
      when 'faciltiy' then 'facility'
      when 'hospital' then 'facility'
      when '' then null
      else lower(trim(c.billing_class))
    end)
    or c.setting is distinct from nullif(lower(trim(c.setting)), '')
  );
