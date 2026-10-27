begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select ok(has_table_privilege('anon', 'public.providers', 'SELECT'), 'public can read providers');
select ok(has_table_privilege('anon', 'public.charges', 'SELECT'), 'public can read prices');
select ok(has_table_privilege('authenticated', 'public.charges', 'SELECT'), 'signed-in users can read prices');
select ok(has_table_privilege('anon', 'public.code_price_reference', 'SELECT'), 'public can read price bands');
select ok(not has_table_privilege('anon', 'public.charges', 'INSERT'), 'public cannot write prices');
select ok(not has_table_privilege('anon', 'public.saved_searches', 'SELECT'), 'public cannot read saved searches');
select ok(has_table_privilege('authenticated', 'public.saved_searches', 'INSERT'), 'signed-in users can save searches');
select ok(has_table_privilege('authenticated', 'public.saved_searches', 'DELETE'), 'signed-in users can delete saves');
select ok(not has_table_privilege('anon', 'public.kb_nodes', 'SELECT'), 'KB stays server-only');
select ok(has_table_privilege('service_role', 'public.kb_nodes', 'INSERT'), 'server can cache resolutions');
select ok(has_table_privilege('service_role', 'public.waitlist_emails', 'INSERT'), 'server can capture notification requests');
select ok((select relrowsecurity from pg_class where oid = 'public.saved_searches'::regclass), 'saved-search RLS stays enabled');

select * from finish();
rollback;
