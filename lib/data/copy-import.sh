#!/bin/bash
#
# Bulk load charge CSVs into Supabase using parallel psql \COPY.
#
# Prerequisites:
#   1. Run export-csv.ts first to generate per-state CSVs
#   2. psql installed (brew install libpq)
#   3. .env.local has SUPABASE_DB_URL
#
# Usage:
#   bash lib/data/copy-import.sh [--parallel N] [--fresh]
#
# Options:
#   --parallel N   Number of concurrent COPY streams (default: 4)
#   --fresh        TRUNCATE charges and drop/recreate indexes

set -euo pipefail

PSQL="/opt/homebrew/opt/libpq/bin/psql"
CSV_DIR="/tmp/clearcost-csv"
PARALLEL=4
FRESH=false

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --parallel) PARALLEL="$2"; shift 2 ;;
    --fresh) FRESH=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Load connection string from .env.local
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONN=$(grep "^SUPABASE_DB_URL=" "$PROJECT_DIR/.env.local" | cut -d= -f2-)

if [[ -z "$CONN" ]]; then
  echo "ERROR: SUPABASE_DB_URL not found in $PROJECT_DIR/.env.local"
  exit 1
fi

# Verify psql
if [[ ! -x "$PSQL" ]]; then
  echo "ERROR: psql not found at $PSQL"
  echo "Install with: brew install libpq"
  exit 1
fi

# Verify CSV directory
if [[ ! -d "$CSV_DIR" ]] || [[ -z "$(ls "$CSV_DIR"/*.csv 2>/dev/null)" ]]; then
  echo "ERROR: No CSV files found in $CSV_DIR"
  echo "Run export-csv.ts first:"
  echo "  npx tsx lib/data/export-csv.ts"
  exit 1
fi

# Count files and total size
CSV_COUNT=$(ls "$CSV_DIR"/*.csv | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$CSV_DIR" | cut -f1)
echo "=== ClearCost COPY Import ==="
echo ""
echo "  CSV directory: $CSV_DIR"
echo "  Files: $CSV_COUNT"
echo "  Total size: $TOTAL_SIZE"
echo "  Parallel streams: $PARALLEL"
echo "  Fresh import: $FRESH"
echo ""

# Test connection
echo "  Testing connection..."
$PSQL "$CONN" -c "SELECT 1;" > /dev/null 2>&1
echo "  Connected to Supabase"

# Charges table columns (must match CSV header order from export-csv.ts)
COLUMNS="provider_id,description,setting,billing_class,cpt,hcpcs,ms_drg,revenue_code,ndc,icd,modifiers,gross_charge,cash_price,min_price,max_price,avg_negotiated_rate,min_negotiated_rate,max_negotiated_rate,payer_count,source"

# Index definitions
INDEXES=(
  "CREATE INDEX idx_charges_cpt ON charges (cpt)"
  "CREATE INDEX idx_charges_hcpcs ON charges (hcpcs)"
  "CREATE INDEX idx_charges_ms_drg ON charges (ms_drg)"
  "CREATE INDEX idx_charges_provider ON charges (provider_id)"
  "CREATE INDEX idx_charges_cpt_provider ON charges (cpt, provider_id)"
  "CREATE INDEX idx_charges_description ON charges USING gin (to_tsvector('english', coalesce(description, '')))"
)

if $FRESH; then
  echo ""
  echo "=== Preparing for fresh import ==="
  echo ""

  # Drop indexes
  echo "  Dropping indexes..."
  for idx in idx_charges_cpt idx_charges_hcpcs idx_charges_ms_drg idx_charges_provider idx_charges_cpt_provider idx_charges_description; do
    $PSQL "$CONN" -c "DROP INDEX IF EXISTS $idx;" 2>/dev/null && echo "    Dropped $idx"
  done

  # Truncate
  echo "  Truncating charges table..."
  $PSQL "$CONN" -c "TRUNCATE charges CASCADE;"
  echo "  Truncated"
fi

# --- Parallel COPY ---
echo ""
echo "=== Loading CSV files (${PARALLEL} parallel streams) ==="
echo ""
START_TIME=$(date +%s)

# Track results
RESULTS_DIR=$(mktemp -d)
ACTIVE=0
LOADED=0
FAILED=0

copy_one_file() {
  local csv_file="$1"
  local state=$(basename "$csv_file" .csv)
  local result_file="$RESULTS_DIR/$state"
  local start=$(date +%s)

  # Each session: disable synchronous_commit for speed, no statement timeout
  # Must use heredoc (not -c) because \COPY is a psql meta-command, not SQL
  if $PSQL "$CONN" > "$result_file.log" 2>&1 <<PSQLEOF
SET synchronous_commit = 'off';
SET statement_timeout = 0;
\COPY charges ($COLUMNS) FROM '$csv_file' WITH (FORMAT csv, HEADER true)
PSQLEOF
  then
    local end=$(date +%s)
    local elapsed=$((end - start))
    local rows=$(grep -o 'COPY [0-9]*' "$result_file.log" | grep -o '[0-9]*')
    echo "  $state: ${rows:-?} rows (${elapsed}s)" | tee "$result_file.ok"
  else
    local end=$(date +%s)
    local elapsed=$((end - start))
    echo "  $state: FAILED (${elapsed}s) — $(cat "$result_file.log")" | tee "$result_file.fail"
  fi
}

# Process files with N parallel workers
for csv_file in "$CSV_DIR"/*.csv; do
  # Wait if at max parallel
  while [[ $(jobs -rp | wc -l) -ge $PARALLEL ]]; do
    wait -n 2>/dev/null || true
  done

  copy_one_file "$csv_file" &
done

# Wait for all remaining
wait

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

# Tally results
LOADED=$(ls "$RESULTS_DIR"/*.ok 2>/dev/null | wc -l | tr -d ' ')
FAILED=$(ls "$RESULTS_DIR"/*.fail 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "=== COPY Complete ==="
echo "  States loaded: $LOADED"
echo "  States failed: $FAILED"
echo "  Time: ${ELAPSED}s ($(( ELAPSED / 60 ))m $(( ELAPSED % 60 ))s)"

# Show any failures
if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "  FAILED states:"
  for f in "$RESULTS_DIR"/*.fail; do
    cat "$f"
  done
fi

if $FRESH; then
  echo ""
  echo "=== Recreating indexes ==="
  echo ""
  for idx_sql in "${INDEXES[@]}"; do
    idx_name=$(echo "$idx_sql" | grep -o 'idx_[a-z_]*')
    echo "  Creating $idx_name..."
    IDX_START=$(date +%s)
    $PSQL "$CONN" -c "SET maintenance_work_mem = '512MB'; SET statement_timeout = 0; $idx_sql;" 2>&1
    IDX_END=$(date +%s)
    echo "    Done ($(( IDX_END - IDX_START ))s)"
  done

  echo ""
  echo "  Running ANALYZE..."
  $PSQL "$CONN" -c "SET statement_timeout = 0; ANALYZE charges;"
  echo "  Done"
fi

# Verification
echo ""
echo "=== Verification ==="
$PSQL "$CONN" -c "
  SELECT COUNT(*) as total_charges FROM charges;
"
$PSQL "$CONN" -c "
  SELECT p.state, COUNT(*) as cnt
  FROM charges c JOIN providers p ON c.provider_id = p.id
  GROUP BY p.state ORDER BY p.state;
"

echo ""
echo "=== Import Complete ==="

# Cleanup
rm -rf "$RESULTS_DIR"
