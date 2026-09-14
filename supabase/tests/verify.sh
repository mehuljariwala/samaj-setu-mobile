#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Compile and exercise the migrations against a throwaway local PostgreSQL
# database, using tests/00_shim.sql to stand in for the parts of Supabase that
# a plain server does not provide.
#
# This is not a substitute for `supabase start` — it cannot test GoTrue, the
# Storage API, or PostgREST. What it does prove is that every migration applies
# cleanly in order, that every function and policy compiles, and that the RLS
# and state-machine assertions in tests/*.sql hold.
#
#   ./supabase/tests/verify.sh            # rebuild and run everything
#   DB=other_name ./supabase/tests/verify.sh
# ---------------------------------------------------------------------------
set -euo pipefail

DB="${DB:-samaj_setu_verify}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

echo "==> recreating database $DB"
psql -d postgres -qc "drop database if exists $DB (force)"
psql -d postgres -qc "create database $DB"

run() {
  echo "==> $1"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$2"
}

run "shim (local Supabase stand-in)" "$HERE/00_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  run "migration $(basename "$f")" "$f"
done

run "seed" "$ROOT/supabase/seed.sql"

for f in "$HERE"/[0-9][0-9]_*.sql; do
  case "$(basename "$f")" in
    00_shim.sql) continue ;;
  esac
  run "test $(basename "$f")" "$f"
done

echo
echo "PASS — all migrations applied and all assertions held."
