-- CMS 70 shoppable services coverage (#145). Results: docs/cms70-coverage.md.
-- Read-only. Times out through the Supabase connector when run whole; run
-- it a dozen services at a time by trimming the svc list.
-- DRG rows count only when inpatient and titled like a DRG: some files put
-- revenue codes in the DRG column (0460 pulmonary function shows up as 460).
with svc(num,name,code,code_type) as (values
  (1,$$Psychotherapy, 30 min$$,$$90832$$,$$cpt$$),
  (2,$$Psychotherapy, 45 min$$,$$90834$$,$$cpt$$),
  (3,$$Psychotherapy, 60 min$$,$$90837$$,$$cpt$$),
  (4,$$Family psychotherapy w/o patient, 50 min$$,$$90846$$,$$cpt$$),
  (5,$$Family psychotherapy w/ patient, 50 min$$,$$90847$$,$$cpt$$),
  (6,$$Group psychotherapy$$,$$90853$$,$$cpt$$),
  (7,$$New patient office visit, 30 min$$,$$99203$$,$$cpt$$),
  (8,$$New patient office visit, 45 min$$,$$99204$$,$$cpt$$),
  (9,$$New patient office visit, 60 min$$,$$99205$$,$$cpt$$),
  (10,$$Patient office consultation, 40 min$$,$$99243$$,$$cpt$$),
  (11,$$Patient office consultation, 60 min$$,$$99244$$,$$cpt$$),
  (12,$$Preventive eval (18-39 years)$$,$$99385$$,$$cpt$$),
  (13,$$Preventive eval (40-64 years)$$,$$99386$$,$$cpt$$),
  (14,$$Basic metabolic panel$$,$$80048$$,$$cpt$$),
  (15,$$Comprehensive blood panel$$,$$80053$$,$$cpt$$),
  (16,$$Obstetric blood test panel$$,$$80055$$,$$cpt$$),
  (17,$$Lipid panel$$,$$80061$$,$$cpt$$),
  (18,$$Kidney function panel$$,$$80069$$,$$cpt$$),
  (19,$$Liver function panel$$,$$80076$$,$$cpt$$),
  (20,$$Manual urinalysis$$,$$81000$$,$$cpt$$),
  (20,$$Manual urinalysis$$,$$81001$$,$$cpt$$),
  (21,$$Automated urinalysis$$,$$81002$$,$$cpt$$),
  (21,$$Automated urinalysis$$,$$81003$$,$$cpt$$),
  (22,$$PSA test$$,$$84153$$,$$cpt$$),
  (22,$$PSA test$$,$$84154$$,$$cpt$$),
  (23,$$TSH blood test$$,$$84443$$,$$cpt$$),
  (24,$$CBC with differential$$,$$85025$$,$$cpt$$),
  (25,$$CBC automated$$,$$85027$$,$$cpt$$),
  (26,$$Clotting time test$$,$$85610$$,$$cpt$$),
  (27,$$Coagulation assessment$$,$$85730$$,$$cpt$$),
  (28,$$CT head/brain w/o contrast$$,$$70450$$,$$cpt$$),
  (29,$$MRI brain w/ contrast$$,$$70553$$,$$cpt$$),
  (30,$$X-ray lower back$$,$$72110$$,$$cpt$$),
  (31,$$MRI lower spinal canal$$,$$72148$$,$$cpt$$),
  (32,$$CT pelvis w/ contrast$$,$$72193$$,$$cpt$$),
  (33,$$MRI leg joint (knee)$$,$$73721$$,$$cpt$$),
  (34,$$CT abdomen/pelvis w/ contrast$$,$$74177$$,$$cpt$$),
  (35,$$Abdominal ultrasound$$,$$76700$$,$$cpt$$),
  (36,$$Ultrasound pregnant uterus$$,$$76805$$,$$cpt$$),
  (37,$$Transvaginal ultrasound$$,$$76830$$,$$cpt$$),
  (38,$$Mammography single breast$$,$$77065$$,$$cpt$$),
  (39,$$Mammography both breasts$$,$$77066$$,$$cpt$$),
  (40,$$Screening mammography bilateral$$,$$77067$$,$$cpt$$),
  (41,$$Cardiac valve procedures w/ cath$$,$$216$$,$$ms_drg$$),
  (42,$$Spinal fusion$$,$$460$$,$$ms_drg$$),
  (43,$$Major joint replacement lower extremity$$,$$470$$,$$ms_drg$$),
  (44,$$Cervical spinal fusion$$,$$473$$,$$ms_drg$$),
  (45,$$Uterine/adnexa procedures$$,$$743$$,$$ms_drg$$),
  (46,$$Breast growth removal$$,$$19120$$,$$cpt$$),
  (47,$$Shoulder bone shaving endoscopic$$,$$29826$$,$$cpt$$),
  (48,$$Knee cartilage removal endoscopic$$,$$29881$$,$$cpt$$),
  (49,$$Tonsil/adenoid removal, <12$$,$$42820$$,$$cpt$$),
  (50,$$Upper GI diagnostic endoscopy$$,$$43235$$,$$cpt$$),
  (51,$$Upper GI biopsy endoscopic$$,$$43239$$,$$cpt$$),
  (52,$$Colonoscopy diagnostic$$,$$45378$$,$$cpt$$),
  (53,$$Colonoscopy biopsy$$,$$45380$$,$$cpt$$),
  (54,$$Colonoscopy polyp removal$$,$$45385$$,$$cpt$$),
  (55,$$Lower bowel ultrasound endoscopic$$,$$45391$$,$$cpt$$),
  (56,$$Gallbladder removal endoscopic$$,$$47562$$,$$cpt$$),
  (57,$$Groin hernia repair$$,$$49505$$,$$cpt$$),
  (58,$$Prostate gland biopsy$$,$$55700$$,$$cpt$$),
  (59,$$Prostate removal endoscopic$$,$$55866$$,$$cpt$$),
  (60,$$Vaginal delivery w/ OB care$$,$$59400$$,$$cpt$$),
  (61,$$Cesarean delivery w/ OB care$$,$$59510$$,$$cpt$$),
  (62,$$VBAC w/ OB care$$,$$59610$$,$$cpt$$),
  (63,$$Spinal injection lower back$$,$$62322$$,$$cpt$$),
  (63,$$Spinal injection lower back$$,$$62323$$,$$cpt$$),
  (64,$$Nerve root injection lower spine$$,$$64483$$,$$cpt$$),
  (65,$$Cataract removal w/ laser$$,$$66821$$,$$cpt$$),
  (66,$$Cataract removal w/ lens$$,$$66984$$,$$cpt$$),
  (67,$$Routine EKG$$,$$93000$$,$$cpt$$),
  (68,$$Left heart catheterization$$,$$93452$$,$$cpt$$),
  (69,$$Sleep study$$,$$95810$$,$$cpt$$),
  (70,$$Physical therapy exercise$$,$$97110$$,$$cpt$$)
),
hits as (
  select s.num, c.provider_id, c.cash_price, c.gross_charge
  from svc s join charges c on s.code_type<>'ms_drg' and c.cpt=s.code
  union all
  select s.num, c.provider_id, c.cash_price, c.gross_charge
  from svc s join charges c on s.code_type<>'ms_drg' and c.hcpcs=s.code and c.cpt is null
  union all
  select s.num, c.provider_id, c.cash_price, c.gross_charge
  from svc s join charges c on s.code_type='ms_drg' and c.ms_drg=s.code and lower(trim(c.setting))='inpatient'
    and c.description ~* '(with|without|w/o|w/|w) +(mcc|cc)'
),
agg as (
  select num, count(distinct provider_id) hospitals,
    count(distinct provider_id) filter (where cash_price>0) cash_hospitals,
    round(percentile_cont(0.5) within group (order by cash_price) filter (where cash_price>0)) med_cash,
    round(percentile_cont(0.1) within group (order by cash_price) filter (where cash_price>0)) p10,
    round(percentile_cont(0.9) within group (order by cash_price) filter (where cash_price>0)) p90,
    round(percentile_cont(0.5) within group (order by cash_price/gross_charge) filter (where cash_price>0 and gross_charge>0)::numeric,2) cash_gross
  from hits group by num
)
select s.num, min(s.name) name, string_agg(distinct s.code, '/') codes, min(s.code_type) code_type,
  coalesce(a.hospitals,0) hospitals, coalesce(a.cash_hospitals,0) cash_hospitals, a.med_cash, a.p10, a.p90, a.cash_gross,
  bool_or(exists(select 1 from episode_definitions e where upper(trim(e.principal_code))=upper(s.code))) has_ssp
from svc s left join agg a using (num) group by s.num, a.hospitals, a.cash_hospitals, a.med_cash, a.p10, a.p90, a.cash_gross order by s.num;
