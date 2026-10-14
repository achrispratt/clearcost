-- Migration: Resolve providers with state = 'unknown'
-- Issue: #6 (https://github.com/achrispratt/clearcost/issues/6)
-- Date: 2026-03-02
--
-- 118 providers had state='unknown' due to missing/malformed state data in
-- Trilliant Oria source files. States resolved via:
--   - zip_lookup (71): zipcodes npm package mapping ZIP → state
--   - address_parse (2): regex extraction from address text
--   - name_match (9): hospital system name → known state
--   - web_search (36): manual research via web search
--
-- Verification: After running, SELECT count(*) FROM providers WHERE state = 'unknown' should return 0.

UPDATE providers p
SET
  state = f.new_state,
  updated_at = now()
FROM (VALUES
  -- zip_lookup: resolved via ZIP code → state mapping
  ('f0465e06-1352-48a6-81e6-615cc0d338e6'::uuid, 'KS', 'zip_lookup'),  -- Anderson County Hospital (ZIP was PO Box — corrected via web)
  ('fd033219-38b7-4950-b6e9-012704dd2895'::uuid, 'FL', 'zip_lookup'),  -- Baptist & Wolfson St Augustine ER
  ('3d376a53-3684-4860-ba81-860967a2bb80'::uuid, 'PA', 'zip_lookup'),  -- CHP-LVHN JV d/b/a Lehigh Valley Hospital - Gilbertsville
  ('45a8ad96-6deb-4781-97c4-9dbbbd2cfd0b'::uuid, 'PA', 'zip_lookup'),  -- CHP-LVHN JV d/b/a Lehigh Valley Hospital - Macungie
  ('5e1e00c4-543e-4e19-9ca9-0b1ecd32d588'::uuid, 'MT', 'zip_lookup'),  -- Community Hospital of Anaconda
  ('e005fde3-1f98-442b-b45f-41f286f0183f'::uuid, 'KY', 'zip_lookup'),  -- Crittenden Community Hospital
  ('1b4f2c60-463e-4e34-a2cb-28905c2fcbeb'::uuid, 'NY', 'zip_lookup'),  -- David H. Koch Center (MSK)
  ('9539ad55-7a44-4530-a073-43ecb8ea9e90'::uuid, 'TX', 'zip_lookup'),  -- DEL SOL REHAB
  ('872fa6e2-d42e-4723-a32e-e2c7df39ad24'::uuid, 'PR', 'zip_lookup'),  -- Doctors' Center Hospital - Bayamón
  ('b5f3ac01-ebd0-4c60-9c36-fc1e4c6d4e87'::uuid, 'PR', 'zip_lookup'),  -- Doctors' Center Hospital - Dorado
  ('7d35ab6f-536c-41bc-8630-8e9ffbc770ce'::uuid, 'PR', 'zip_lookup'),  -- Doctors' Center Hospital - Manatí
  ('b2d965e8-8f3c-4096-9c88-c7534d64e0dd'::uuid, 'PR', 'zip_lookup'),  -- Doctors' Center Hospital - San Juan
  ('259334e7-028d-4fd3-a9f3-b7006589bc1d'::uuid, 'VA', 'zip_lookup'),  -- Doctors' Hospital of Williamsburg
  ('ee41cc2f-be6c-4fb6-b1d6-482c38c9576d'::uuid, 'PR', 'zip_lookup'),  -- Encompass Health Rehab - Manati
  ('8eff2f14-8e83-442a-a7bf-8fb8a8624044'::uuid, 'PR', 'zip_lookup'),  -- Encompass Health Rehab - San Juan
  ('8a9d810b-de43-4797-91a8-0f8c04de606c'::uuid, 'NY', 'zip_lookup'),  -- Evelyn H. Lauder Breast Center (MSK)
  ('67811265-db4f-4ee3-aeaf-3254c6e6d0cc'::uuid, 'OH', 'zip_lookup'),  -- Fairfield Medical Center
  ('d59e1826-e392-43c6-878e-574008f30912'::uuid, 'NY', 'zip_lookup'),  -- Flushing Hospital Medical Center
  ('ad255860-a640-4a6f-93e1-adb4e163af74'::uuid, 'FL', 'zip_lookup'),  -- HCA FLORIDA FORT WALTON-DESTIN HOSPITAL
  ('5b4d6da6-a847-4c58-8b7a-b3414b82b998'::uuid, 'FL', 'zip_lookup'),  -- HCA FLORIDA NORTHSIDE HOSPITAL
  ('6be6ada7-acee-4473-bc28-53d7d452e956'::uuid, 'NY', 'zip_lookup'),  -- Jamaica Hospital Medical Center
  ('415c5373-d0b7-43fd-8238-e9ce09311bd1'::uuid, 'NY', 'zip_lookup'),  -- Josie Robertson Surgery Center (MSK)
  ('9b76221f-363b-4abf-a83c-8c9999a84877'::uuid, 'AR', 'zip_lookup'),  -- McGehee Hospital
  ('3f37bbde-e5d7-4586-b8d8-59f1df4fc364'::uuid, 'TX', 'zip_lookup'),  -- MEDICAL CITY ER WHITE SETTLEMENT
  ('b6851598-f221-4129-96c5-99b340a9eedb'::uuid, 'TX', 'zip_lookup'),  -- MEDICAL CITY FORT WORTH HOSPITAL
  ('656c33c7-983e-4c08-b7a8-0fc996684b06'::uuid, 'TX', 'zip_lookup'),  -- MEDICAL CITY SURGICAL HOSPITAL ALLIANCE
  ('ab882efb-d773-4e14-9f47-bc204ef8d4e5'::uuid, 'DC', 'zip_lookup'),  -- MedStar Washington Hospital Center
  ('c3772a7d-5e44-4cde-b140-e87810729fc3'::uuid, 'NY', 'zip_lookup'),  -- MSK 64th Street Outpatient Center
  ('6f482930-ea5a-40f5-9fe8-f9c8693ea02b'::uuid, 'NJ', 'zip_lookup'),  -- MSK Basking Ridge
  ('05cd0f1a-83c6-44ea-85d1-5099511571b5'::uuid, 'NJ', 'zip_lookup'),  -- MSK Bergen
  ('e6376a09-8b9c-4306-80f4-42973ae68146'::uuid, 'NY', 'zip_lookup'),  -- MSK Brooklyn Infusion Center
  ('4279ca38-f724-4bc6-9ebf-74a683f881a8'::uuid, 'NY', 'zip_lookup'),  -- Memorial Sloan Kettering Cancer Center
  ('bacee447-b9b4-4e56-9579-db3f12af62bc'::uuid, 'NY', 'zip_lookup'),  -- MSK Commack
  ('632d2609-7bf5-4f49-9044-2666f6fe4900'::uuid, 'NY', 'zip_lookup'),  -- MSK Counseling Center
  ('6a07ed9a-a20e-46bc-8f62-cd3ae9bf0e19'::uuid, 'NY', 'zip_lookup'),  -- MSK Imaging Center
  ('4c2ca901-c29e-40ac-a12d-b7bdc159dfda'::uuid, 'NJ', 'zip_lookup'),  -- MSK Monmouth
  ('d0b05cfd-ffb3-4902-b8c4-54e3f4d8f507'::uuid, 'NY', 'zip_lookup'),  -- MSK Nassau
  ('40b0974c-e552-4377-97ff-553e2b3ba4ca'::uuid, 'NY', 'zip_lookup'),  -- MSK Skin Cancer Center Hauppauge
  ('93367715-4c0d-43dd-865c-e8838ecc59f0'::uuid, 'NY', 'zip_lookup'),  -- MSK Westchester
  ('01fb4afa-beb6-47b8-b2d0-9876f0479f00'::uuid, 'IL', 'zip_lookup'),  -- Mercy Medical Center
  ('786307a3-8182-4043-8f10-b04efdd44a19'::uuid, 'AL', 'zip_lookup'),  -- Mizell Memorial Hospital
  ('e3b95a17-0f41-4e95-8e40-0ba1c03774f7'::uuid, 'NY', 'zip_lookup'),  -- MSK Ralph Lauren Center
  ('92fda5dc-5335-459b-b756-f484568ee210'::uuid, 'OH', 'zip_lookup'),  -- Nationwide Children's Hospital Toledo
  ('40e86a5d-e670-49c6-814a-c8a03f03fe7f'::uuid, 'NY', 'zip_lookup'),  -- NYP Brooklyn Methodist Hospital
  ('5f8b9f17-9e35-47a2-9fa2-5895c2f2b94c'::uuid, 'NY', 'zip_lookup'),  -- NYP Columbia University Irving Medical Center
  ('7b40a99a-809d-47c2-be69-0e1773e1e224'::uuid, 'NY', 'zip_lookup'),  -- NYP Hudson Valley Hospital
  ('acdfa032-b5a2-4522-8d30-8256abf0b413'::uuid, 'NY', 'zip_lookup'),  -- NYP Lower Manhattan Hospital
  ('277aad73-1b35-4151-ad7c-be4392d93ccf'::uuid, 'NY', 'zip_lookup'),  -- NYP Queens
  ('5060cc62-5b89-4ee4-a430-f41ab55b60fd'::uuid, 'NY', 'zip_lookup'),  -- NYP Weill Cornell Medical Center
  ('ba4645cd-2cd5-46fa-b942-15ffab352f8b'::uuid, 'NY', 'zip_lookup'),  -- NYP Westchester
  ('830167bf-018a-4e8d-bad3-983b015c35c9'::uuid, 'NY', 'zip_lookup'),  -- NYP Westchester Behavioral Health
  ('1f66c73b-5e67-423a-b189-1b25b3c76bf9'::uuid, 'LA', 'zip_lookup'),  -- Oceans Behavioral Hospital Hammond
  ('65835832-8940-4829-af59-7caca3f3ebe8'::uuid, 'LA', 'zip_lookup'),  -- Oceans Behavioral Hospital Kentwood
  ('b9ea6f5f-cefc-48ba-b768-b84ef0e27c06'::uuid, 'NY', 'zip_lookup'),  -- Peconic Bay Medical Center
  ('62630257-42b7-4323-a2e6-78c1420e6f94'::uuid, 'ME', 'zip_lookup'),  -- Penobscot Valley Hospital
  ('19fbd059-def6-4f7a-a3d7-e26e64fbdc3f'::uuid, 'MT', 'zip_lookup'),  -- Phillips County Hospital
  ('f12db0f4-ac25-4262-ae55-152333f9838f'::uuid, 'VA', 'zip_lookup'),  -- Riverside Hospital, Inc.
  ('d6e04562-eae9-452f-a620-0981ebfcfd1c'::uuid, 'VA', 'zip_lookup'),  -- Riverside Middle Peninsula Hospital
  ('53c75a4e-549e-4726-90ee-958c6f25744c'::uuid, 'NY', 'zip_lookup'),  -- Rockefeller Outpatient Pavilion (MSK)
  ('59db9cb7-745e-4b79-9728-927fb07ae9d4'::uuid, 'OK', 'zip_lookup'),  -- Rural Wellness Anadarko
  ('0e59909b-b12e-4833-b373-f3d2ae11626c'::uuid, 'OK', 'zip_lookup'),  -- Rural Wellness Stroud
  ('db7aa338-0bed-4d72-96a2-e241a4463d03'::uuid, 'IL', 'zip_lookup'),  -- Saint Francis Hospital
  ('daef0bf3-52c9-4329-8aaf-c389efcd446c'::uuid, 'IL', 'zip_lookup'),  -- Saint Joseph Hospital
  ('10ffc2d0-2c23-4dfe-8c96-0b819cb7b13d'::uuid, 'IL', 'zip_lookup'),  -- Saint Joseph Medical Center
  ('7dbe2b10-5a98-4df7-9047-8ebd28c1796d'::uuid, 'MO', 'zip_lookup'),  -- Saint Luke's Hospital of Kansas City
  ('e912c641-3703-4be7-995e-502726128cb7'::uuid, 'MO', 'zip_lookup'),  -- Saint Luke's North Hospital – Smithville
  ('024d5cad-7f70-476e-afcf-b0f6496afbbe'::uuid, 'IL', 'zip_lookup'),  -- Saint Mary of Nazareth Hospital
  ('68b3d851-adb0-456b-8d75-85fc813a898d'::uuid, 'KS', 'zip_lookup'),  -- Scott County Hospital
  ('010afcf0-f50e-45d8-bfaf-3fa781ff0846'::uuid, 'NY', 'zip_lookup'),  -- Sidney Kimmel Center (MSK)
  ('74c4539b-edd5-44f3-8fe8-678da0828536'::uuid, 'NY', 'zip_lookup'),  -- Sisters of Charity Hospital
  ('fbc06ca8-d49d-491d-8e65-848e53adf056'::uuid, 'NY', 'zip_lookup'),  -- Sisters of Charity Hospital - St. Joseph Campus
  ('86ec2151-c466-409b-a93a-0f425cc017fb'::uuid, 'LA', 'zip_lookup'),  -- Springhill Medical Center
  ('a811e3b4-8561-45db-859b-d2b05bebea11'::uuid, 'ND', 'zip_lookup'),  -- St. Luke's Hospital
  ('326d921c-e9bb-4751-93dd-f709183d107d'::uuid, 'IL', 'zip_lookup'),  -- St. Mary's Hospital
  ('46bfd047-acfb-49e6-9a1c-22c80813fe48'::uuid, 'VA', 'zip_lookup'),  -- VCU Community Memorial Hospital

  -- address_parse: state extracted from address text (verified via web search)
  ('fa66b690-b4eb-423f-917c-c34326359e50'::uuid, 'VA', 'address_parse'),  -- Shore Health Services (Onancock, VA)
  ('6200f06a-b6d0-4d59-8bfc-4b64d040456b'::uuid, 'FL', 'address_parse'),  -- Moffitt Cancer Center (Tampa, FL)

  -- name_match: resolved via hospital system name → known state
  ('b60c2562-6634-42ff-87b0-4c8026a78a28'::uuid, 'KY', 'name_match'),  -- Norton Scott Hospital
  ('e065f767-32b2-45bd-a5e5-e6755030076a'::uuid, 'KY', 'name_match'),  -- Norton West Louisville Hospital
  ('f42ec687-21db-496e-a318-6d77415d7ba1'::uuid, 'AL', 'name_match'),  -- UAB St. Vincent's Blount
  ('0602e751-3a4b-46a3-9726-5d395212e0eb'::uuid, 'AL', 'name_match'),  -- UAB St. Vincent's Chilton
  ('883aa269-3400-4d05-b7ff-2556d1d9dd74'::uuid, 'AL', 'name_match'),  -- UAB St. Vincent's East
  ('98130085-2d1e-4e74-a639-6f527270bcee'::uuid, 'MS', 'name_match'),  -- UMMC Grenada Hospital
  ('b87eec02-def5-445b-8fa1-6f4037ae9316'::uuid, 'MS', 'name_match'),  -- UMMC Holmes County Hospital
  ('a64924b8-e246-4491-9c58-cc13115f2bfa'::uuid, 'MS', 'name_match'),  -- UMMC Jackson Hospital
  ('76a59a82-daa1-48f5-8c70-0975b0c3efbf'::uuid, 'MS', 'name_match'),  -- UMMC Madison Hospital

  -- web_search: resolved via manual web research
  ('cf521473-35fc-4487-a141-2870433704a3'::uuid, 'NY', 'web_search'),   -- Auburn Community Hospital (Auburn, NY)
  ('2065f2b4-35ac-4c67-86a8-66f136c77126'::uuid, 'CA', 'web_search'),   -- BEAR VALLEY COMMUNITY HOSPITAL (Big Bear Lake, CA)
  ('dba68976-67f8-4895-8c80-cee6b8bdac6f'::uuid, 'MS', 'web_search'),   -- Clay County Medical Corporation (West Point, MS)
  ('bddb09aa-0667-4b0e-ab52-34635d9eea30'::uuid, 'OK', 'web_search'),   -- Cleveland Area Hospital (Cleveland, OK)
  ('5a1b7b8e-f2da-4eb5-ae39-7925a596a181'::uuid, 'OR', 'web_search'),   -- Coquille Valley Hospital (Coquille, OR)
  ('897cf8da-1c80-4032-b2c6-da62104c5c0a'::uuid, 'CO', 'web_search'),   -- Delta County Memorial Hospital (Delta, CO)
  ('91d296dd-4c13-4a7f-b9d9-ae0ed90f778d'::uuid, 'NJ', 'web_search'),   -- Easton Avenue (Saint Peter's University Hospital, New Brunswick, NJ)
  ('c40d6bd7-ad36-4441-b5da-31d4dd80c926'::uuid, 'IL', 'web_search'),   -- John H. Stroger Jr. Hospital (Cook County, Chicago, IL)
  ('7c5b7ed1-79d0-4350-a5d5-4d8e8ae32387'::uuid, 'TX', 'web_search'),   -- Kell West Regional Hospital (Wichita Falls, TX)
  ('c062fcd5-606b-4a26-9d7e-a50510a151c4'::uuid, 'TN', 'web_search'),   -- Macon Community Hospital (Lafayette, TN)
  ('73116024-26e9-446e-a248-da72ee261741'::uuid, 'AL', 'web_search'),   -- Marion Regional Medical Center, Inc. (Hamilton, AL)
  ('3b3a452e-c57f-4d46-acbd-904a73b7023d'::uuid, 'TX', 'web_search'),   -- Medical Behavioral Hospital of Clear Lake (Webster, TX)
  ('0e3b4f4a-e59f-4d1c-b831-d1b1c04c93fd'::uuid, 'MS', 'web_search'),   -- Monroe Health Services, Inc. (Amory, MS — NMHS)
  ('911b65b1-be8e-4e56-8e32-18315fd4dab4'::uuid, 'KS', 'web_search'),   -- Neosho Memorial Regional Medical Center (Chanute, KS)
  ('d98817cf-3094-428a-b435-00165e6d2df0'::uuid, 'MS', 'web_search'),   -- North Mississippi Medical Center, Inc. (Tupelo, MS)
  ('c4251804-3885-4a70-a782-211a14311fc0'::uuid, 'TX', 'web_search'),   -- Parkland Health (Dallas, TX)
  ('ae318b86-e8c8-498c-9b64-7be7e5b928ef'::uuid, 'MS', 'web_search'),   -- Pontotoc Health Services, Inc. (Pontotoc, MS — NMHS)
  ('ecbbfe4f-698e-4c80-ac05-ce2fd9face76'::uuid, 'IL', 'web_search'),   -- Provident Hospital Cook County (Chicago, IL)
  ('0c1fc6b7-8f3c-4234-9156-8275d36c35cc'::uuid, 'PA', 'web_search'),   -- Rothman Orthopaedic Specialty Hospital (Bensalem, PA)
  ('d0386bd5-dd5e-436a-8b8f-295a5cd55316'::uuid, 'OK', 'web_search'),   -- Rural Wellness Fairfax (Fairfax, OK)
  ('2c7499f8-f452-403e-a688-59eea15576b8'::uuid, 'MO', 'web_search'),   -- Saint Luke's East Hospital (Lee's Summit, MO)
  ('f9e65e98-feba-488a-9cd0-83153c7ce233'::uuid, 'MO', 'web_search'),   -- Saint Luke's North Hospital (Kansas City, MO)
  ('041f2a6e-23bd-4d80-8ab5-d0c7a2c408bd'::uuid, 'KS', 'web_search'),   -- Saint Luke's South Hospital (Overland Park, KS)
  ('e28b6d7f-ef91-43dd-9f56-97d4b0e2860b'::uuid, 'LA', 'web_search'),   -- Surgical Specialty Center of Baton Rouge (LA)
  ('81615c31-d28e-4b50-9764-24e5dd44cef0'::uuid, 'TX', 'web_search'),   -- The Hospital at Westlake Medical Center (Austin, TX)
  ('f8825728-3e25-4612-9279-c014b56440b4'::uuid, 'MS', 'web_search'),   -- Tishomingo Health Services, Inc. (MS — NMHS)
  ('10798aaf-c8ec-4ec5-b54a-93fce79f01f1'::uuid, 'VA', 'web_search'),   -- VCU Medical Center (Richmond, VA)
  ('84457a4b-f93e-403a-b837-e10c876838db'::uuid, 'IL', 'web_search'),   -- Vista Medical Center (Waukegan, IL)
  ('b2c10770-c618-4269-8944-eb9a254b9ff8'::uuid, 'MS', 'web_search'),   -- Webster Health Services, Inc. (Eupora, MS — NMHS)

  -- web_search: address contained misleading street names (corrected via web)
  ('daa26547-e7eb-4a4d-85fa-6097d7dc19bc'::uuid, 'KS', 'web_search'),   -- Allen County Regional Hospital (Iola, KS — address said "Kentucky St")
  ('f45f0660-1fd1-4b8e-b656-937191a3c467'::uuid, 'MO', 'web_search'),   -- Hedrick Medical Center (Chillicothe, MO — address said "Washington St")
  ('a6dfbba4-a34a-44a1-b1d3-32543156f3fb'::uuid, 'MO', 'web_search')    -- Wright Memorial Hospital (Trenton, MO — address said "Iowa Blvd")
) AS f(provider_id, new_state, method)
WHERE p.id = f.provider_id
  AND p.state = 'unknown';  -- Safety: only update rows that are still 'unknown'
