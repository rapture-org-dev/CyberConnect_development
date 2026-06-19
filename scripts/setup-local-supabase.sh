#!/usr/bin/env bash
# Idempotent local Supabase bring-up for CyberConnect development.
#
# Prerequisites: Docker running and the Supabase CLI available (via `npx supabase`).
# This script:
#   1. Starts the local Supabase stack (if not already running).
#   2. Applies the database schema.
#   3. Aligns enum labels that the production RLS export expects but the
#      bundled schema omits (documented in database/README.md).
#   4. Applies the RLS policies.
#   5. Writes .env.local pointing the app at the local stack (if missing).
#
# Safe to re-run. See AGENTS.md "Cursor Cloud specific instructions".
set -euo pipefail

cd "$(dirname "$0")/.."

DB_CONTAINER="supabase_db_workspace"

echo "==> Ensuring local Supabase stack is up"
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  npx supabase start
fi

psql_db() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres "$@"
}

# The bundled schema is a one-shot fresh-install script (some CREATE TABLE
# statements lack IF NOT EXISTS), so only apply it when the DB is empty.
SCHEMA_APPLIED="$(psql_db -tAc "SELECT to_regclass('public.profiles') IS NOT NULL;")"
if [ "$SCHEMA_APPLIED" = "t" ]; then
  echo "==> Schema already present, skipping schema apply"
else
  echo "==> Applying schema (database/cyberconnect_schema.sql)"
  psql_db -v ON_ERROR_STOP=1 < database/cyberconnect_schema.sql > /dev/null
fi

echo "==> Aligning enum labels expected by production RLS export"
psql_db -v ON_ERROR_STOP=1 <<'SQL' > /dev/null
ALTER TYPE public.user_role  ADD VALUE IF NOT EXISTS 'administrator';
ALTER TYPE public.user_role  ADD VALUE IF NOT EXISTS 'developer';
ALTER TYPE public.team_roles ADD VALUE IF NOT EXISTS 'pm';
SQL

echo "==> Granting Data API role privileges (RLS still enforces row security)"
# Newer Supabase CLI does not auto-expose public tables to the anon/authenticated
# Data API roles; the production schema relied on the legacy auto-grant behavior.
psql_db -v ON_ERROR_STOP=1 <<'SQL' > /dev/null
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
SQL

echo "==> Applying RLS policies (database/cyberconnect_rls.sql)"
psql_db -v ON_ERROR_STOP=1 < database/cyberconnect_rls.sql > /dev/null

echo "==> Reloading PostgREST schema cache"
psql_db -c "NOTIFY pgrst, 'reload schema';" > /dev/null

if [ ! -f .env.local ]; then
  echo "==> Writing .env.local"
  ANON_KEY="$(npx supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
  cat > .env.local <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
DEEPL_AUTO_TRANSLATE=false
ENV
fi

POLICIES="$(psql_db -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public';")"
echo "==> Done. ${POLICIES} RLS policies active. Run 'npm run dev' to start the app."
