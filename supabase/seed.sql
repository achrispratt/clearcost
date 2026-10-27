-- Public hospital-price review snapshot, captured October 27, 2026.
-- Six hospitals near ZIP 07086; knee MRI variants and office-visit codes only.
-- Values are copied from the public anonymous Data API, not invented quotes.
-- No accounts, saved searches, emails, KB history or private data are included.
-- Local/ephemeral preview fixture: this is not national or live coverage.
-- Skip populated databases to avoid adding stale fixture rows to production.

do $preview_seed$
begin
  if exists (select 1 from public.providers limit 1)
     or exists (select 1 from public.charges limit 1) then
    raise notice 'Skipping preview seed: pricing data already exists';
    return;
  end if;

insert into public.providers (id, name, address, city, state, zip, lat, lng, phone, website, provider_type, npi, trilliant_hospital_id, last_updated, cms_ccn, cms_star_rating, cms_rating_as_of) values
  ('004353f8-1fc5-40f2-8843-9e55a6ca3238', 'Hudson Regional Hospital', '55 Meadowlands Pkwy Secaucus NJ 07094', null, 'NJ', '07094', 40.791, -74.0634, null, 'http://www.meadowlandshospital.org/', 'hospital', null, 5877, '2025-08-14', '310118', 2, '2026-07-22'),
  ('19f16ac2-d1d3-4271-9234-6dc4904a384d', 'Lenox Hill Hospital', '100 E 77th St, New York, NY, 10075', 'New York', 'NY', '10075', 40.7143, -74.006, null, null, 'hospital', null, 3867, '2025-09-01', '330119', 5, '2026-07-22'),
  ('409e87a0-9a25-46f9-9845-2c290686f071', 'Bellevue Hospital Center', '462 1st Ave, New York, NY 10016', 'New York', 'NY', '10016', 40.7443, -73.9781, null, 'https://www.nychealthandhospitals.org/bellevue/html/home/home.shtml', 'hospital', null, 4084, '2025-05-01', '330204', 2, '2026-07-22'),
  ('5060cc62-5b89-4ee4-a430-f41ab55b60fd', 'NewYork-Presbyterian Weill Cornell Medical Center', '525 East 68th Street New York NY 10021', 'New York', 'NY', '10021', 40.7685, -73.9588, null, 'https://www.nyp.org/', 'hospital', null, 2515, '2024-12-30', null, null, null),
  ('635621be-e054-4125-980f-0d657415c219', 'Palisades Medical Center', '7600 River Rd., North Bergen, NJ 07047', 'North Bergen', 'NJ', '07047', 40.7939, -74.0258, null, 'https://www.hackensackmeridianhealth.org/', 'hospital', null, 3860, '2024-12-31', '310003', 2, '2026-07-22'),
  ('89cd0449-74c2-4912-adc3-60836ee4cdde', 'Jersey City Medical Center', '355 Grand Street, Jersey City, NJ 07302', 'Jersey City', 'NJ', '07302', 40.7221, -74.0469, null, 'https://www.rwjbh.org/', 'hospital', null, 4920, '2025-01-01', '310074', 3, '2026-07-22')
on conflict do nothing;

