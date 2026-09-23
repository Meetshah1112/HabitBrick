#!/usr/bin/env bash
# Validate the migrations against a throwaway Postgres 16 container.
# Requires Docker Desktop to be running. Touches nothing outside the container.
set -uo pipefail

CONTAINER=hb-sqltest
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

cleanup
echo "Starting Postgres 16..."
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test postgres:16 >/dev/null

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

if ! docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
  echo "Postgres did not become ready in time." >&2
  exit 1
fi

run_sql() {
  local label="$1" file="$2"
  echo ""
  echo "--- $label ---"
  if docker exec -i "$CONTAINER" \
      psql -U postgres -v ON_ERROR_STOP=1 -q < "$file"; then
    echo "OK: $label"
  else
    echo "FAILED: $label" >&2
    return 1
  fi
}

run_sql "auth stub (local only)" "$HERE/_local_test_stub.sql" || exit 1
run_sql "0001_schema.sql"        "$HERE/migrations/0001_schema.sql" || exit 1
run_sql "0002_rls.sql"           "$HERE/migrations/0002_rls.sql" || exit 1
run_sql "0003_functions.sql"     "$HERE/migrations/0003_functions.sql" || exit 1

echo ""
echo "=== RLS coverage ==="
docker exec -i "$CONTAINER" psql -U postgres -q <<'EOF'
select tablename,
       rowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename) as policies
  from pg_tables t
 where schemaname = 'public'
 order by tablename;
EOF

echo ""
echo "All migrations applied cleanly."
