# GCP Migration: Analysis and Proof-of-Concept Plan

_Status: exploration. Nothing here is deployed, and no GCP resources have been created._

This evaluates moving ClearCost from Vercel + Supabase (Postgres/PostGIS) to Cloud Run + Cloud Storage + BigQuery + Identity Platform, against the four areas in the request. The Dockerfile, `cloudbuild.yaml` and BigQuery DDL in this PR are the proof-of-concept starting point.

## TL;DR

1. **Move compute to Cloud Run: yes.** Low risk, the Dockerfile and `cloudbuild.yaml` here get you there. The app is a stock Next.js 16 server with no Vercel-only features.
2. **Put BigQuery behind the user-facing search: no, not as the primary serving store.** BigQuery is an excellent _warehouse_ for the full 274M-row / 6.4B-payer-row dataset, but it is a poor fit for the hot path. Every query is a job with a few hundred ms of fixed overhead, there is no spatial index, partitioning by state is not directly possible (BigQuery cannot partition on a string), and the app's transactional tables (Knowledge Base, saved searches) need row-level upserts BigQuery is not built for. Sub-400ms p95 for multi-code bundles is not realistic on BigQuery alone, BI Engine included.
3. **Recommended shape: BigQuery as warehouse + ingest, a small Postgres (or precomputed JSON) as the serving layer.** Use BigQuery to compute the serving slice and the "top bundles × metro" price cards, then publish those to Postgres/PostGIS (Supabase or Cloud SQL) and to static JSON in GCS behind Cloud CDN. That same precomputed data powers the programmatic SEO pages and the agent API.
4. **Auth to Identity Platform: feasible, but do it last.** It touches sign-in, sign-up, password reset, OAuth callback, middleware, saved searches and RLS, and needs a user-hash import. It saves little money at your current MAU.
5. **The premise that Postgres storage is the cost problem is weak.** The live database is 5.1 GB (11.7M `charges` rows, measured 2026-10-14), inside the Pro plan's included 8 GB. Extra Supabase disk is $0.125/GB. Even an estimated ~100 GB for the full 274M standard-charges rows would be about $12/month of disk. Compute size (RAM to keep indexes hot) is the real lever, and that is a sizing decision, not a reason to change databases.

## Verified facts (checked 2026-10-14)