insert into public.charges (id, provider_id, description, setting, billing_class, cpt, hcpcs, ms_drg, revenue_code, ndc, icd, modifiers, gross_charge, cash_price, min_price, max_price, avg_negotiated_rate, min_negotiated_rate, max_negotiated_rate, payer_count, source, last_updated, laterality, body_site, imported_at) values
  ('094857ec-6660-4f4e-8a93-4137e98cabd3', '19f16ac2-d1d3-4271-9234-6dc4904a384d', 'Office o/p est low 20-29 min', 'outpatient', null, '99213', null, null, null, null, null, null, null, 300, 180, 600, 328.43, 263.91, 593.81, 73, 'trilliant_oria', '2026-02-19T23:18:49.993046+00:00', null, null, '2026-03-14T02:45:08.586481+00:00'),
  ('0b8052dc-447e-4204-b803-165f1cedc54e', '5060cc62-5b89-4ee4-a430-f41ab55b60fd', 'HC BH ESTAB PT SERVICE LEVEL 3', 'outpatient', null, '99213', null, null, null, null, null, null, 715, 536.25, 357.5, 672.1, 589.24, 357.5, 672.1, 11, 'cms_mrf', '2026-03-31T00:00:00+00:00', null, null, '2026-10-19T15:04:34.257814+00:00'),
  ('49cba9f9-4d49-4924-a595-58034b86211a', '89cd0449-74c2-4912-adc3-60836ee4cdde', 'Hc Mri Lwr Ext Jnt W&W/O Con Rt', 'outpatient', null, '73723', null, null, null, null, null, 'RT', 5098, null, 828, 6117.6, 615.94, 414, 1094.67, 11, 'trilliant_oria', '2026-03-01T22:02:06.883921+00:00', 'right', null, '2026-03-14T02:45:08.586481+00:00'),
  ('7dcdf060-9bac-4f55-b5fb-41fce21fe92d', '5060cc62-5b89-4ee4-a430-f41ab55b60fd', 'HC BH ESTAB PT SERVICE LEVEL 4', 'outpatient', null, '99214', null, null, null, null, null, null, 715, 536.25, 357.5, 847.7, 613.96, 357.5, 847.7, 11, 'cms_mrf', '2026-03-31T00:00:00+00:00', null, null, '2026-10-19T15:04:34.257814+00:00'),
  ('86c50601-f507-419e-96b9-3434c1ec8219', '5060cc62-5b89-4ee4-a430-f41ab55b60fd', 'HC MRI ANY JOINT LOWER EXTREMITY W/O CONTRAST', 'outpatient', null, '73721', null, null, null, null, null, null, 4506, 3379.5, 271.73, 4235.64, 1519.83, 271.73, 4235.64, 49, 'cms_mrf', '2026-03-31T00:00:00+00:00', null, null, '2026-10-19T15:04:34.257814+00:00'),
  ('89baba8c-4104-4f76-ac79-c751f30b8eea', '19f16ac2-d1d3-4271-9234-6dc4904a384d', 'Office o/p est mod 30-39 min', 'outpatient', null, '99214', null, null, null, null, null, null, null, 400, 240, 800, 340.47, 263.91, 593.81, 73, 'trilliant_oria', '2026-02-19T23:18:49.993046+00:00', null, null, '2026-03-14T02:45:08.586481+00:00'),
  ('9a55ab6d-334a-498f-819d-843e53809e8b', '5060cc62-5b89-4ee4-a430-f41ab55b60fd', 'HC MRI ANY JOINT LOWER EXTREMITY W/O&W CONTRAST', 'outpatient', null, '73723', null, null, null, null, null, null, 5587, 4190.25, 401.46, 5251.78, 2048.15, 401.46, 5251.78, 49, 'cms_mrf', '2026-03-31T00:00:00+00:00', null, null, '2026-10-19T15:04:34.257814+00:00'),
  ('9f2349ac-9b52-4455-a0b8-ac5a05b9f62f', '409e87a0-9a25-46f9-9845-2c290686f071', 'MRI JNT OF LWR EXTRE W/O DYE', 'outpatient', 'facility', null, '73721', null, null, null, null, 'TC', null, 286.04, 161.9, 571, 270.97, 161.9, 571, 7, 'cms_mrf', '2026-09-05T00:00:00+00:00', null, null, '2026-10-19T15:03:56.680063+00:00'),
  ('a69d10ad-1093-45db-ac90-13dd5dc19f42', '89cd0449-74c2-4912-adc3-60836ee4cdde', 'Hc Mri Lwr Ext Jnt W/O Con Rt', 'outpatient', null, '73721', null, null, null, null, null, 'RT', 2892, null, 566.73, 3470.4, 416.97, 283.37, 761.66, 11, 'trilliant_oria', '2026-03-01T22:02:06.883921+00:00', 'right', null, '2026-03-14T02:45:08.586481+00:00'),
  ('ac627686-de47-4693-baae-61df72783fd6', '19f16ac2-d1d3-4271-9234-6dc4904a384d', 'Mri joint lwr extr w/o&w/dye', 'outpatient', null, '73723', null, null, null, null, null, null, null, 1211.92, 431.41, 4223, 959.26, 431.41, 1820.67, 73, 'trilliant_oria', '2026-02-19T23:18:49.993046+00:00', null, null, '2026-03-14T02:45:08.586481+00:00'),
  ('bc0ce881-12c4-4343-8828-b39c7649c50b', '004353f8-1fc5-40f2-8843-9e55a6ca3238', 'MAGNETIC RESONANCE (EG, PROTON) IMAGING, ANY JOINT OF LOWER EXTREMITY; WITHOUT CONTRAST MATERIAL', 'outpatient', null, null, '73721', null, '0610', null, null, null, 3988.3, 3988.3, 368.21, 7525.92, 2656.64, 368.21, 7525.92, 6, 'trilliant_oria', '2026-03-01T22:03:28.172684+00:00', null, null, '2026-03-14T02:45:08.586481+00:00'),
  ('c6c39024-c492-4782-8874-335b598c5c32', '89cd0449-74c2-4912-adc3-60836ee4cdde', 'Hc Mri Lwr Ext Jnt W/O Con Lt', 'outpatient', null, '73721', null, null, null, null, null, 'LT', 2892, null, 566.73, 3470.4, 416.97, 283.37, 761.66, 11, 'trilliant_oria', '2026-03-01T22:02:06.883921+00:00', 'left', null, '2026-03-14T02:45:08.586481+00:00'),
  ('e0448341-36f2-4a7f-8640-1f447510f4e3', '89cd0449-74c2-4912-adc3-60836ee4cdde', 'Hc Mri Lwr Ext Jnt W&W/O Con Lt', 'outpatient', null, '73723', null, null, null, null, null, 'LT', 5098, null, 828, 6117.6, 615.94, 414, 1094.67, 11, 'trilliant_oria', '2026-03-01T22:02:06.883921+00:00', 'left', null, '2026-03-14T02:45:08.586481+00:00'),
  ('eacbbe89-e1e9-4bca-b4fd-e89690f2eabe', '635621be-e054-4125-980f-0d657415c219', 'MRI ANY JT LOWER EXTREM W/O CONTRAST MATRL', 'outpatient', 'facility', null, '73721', null, '0610', null, null, null, 4290, 280.16, 733.59, 4161.3, 1465.84, 283.37, 4161.3, 20, 'trilliant_oria', '2026-03-01T22:00:30.180373+00:00', null, null, '2026-03-14T02:45:08.586481+00:00'),
  ('f604f4e9-89c5-4604-b608-2c42f901fa4b', '19f16ac2-d1d3-4271-9234-6dc4904a384d', 'Mri jnt of lwr extre w/o dye', 'outpatient', null, '73721', null, null, null, null, null, null, null, 574.79, 274.88, 2309.56, 574.06, 274.88, 1283, 73, 'trilliant_oria', '2026-02-19T23:18:49.993046+00:00', null, null, '2026-03-14T02:45:08.586481+00:00')
