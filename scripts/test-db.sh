#!/usr/bin/env bash
# Tests the Supabase migration, seed, grading and RLS against a plain Postgres.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/db npm run db:test
# The database should be empty: everything is loaded fresh.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?Set DATABASE_URL to an empty Postgres database}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

edition="$(ls data/edition-*.json | sort | tail -1)"
npx tsx scripts/db-expectations.ts "$edition" "$tmp"

psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql

psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
create schema test;
grant usage on schema test to anon, authenticated;
create table test.expected_story (slug text, sources int, score int, grade text, importance numeric);
create table test.expected_grid (c int, p int, st int, n int, score int, grade text);
\copy test.expected_story from '$tmp/expected_story.csv' csv
\copy test.expected_grid from '$tmp/expected_grid.csv' csv
grant select on all tables in schema test to anon, authenticated;
SQL

psql "$DATABASE_URL" -q -t -v ON_ERROR_STOP=1 -f supabase/tests/10_schema.sql 2>&1 | sed -n -e "s/.*NOTICE:  //p" -e "/ERROR/p"
echo "Database tests passed."