| Claim                              | Source says                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BigQuery can partition by state    | No. Only DATE/TIMESTAMP/DATETIME, ingestion time, or INTEGER range ([partitioned tables](https://docs.cloud.google.com/bigquery/docs/partitioned-tables)).                                                                                                                                      |
| Query cache serves different users | Per-user, per-project, exact query text only, ~24h best-effort. Cross-user cache needs Enterprise editions ([cached results](https://docs.cloud.google.com/bigquery/docs/cached-results)).                                                                                                      |
| BigQuery query cost                | $6.25/TiB on-demand, first 1 TiB/month free, 10 MB minimum per table referenced and per query. Batch loads free on the shared pool. Storage first 10 GiB free ([pricing](https://cloud.google.com/bigquery/pricing)).                                                                           |
| BigQuery 200–400 ms                | Google publishes no latency target. Its own short-query example goes from "over 1 second" to 0.5 s with the advanced runtime ([blog](https://cloud.google.com/blog/products/data-analytics/short-query-optimizations-in-bigquery-advanced-runtime)).                                            |
| Cloud Run free tier                | 180K vCPU-seconds, 360K GiB-seconds, 2M requests per month; idle non-minimum instances are free ([pricing](https://cloud.google.com/run/pricing)).                                                                                                                                              |
| Cloud SQL is cheaper than Supabase | Not at this size: a 1 vCPU / 3.75 GiB dedicated instance is about $49/month plus ~$0.17/GiB SSD ([usage.ai, rates checked 2026-09-10](https://www.usage.ai/blogs/gcp/cloud-sql/pricing/)). Supabase Pro is $25 with $10 compute credit and 8 GB disk ([pricing](https://supabase.com/pricing)). |
| Vercel Hobby limits                | Non-commercial, personal use only. Function max duration is 300 s, not 10–15 s ([Hobby plan](https://vercel.com/docs/plans/hobby)).                                                                                                                                                             |
| Cloud Run "managed MCP server"     | A Google-hosted MCP endpoint for operating Cloud Run (deploy, list, get services). Hosting your own MCP server is a separate, self-built service ([host MCP servers](https://docs.cloud.google.com/run/docs/host-mcp-servers)).                                                                 |
| Identity Platform free tier        | 50,000 MAU free for email, phone, anonymous and social providers ([pricing](https://cloud.google.com/identity-platform/pricing)).                                                                                                                                                               |

Not verified: whether Sesame or Zocdoc offer a referral program that pays per booking, which needs a direct conversation with them.

## What the codebase actually looks like today

The plan's numbers differ from the repo in ways that change the design:

| Plan says                 | Repo says                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12,000+ CPT/billing codes | 1,002 curated codes (`lib/data/final-codes.json`). The full Oria dataset has more, but the code list is the deliberate quality gate (`CLAUDE.md`, `docs/prd.md` 4.2.1).                            |
| 5,000+ hospitals          | 5,419 completed hospitals imported, 5,414 geocoded (`docs/data-snapshot.md`).                                                                                                                      |
| 200M+ rows                | 8.45M charges live, 13.97M available for the curated codes, +260M if all codes are added, +6.38B payer-specific rows (`docs/data-snapshot.md`, "Data We're Sitting On").                           |
| 80 GB raw Parquet         | 81 GB local Parquet + an 11 MB DuckDB index in `lib/data/` (`CLAUDE.md`).                                                                                                                          |
| Need an ingestion design  | One already exists: `lib/data/import-trilliant.ts` streams DuckDB → Postgres per state at ~470 rows/s (`docs/import-reference.md`). Throughput is the problem, which BigQuery's `LOAD` does solve. |

So the "unlock the full dataset" goal is really about the +260M all-codes rows and the 6.4B payer rows. Those are warehouse-scale; the 1,002-code serving slice (14M rows) is comfortably Postgres-scale.

### Where Supabase is used

- **Search hot path:** `lib/cpt/lookup.ts` calls the `search_charges_nearby` and `search_charges_by_description` RPCs (`supabase/schema.sql:400-620`), chunking codes and retrying on statement timeouts. Both RPCs do `ST_DWithin` on a GiST index, then join `charges`. A single search also calls `lookup_episode_component_charges` (`lib/cpt/episode.ts`) and reads `medicare_benchmarks` (`lib/cpt/medicare.ts`). That is 2–4 sequential DB round trips per search.
- **Knowledge Base:** `lib/kb/lookup.ts`, `write-back.ts`, `events.ts` do point reads, upserts and inserts on `kb_synonyms`, `kb_nodes`, `kb_events` on every guided-search turn.
- **User data:** `saved_searches` with RLS on `auth.uid() = user_id` (`supabase/schema.sql:219`, `:723`), `payers` list.
- **Auth:** email/password and Google OAuth in `app/auth/signin`, `app/auth/signup`, `app/auth/reset-password`, `app/auth/callback`, `components/AuthButton.tsx`, `components/SaveButton.tsx`, `app/saved/page.tsx`, and token refresh in `middleware.ts` via `lib/supabase/middleware.ts`.

## 1. Data layer: BigQuery + Parquet

### Schema mapping

The draft DDL is in [`infra/gcp/bigquery/schema.sql`](../../infra/gcp/bigquery/schema.sql). It mirrors the Postgres tables with three deliberate changes:

- **One `billing_code` column instead of `cpt` / `hcpcs` / `ms_drg`.** The current RPC checks `c.cpt = any(codes) or c.hcpcs = any(codes)` because hospitals put CPT codes in either column (`docs/import-reference.md`). Clustering only helps on a single column, so the load step normalizes into `billing_code` + `code_type` and keeps the originals for display.
- **Provider attributes denormalized onto each charge row** (name, lat/lng, state, a `GEOGRAPHY` point). BigQuery joins are fine, but each extra table referenced in an on-demand query is billed at a 10 MB minimum, and the hot query should touch one table.
- **`payer_rates` as a separate table, clustered by `billing_code, payer_name`.** At 6.4B rows this is where BigQuery earns its keep.

### "Partition by state, cluster by code"

BigQuery partitions only on a DATE/TIMESTAMP/DATETIME column, ingestion time, or an **integer range**. A `STRING` state column cannot be a partition key. The DDL therefore partitions on `state_fips` (INT64, 1–78) with `RANGE_BUCKET`, and clusters on `billing_code, provider_id`.

Caveats worth knowing before you rely on it:

- **Radius searches cross state lines.** The app searches 25 miles and expands to 75 (`lib/cpt/lookup.ts:582`). A NYC search needs NY, NJ, CT and PA. The query must compute the set of states whose bounding boxes intersect the search circle and filter on all of them, or partition pruning does nothing.
- **Clustering by state alone would be nearly as good.** With ~50 partitions of very uneven size (CA vs WY), clustering on `(state, billing_code)` without partitioning gives similar pruning with less ceremony. The DDL shows partitioning because it was asked for; I would benchmark both.
- **Bytes scanned stays small, but latency does not drop with it.** A pruned query scans single-digit MB, but BigQuery's per-job overhead (planning, slot scheduling, result fetch) is typically hundreds of ms and occasionally seconds at p99. "Megabyte-scale query" and "sub-second" are related but not the same thing.

### BI Engine and the query cache

- **Query cache:** free, but only hits on byte-identical query text and parameters against unchanged tables, for ~24 hours. Every search has a different lat/lng, so the hit rate on raw searches will be near zero. It only helps if you snap location to a grid (ZIP3, geohash-5 or metro) first, which the app-level cache below does better.
- **BI Engine:** an in-memory reservation at $0.0416 per GiB-hour (about $30 per GiB per month). The only no-cost BI Engine capacity comes with BigQuery editions slot commitments (5 GiB per 100 slots); on-demand projects get none. It reduces scan time, not job overhead.
- **Short query optimized mode** (`jobCreationMode = JOB_CREATION_OPTIONAL`) cuts the job overhead for small queries and is worth enabling in the PoC.
- **Honest estimate:** with partition pruning, clustering, BI Engine and short-query mode, a single-code lookup will likely land in the 300–800 ms range with a long tail. A multi-code bundle that today is 2–4 sequential RPCs will be slower unless rewritten as one query. 200–400 ms p95 is not a safe target. Benchmark it in Phase 2 before committing.

## 2. Compute: Cloud Run services and jobs

### Service

[`Dockerfile`](../../Dockerfile) is a three-stage build (deps → build → runtime) on `node:22-bookworm-slim` (matching CI), using Next's `standalone` output so the runtime image carries only the traced server files, not the full `node_modules`. It runs as the non-root `node` user and listens on `$PORT`.

`next.config.ts` gains one line: `output: "standalone"` **only when `NEXT_OUTPUT=standalone`**. Vercel never sets that variable, so Vercel builds are unchanged.

`NEXT_PUBLIC_*` values are inlined at build time, so they are Docker build args, not Cloud Run env vars. Server secrets (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) come from Secret Manager at deploy time.

[`cloudbuild.yaml`](../../cloudbuild.yaml) builds, pushes to Artifact Registry and deploys with `--min-instances=0` (scale to zero), `--concurrency=80`, `--cpu-boost` (faster cold starts) and `--execution-environment=gen2`. Cold starts for a Next.js standalone server are typically 1–3 s; set `min-instances=1` once there is real traffic, which trades a small fixed monthly cost for no cold starts.

**Critical:** [`.dockerignore`](../../.dockerignore) and [`.gcloudignore`](../../.gcloudignore) exclude `lib/data/parquet/`, `*.duckdb` and friends. Without them, `gcloud builds submit` from your laptop would try to upload the 81 GB Parquet lake as build context.

### In-instance cache for the top ~300 bundles

The cache key cannot be just the bundle: results depend on location. Recommended design:

- **Key:** `bundleId | codeType | geoCell`, where `geoCell` is a geohash-5 (~5 km) or ZIP3 of the user's location, plus radius and laterality/body-site filters. Snapping to a cell makes the cache shareable across users near each other.
- **L1, in process:** a bounded LRU (e.g. 2,000 entries, 10–30 min TTL) in a module-level `Map`. Same pattern already used by `lib/rate-limit.ts`. Free and fast, but empty after every cold start and not shared across instances.
- **L2, shared:** precomputed JSON per `(bundle, metro)` written to GCS by the ingest job and served via Cloud CDN, or read by the API on L1 miss. This survives scale-to-zero, costs pennies and is the same artifact the SEO pages use. Memorystore (Redis) works too but has a fixed monthly floor that defeats scale-to-zero.
- **Invalidation:** version the cache key with the dataset `imported_at` / load ID so a new ingest naturally misses.

Note the existing in-memory rate limiter (`lib/rate-limit.ts`) is per instance. That is equally true on Vercel today, but with Cloud Run's 80-way concurrency per instance the effective limit becomes per-instance × instance count. Fine for a PoC; use Cloud Armor rate limiting if abuse matters.

### Ingest job

A Cloud Run Job (`infra/gcp/ingest/README.md` outlines it) that:

1. Copies new Oria Parquet drops into `gs://<bucket>/raw/<load_id>/` (`gcloud storage rsync`).
2. Runs `bq load --source_format=PARQUET` into a staging table, then a SQL transform into `charges_<load_id>` (code normalization, state FIPS, geography, dedup as in `scripts/`).
3. Validates row counts per state against the previous load (same idea as `generate-snapshot.ts`), fails the job on a large regression.
4. Atomically swaps a view (`charges_current`) to the new table, so the live app never sees a half-loaded table.
5. Exports the serving slice and the top-bundle price cards (to Postgres and/or GCS JSON).

`bq load` from GCS is free (no slot charge on the shared pool) and should take minutes to an hour for the full 81 GB, compared with days at 470 rows/s through the current pooler path. This is the single biggest real win in the plan.

## 3. Auth: Supabase Auth → Identity Platform

Identity Platform's free tier covers 50,000 MAU for email/password and social providers (then $0.0055/MAU from 50K to 100K; SMS is billed per message). The plan:

1. **Client:** Firebase JS SDK (`firebase/auth`) with `signInWithPopup(GoogleAuthProvider)`, `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `sendPasswordResetEmail`. Replaces the Supabase calls in the five auth files listed above.
2. **Session:** after sign-in, POST the ID token to a new `/api/session` route that calls `createSessionCookie` (Admin SDK) and sets an HttpOnly cookie. This keeps server components and API routes cookie-based, like today, instead of passing bearer tokens around.
3. **Server verification:** the snippet in [`infra/gcp/auth/README.md`](../../infra/gcp/auth/README.md) uses `jose` to verify Firebase ID tokens against Google's public JWKS (issuer, audience, expiry, `auth_time`). It runs in the Edge-compatible middleware runtime, unlike `firebase-admin`. Kept as a Markdown snippet so it is not type-checked or wired into the app.
4. **User migration:** export `auth.users` from Supabase and import with `firebase auth:import` using `--hash-algo=BCRYPT` (Supabase stores bcrypt hashes), so passwords keep working. Google users relink by email on first sign-in.
5. **Data:** `saved_searches.user_id` is a `uuid` referencing `auth.users`. Firebase UIDs are 28-char strings, so the column becomes `text`, keyed to a mapping table during the cutover. RLS (`auth.uid() = user_id`) disappears; ownership must be enforced in `app/api/saved/route.ts` from the verified token.

## 4. AI agents, OpenAPI, MCP and SEO

The precomputed price cards from the ingest job are the natural shared source for all three.

- **Agent API:** a draft [`openapi.yaml`](../../infra/gcp/agent-api/openapi.yaml) defines `GET /v1/procedures/{code}/prices?lat&lng&radius` and `GET /v1/bundles/{bundleId}/prices`, returning schema-stable JSON. Every price row carries `bookingUrl`, a ClearCost redirect (`/go/{token}`) rather than a raw partner URL. The redirect logs the click and appends partner attribution server side, so tracking parameters can be changed without breaking agents that cached old responses.
- **MCP server:** a thin Streamable-HTTP MCP endpoint on the same Cloud Run service exposing two read-only tools (`search_procedure_prices`, `get_bundle_price`) that call the same handlers as the REST API. Require an API key per agent integration, rate-limit by key, and return the same tracked `bookingUrl`.
- **Programmatic SEO pages:** statically generate `/{procedure-slug}/{metro-slug}` pages from the price cards using Next.js ISR (`generateStaticParams` + `revalidate`), with JSON-LD `MedicalProcedure` + `Offer`/`PriceSpecification`. Start with top bundles × top 100 metros (~30K pages), not every code × every ZIP; thin or duplicate pages get deindexed.

**The affiliate premise needs checking before any of this is built.** ClearCost's prices are hospital chargemaster and cash prices. Sesame lists independent clinicians at Sesame's own prices, and Zocdoc books doctor appointments, mostly without published prices. Neither maps onto "this hospital's $450 MRI". Before designing tracked links you need (a) partner agreements that actually pay per referral (`docs/gtm-strategy.md` 10.4 already plans the Zocdoc conversation for after 20K MAU), and (b) a provider-matching layer from hospital NPI to partner listings. Without both, the `bookingUrl` should point at the hospital's own scheduling page.

## Recommended migration phases

| Phase | What                                                                                                                                               | Exit criterion                                                                    | Risk   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| 0     | Cloud Run PoC: deploy this Dockerfile to a staging service, still pointing at Supabase.                                                            | Staging URL serves search end to end; cold start and p95 measured.                | Low    |
| 1     | Cut traffic from Vercel to Cloud Run (domain, Cloud Armor, Secret Manager, log-based alerts).                                                      | One week at parity on errors and latency.                                         | Low    |
| 2     | BigQuery warehouse: load all Parquet to GCS + BigQuery, build the ingest job, run the latency benchmark for the hot query in BigQuery vs PostGIS.  | Benchmark numbers in hand; decide serving store with data, not assumptions.       | Medium |
| 3     | Serving layer: ingest job exports the serving slice to Postgres and price cards to GCS; add the L1/L2 cache.                                       | Import time drops from days to under an hour; cache hit rate on top bundles >60%. | Medium |
| 4     | Agent API + MCP + programmatic SEO pages off the price cards.                                                                                      | Pages indexed; agent calls attributed.                                            | Medium |
| 5     | Identity Platform (optional): only if leaving Supabase entirely is still a goal after Phase 3. Includes moving KB and saved searches to Cloud SQL. | All users migrated with no forced password reset.                                 | High   |

## Hidden risks: PostGIS/Postgres → BigQuery

1. **No spatial index.** `ST_DWithin` on a GiST index prunes to nearby providers in milliseconds. BigQuery has `ST_DWITHIN` and can cluster on `GEOGRAPHY`, but it evaluates candidates by scanning. Workable at 14M rows, expensive at 274M without good pruning.
2. **State partitions do not match search circles.** Cross-border metros (NYC, DC, Philadelphia, Kansas City, Chicago/Gary, Portland/Vancouver) need multi-state filters, which the app must compute correctly or silently drop results.
3. **Per-query latency floor.** Hundreds of ms per job, and the current flow issues 2–4 queries per search. Must be collapsed into one query or served from precomputed data.
4. **OLTP tables don't belong in BigQuery.** KB upserts on every guided-search turn, `kb_events` inserts, saved searches. BigQuery DML has concurrency limits, the streaming buffer delays `UPDATE`/`DELETE`, and there are no unique constraints or transactions in the usual sense. These need Postgres (Cloud SQL) or Firestore regardless.
5. **No foreign keys, no uniqueness.** Dedup logic that relies on Postgres constraints (`scripts/` dedup work, `uq_episode_component`) has to be enforced in the ingest SQL.
6. **Full-text fallback changes behavior.** `search_charges_by_description` ranks with `ts_rank` and English stemming. BigQuery's `SEARCH()` with a search index finds tokens but has no relevance ranking or stemming, so fallback quality will drop.
7. **`NUMERIC` and `NULL` semantics.** Prices are `numeric(12,2)` today. Use `NUMERIC` in BigQuery (not `FLOAT64`) or cent-rounding errors leak into totals. `NULLS LAST` ordering must be explicit.
8. **Cost model flips from fixed to per-query.** Supabase is a flat bill. BigQuery on-demand is about $6.25/TiB scanned with a 10 MB per-table minimum. Cheap per query, but a bot or an agent hammering the API is now a variable cost. Set project-level custom quotas on bytes billed per day, and put `maximumBytesBilled` on every query.
9. **Server-side RPC logic moves into the app.** Laterality/body-site parsing, the `parse_laterality` SQL mirror and the episode join live in SQL today. Moving them means two implementations to keep in sync, or a rewrite in BigQuery SQL UDFs.
10. **Supabase-specific behavior disappears.** RLS, `auth.uid()`, PostgREST, and the anon key model. Every protected read needs an explicit server-side ownership check.
11. **Build context size.** Covered above: without the ignore files, Cloud Build uploads 81 GB.

## Running the PoC

Assumes a GCP project with billing, and Artifact Registry, Cloud Run, Cloud Build and Secret Manager APIs enabled. Nothing here has been run.

```bash
gcloud artifacts repositories create clearcost --repository-format=docker --location=us-central1
printf '%s' "$ANTHROPIC_API_KEY" | gcloud secrets create anthropic-api-key --data-file=-
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create supabase-service-role-key --data-file=-

gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_NEXT_PUBLIC_SUPABASE_URL=...,_NEXT_PUBLIC_SUPABASE_ANON_KEY=...,_NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

The Cloud Build service account needs `roles/run.admin`, `roles/iam.serviceAccountUser` and `roles/artifactregistry.writer`; the Cloud Run runtime service account needs `roles/secretmanager.secretAccessor`. Add the Cloud Run URL to the Supabase Auth redirect allowlist so Google sign-in works on staging.