on conflict do nothing;

insert into public.code_price_reference (code, professional, typical_price, sample_size, refreshed_at) values
  ('73721', false, 1798.4, 11310, '2026-10-27T04:00:00.125554+00:00'),
  ('73721', true, 249.59, 1171, '2026-10-27T04:00:00.125554+00:00'),
  ('73723', false, 2470, 10468, '2026-10-27T04:00:00.125554+00:00'),
  ('73723', true, 394.13, 1125, '2026-10-27T04:00:00.125554+00:00'),
  ('99213', false, 175.2, 11556, '2026-10-27T04:00:00.125554+00:00'),
  ('99213', true, 120.6, 976, '2026-10-27T04:00:00.125554+00:00'),
  ('99214', false, 232.56, 10572, '2026-10-27T04:00:00.125554+00:00'),
  ('99214', true, 165.75, 944, '2026-10-27T04:00:00.125554+00:00')
on conflict do nothing;

insert into public.medicare_benchmarks (code, description, facility_rate, non_facility_rate, conversion_factor, pfs_year, status_code) values
  ('73721', 'Mri jnt of lwr extre w/o dye', 200.22, 200.22, 32.3465, 2025, 'A'),
  ('73723', 'Mri joint lwr extr w/o&w/dye', 377.48, 377.48, 32.3465, 2025, 'A'),
  ('99213', 'Office o/p est low 20 min', 63.72, 88.95, 32.3465, 2025, 'A'),
  ('99214', 'Office o/p est mod 30 min', 93.8, 125.18, 32.3465, 2025, 'A')
on conflict do nothing;

end
$preview_seed$;
