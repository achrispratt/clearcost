-- The episode estimator now calls lookup_episode_component_charges_v2 (which adds
-- billing_class and the negotiated-rate range). Nothing calls v1 any more.
drop function if exists public.lookup_episode_component_charges(text, uuid[], double precision);
