# Ingest job (Cloud Run Job) — outline

Periodic (monthly/quarterly) reload of the Oria Parquet drop into BigQuery, without touching the live service. Draft only; see `docs/gcp-migration/README.md` section 2.

## Shape

A container image with `gcloud`, `bq` and Node, run as a Cloud Run **Job** (not a Service), triggered by Cloud Scheduler or by hand:

```bash
gcloud run jobs create clearcost-ingest \
  --image=us-central1-docker.pkg.dev/$PROJECT/clearcost/ingest:latest \
  --region=us-central1 --task-timeout=6h --max-retries=1 \
  --cpu=2 --memory=4Gi \
  --set-env-vars=BQ_DATASET=clearcost_poc,RAW_BUCKET=gs://<bucket>

gcloud scheduler jobs create http clearcost-ingest-monthly \
  --schedule="0 6 1 * *" --location=us-central1 \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT/locations/us-central1/jobs/clearcost-ingest:run" \
  --http-method=POST --oauth-service-account-email=<scheduler-sa>
```

The job's service account needs BigQuery Data Editor + Job User on the dataset and Storage Object Admin on the bucket. It never needs the web service's secrets.

## Steps (`ingest.sh`)

```bash
set -euo pipefail
LOAD_ID="$(date -u +%Y%m%d%H%M)"

# 1. Land raw Parquet (source: Oria download, or an upload from a workstation)
gcloud storage rsync --recursive "$SOURCE_URI" "$RAW_BUCKET/raw/$LOAD_ID/"

# 2. Load into staging (free on the shared slot pool)
bq load --source_format=PARQUET --replace \
  "$BQ_DATASET.raw_standard_charges" "$RAW_BUCKET/raw/$LOAD_ID/standard_charges/*.parquet"
bq load --source_format=PARQUET --replace \
  "$BQ_DATASET.raw_hospitals" "$RAW_BUCKET/raw/$LOAD_ID/hospitals/*.parquet"

# 3. Transform into charges with load_id (section 5 of bigquery/schema.sql)
bq query --use_legacy_sql=false --parameter="load_id::$LOAD_ID" < transform.sql

# 4. Validate: per-state counts vs the current load; fail on a >10% drop
bq query --use_legacy_sql=false --format=json --parameter="load_id::$LOAD_ID" < validate.sql \
  | node validate.mjs   # exits non-zero on regression

# 5. Cut over atomically
bq query --use_legacy_sql=false \
  "create or replace view $BQ_DATASET.charges_current as select * from $BQ_DATASET.charges where load_id = '$LOAD_ID'"

# 6. Publish serving artifacts: price cards to GCS (+ optional Postgres export)
bq query --use_legacy_sql=false --parameter="load_id::$LOAD_ID" < price_cards.sql

# 7. Drop loads older than the previous one (keeps one rollback)
```

## Why this doesn't affect the live app

- The app only reads `charges_current` (a view) and the published price cards, both swapped in one statement at the end.
- A failed or partial load leaves the view pointing at the previous `load_id`.
- Rollback is re-pointing the view at the previous `load_id`.
- Cache keys include `load_id`, so the in-process LRU and GCS price cards miss naturally after a cutover.
