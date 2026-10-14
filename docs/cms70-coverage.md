# CMS 70 shoppable services: coverage audit

Audit for #145, run 2026-10-14 against production (`charges`, `episode_definitions`). Query: `scripts/cms70-coverage.sql`. It replaces `scripts/cms70-audit.ts`, which counted rows instead of distinct locations.

## How it was measured

- **Locations**: distinct `provider_id`s with at least one row for the code, out of 5,414 provider locations. CPT codes also match an HCPCS column hit when `cpt` is empty.
- **With cash**: locations with a `cash_price` above 0.
- **Median, p10, p90**: across cash-price rows, not per location.
- **Cash / list**: median of `cash_price / gross_charge` where both are set. Most hospitals publish cash as a flat discount off list (0.65 to 0.80).
- **SSP**: the code has a CMS Shoppable Service Package definition in `episode_definitions`. 9 of 70 do.
- **MS-DRGs**: only `setting = inpatient` rows whose description reads like a DRG title ("with/without MCC/CC"). Hospital files put revenue codes in the DRG column (0460 pulmonary function tests appear as "DRG 460", 0470 audiology as "470"). Unfiltered, DRG 460 had a median "cash price" of $219. The search RPC and the stay estimate now apply the same filter.
- Spot-checking raw hospital files against Trilliant (item 5 of #145) was not possible from the cloud environment, which has no outbound internet. It remains a manual check.

## Tiers

- **Tier 1**: listed at 30% or more of locations (1,624+) and 1,000+ locations with a cash price. Good enough to answer most searches near a user.
- **Tier 2**: 300+ locations with a cash price. Answerable in most metros, thin in rural areas, so results often lean on insured averages.
- **Tier 3**: under 300 locations with a cash price.

Result: **48 tier 1, 20 tier 2, 2 tier 3**. Well above the 15 tier-1 threshold in #145, so the plan does not need recalibrating on coverage grounds.

## Tier 1 (48)

| #   | Service                             | Code        | Locations | With cash | Median cash |    p10 |     p90 | Cash / list | SSP |
| --- | ----------------------------------- | ----------- | --------: | --------: | ----------: | -----: | ------: | ----------: | :-: |
| 1   | Psychotherapy, 30 min               | 90832       |     2,450 |     1,769 |        $184 |    $79 |    $409 |        0.75 |     |
| 2   | Psychotherapy, 45 min               | 90834       |     2,429 |     1,739 |        $230 |    $98 |    $552 |        0.75 |     |
| 3   | Psychotherapy, 60 min               | 90837       |     2,385 |     1,719 |        $292 |   $125 |    $775 |        0.75 |     |
| 4   | Family psychotherapy w/o patient    | 90846       |     2,127 |     1,356 |        $255 |    $96 |    $693 |        0.75 |     |
| 5   | Family psychotherapy w/ patient     | 90847       |     2,315 |     1,623 |        $246 |   $106 |    $718 |        0.75 |     |
| 6   | Group psychotherapy                 | 90853       |     2,343 |     1,678 |        $187 |    $52 |    $547 |        0.65 |     |
| 7   | New patient visit, 30 min           | 99203       |     2,749 |     2,289 |        $230 |    $81 |    $726 |        0.80 |     |
| 8   | New patient visit, 45 min           | 99204       |     2,727 |     2,262 |        $323 |   $112 |  $1,000 |        0.80 |     |
| 9   | New patient visit, 60 min           | 99205       |     2,686 |     2,208 |        $417 |   $148 |  $1,219 |        0.80 |     |
| 14  | Basic metabolic panel               | 80048       |     2,199 |     1,993 |        $171 |    $18 |  $1,700 |        1.00 |     |
| 15  | Comprehensive metabolic panel       | 80053       |     2,198 |     1,996 |        $181 |    $18 |  $2,417 |        0.80 |     |
| 17  | Lipid panel                         | 80061       |     2,190 |     1,989 |        $124 |    $15 |  $1,393 |        0.75 |     |
| 18  | Kidney function panel               | 80069       |     2,143 |     1,929 |        $183 |    $23 |  $1,933 |        1.00 |     |
| 19  | Liver function panel                | 80076       |     2,192 |     1,988 |        $159 |    $18 |  $1,693 |        0.90 |     |
| 20  | Urinalysis, manual                  | 81000/81001 |     2,180 |     1,980 |         $55 |     $8 |    $582 |        0.90 |     |
| 21  | Urinalysis, automated               | 81002/81003 |     2,194 |     2,000 |         $39 |     $6 |    $287 |        0.75 |     |
| 22  | PSA test                            | 84153/84154 |     2,186 |     1,979 |        $112 |    $15 |    $778 |        0.80 |     |
| 23  | TSH test                            | 84443       |     2,199 |     1,993 |        $127 |    $20 |  $1,067 |        0.75 |     |
| 24  | CBC with differential               | 85025       |     2,188 |     1,638 |         $57 |    $10 |    $180 |        0.66 |     |
| 25  | CBC, automated                      | 85027       |     2,146 |     1,943 |         $73 |    $13 |    $755 |        0.80 |     |
| 26  | Prothrombin time                    | 85610       |     2,199 |     2,007 |         $51 |     $7 |    $388 |        0.70 |     |
| 27  | Partial thromboplastin time         | 85730       |     2,191 |     1,989 |         $68 |     $9 |    $481 |        0.70 |     |
| 28  | CT head without contrast            | 70450       |     3,321 |     3,093 |      $1,224 |   $218 |  $7,685 |        0.70 |     |
| 29  | MRI brain with contrast             | 70553       |     3,265 |     3,021 |      $2,997 |   $618 | $13,553 |        0.75 |     |
| 30  | X-ray lower back                    | 72110       |     3,331 |     3,102 |        $442 |    $85 |  $2,533 |        0.72 |     |
| 31  | MRI lower spine                     | 72148       |     3,259 |     3,011 |      $2,130 |   $415 |  $9,861 |        0.75 |     |
| 32  | CT pelvis with contrast             | 72193       |     3,314 |     3,070 |      $1,670 |   $305 |  $9,876 |        0.75 |     |
| 33  | MRI knee                            | 73721       |     3,208 |     2,960 |      $1,993 |   $403 |  $9,442 |        0.70 |     |
| 34  | CT abdomen and pelvis with contrast | 74177       |     3,323 |     3,091 |      $2,826 |   $465 | $16,455 |        0.70 |     |
| 35  | Abdominal ultrasound                | 76700       |     3,328 |     3,103 |        $750 |   $158 |  $3,522 |        0.75 |     |
| 36  | Pregnancy ultrasound                | 76805       |     3,197 |     2,944 |        $564 |   $138 |  $3,014 |        0.70 |     |
| 37  | Transvaginal ultrasound             | 76830       |     3,303 |     3,073 |        $530 |   $129 |  $2,503 |        0.75 |     |
| 38  | Mammogram, one breast               | 77065       |     2,920 |     2,595 |        $287 |    $98 |    $930 |        0.73 |     |
| 39  | Mammogram, both breasts             | 77066       |     2,965 |     2,622 |        $424 |   $137 |  $1,533 |        0.75 |     |
| 40  | Screening mammogram                 | 77067       |     2,986 |     2,656 |        $279 |    $93 |    $944 |        0.70 |     |
| 46  | Breast lesion removal               | 19120       |     2,358 |     1,225 |      $2,153 |   $511 |  $6,191 |        0.70 | yes |
| 50  | Upper GI endoscopy                  | 43235       |     2,787 |     1,714 |      $1,200 |   $370 |  $3,112 |        0.65 |     |
| 51  | Upper GI endoscopy with biopsy      | 43239       |     2,769 |     1,674 |      $1,437 |   $425 |  $3,352 |        0.66 |     |
| 52  | Colonoscopy, diagnostic             | 45378       |     2,719 |     1,570 |      $1,288 |   $463 |  $3,344 |        0.70 |     |
| 53  | Colonoscopy with biopsy             | 45380       |     2,675 |     1,504 |      $1,642 |   $576 |  $3,921 |        0.67 |     |
| 54  | Colonoscopy with polyp removal      | 45385       |     2,572 |     1,411 |      $1,692 |   $629 |  $3,778 |        0.65 |     |
| 57  | Groin hernia repair                 | 49505       |     2,335 |     1,069 |      $2,587 |   $683 |  $9,286 |        0.70 | yes |
| 58  | Prostate biopsy                     | 55700       |     2,493 |     1,623 |      $1,431 |   $370 |  $5,046 |        0.65 | yes |
| 63  | Lower back epidural injection       | 62322/62323 |     2,902 |     2,180 |      $1,054 |   $301 |  $2,776 |        0.65 |     |
| 64  | Lower spine nerve root injection    | 64483       |     2,795 |     2,022 |      $1,351 |   $414 |  $3,577 |        0.65 |     |
| 68  | Left heart catheterization          | 93452       |     2,333 |     1,603 |      $7,124 | $1,993 | $30,873 |        0.60 | yes |
| 69  | Sleep study                         | 95810       |     2,818 |     2,342 |      $3,158 |   $893 | $11,238 |        0.70 |     |
| 70  | Physical therapy exercise           | 97110       |     3,291 |     3,069 |        $104 |    $45 |    $373 |        0.70 |     |

## Tier 2 (20)

| #   | Service                              | Code       | Locations | With cash | Median cash |    p10 |      p90 | Cash / list | SSP |
| --- | ------------------------------------ | ---------- | --------: | --------: | ----------: | -----: | -------: | ----------: | :-: |
| 10  | Office consultation, 40 min          | 99243      |     1,640 |       870 |        $232 |    $75 |     $425 |        0.75 |     |
| 11  | Office consultation, 60 min          | 99244      |     1,636 |       877 |        $304 |    $96 |     $596 |        0.75 |     |
| 12  | Preventive visit, 18-39              | 99385      |     1,766 |       983 |        $196 |    $73 |     $373 |        0.75 |     |
| 13  | Preventive visit, 40-64              | 99386      |     1,751 |       979 |        $225 |    $79 |     $400 |        0.75 |     |
| 16  | Obstetric blood panel                | 80055      |     1,577 |       838 |        $274 |    $68 |   $1,282 |        0.83 |     |
| 41  | Heart valve surgery with cath (stay) | MS-DRG 216 |     1,940 |       343 |    $106,952 |    n/a | $365,576 |        0.70 |     |
| 43  | Hip or knee replacement (stay)       | MS-DRG 470 |     2,323 |       521 |     $24,605 |    n/a |  $75,894 |        0.70 |     |
| 44  | Neck spinal fusion (stay)            | MS-DRG 473 |     2,039 |       383 |     $28,877 |    n/a |  $75,850 |        0.75 |     |
| 45  | Uterine and adnexa surgery (stay)    | MS-DRG 743 |     2,214 |       466 |     $15,128 |    n/a |  $43,135 |        0.70 |     |
| 47  | Shoulder arthroscopy                 | 29826      |     1,915 |       658 |        $690 |   $205 |   $8,229 |        0.70 |     |
| 48  | Knee arthroscopy                     | 29881      |     2,091 |       750 |      $1,945 |   $657 |   $9,293 |        0.70 | yes |
| 49  | Tonsil and adenoid removal, under 12 | 42820      |     1,879 |       582 |      $1,029 |   $421 |   $9,511 |        0.75 | yes |
| 55  | Endoscopic ultrasound, lower bowel   | 45391      |     1,748 |       602 |      $1,270 |   $463 |   $4,280 |        0.75 |     |
| 56  | Gallbladder removal, laparoscopic    | 47562      |     2,263 |       963 |      $2,354 |   $770 |  $13,252 |        0.75 | yes |
| 59  | Prostate removal, laparoscopic       | 55866      |     1,640 |       378 |      $4,908 | $1,515 |  $20,841 |        1.00 | yes |
| 60  | Vaginal delivery with OB care        | 59400      |     1,478 |       412 |      $4,595 | $1,549 |   $8,489 |        0.80 |     |
| 61  | C-section with OB care               | 59510      |     1,460 |       400 |      $5,828 | $1,721 |   $9,380 |        0.90 |     |
| 65  | Cataract follow-up laser             | 66821      |     1,906 |       767 |      $1,188 |   $444 |   $2,129 |        0.65 |     |
| 66  | Cataract removal with lens           | 66984      |     1,895 |       596 |      $2,166 | $1,056 |   $7,269 |        0.65 | yes |
| 67  | EKG                                  | 93000      |     1,562 |       656 |         $51 |    $20 |     $245 |        0.80 |     |

## Tier 3 (2)

| #   | Service              | Code       | Locations | With cash | Median cash |     p10 |      p90 | Cash / list | SSP |
| --- | -------------------- | ---------- | --------: | --------: | ----------: | ------: | -------: | ----------: | :-: |
| 42  | Spinal fusion (stay) | MS-DRG 460 |     1,797 |       166 |     $59,165 | $30,162 | $206,477 |        0.50 |     |
| 62  | VBAC with OB care    | 59610      |     1,338 |       299 |      $6,141 |  $1,622 |   $8,883 |        0.95 |     |

## What this means

- **Imaging, labs, office visits and therapy are well covered.** Every imaging code is at 2,500+ locations with cash. These are the strongest searches to lead with.
- **Outpatient surgery is mid-coverage.** Endoscopy, colonoscopy and injections reach 1,400+ cash locations; arthroscopy, cataract and tonsil surgery sit at 580 to 770. The 9 SSP-defined services are all surgery or catheterization, split between tier 1 and tier 2, which is where the episode estimator matters most.
- **Hospital stays are thin.** About 1 in 5 locations that list a DRG publish a cash price for it (under 1 in 10 for spinal fusion). p10 is shown as n/a for four DRGs because it rounds to $0: some files list a placeholder of a few cents. Stay prices should stay labeled as the uncomplicated-stay price and should never be shown from non-inpatient rows.
- **OB global codes (59400, 59510, 59610) are physician packages.** Hospitals that list them usually publish the doctor's global fee, not the delivery stay, so they are the weakest tier and need the delivery-stay DRGs (807 vaginal, 788 cesarean, both without complications) for a full price.
