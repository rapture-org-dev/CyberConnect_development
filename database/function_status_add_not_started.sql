-- =============================================================================
-- Functions sheet: allow Status = "Not started"
-- =============================================================================
-- Without this, saves fail with:
--   invalid input value for enum function_status: "Not started"
--
-- Older Supabase projects often created `function_status` with only
-- "Need to be checked", "In progress", "Completed" (and later "In review").
-- Fresh clones from cyberconnect_schema.sql already include "Not started".
--
-- Run once in Supabase SQL Editor (postgres role), same database as the app.
-- =============================================================================

DO $$
BEGIN
  ALTER TYPE public.function_status ADD VALUE 'Not started';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Postgres 15+ (optional):
-- ALTER TYPE public.function_status ADD VALUE IF NOT EXISTS 'Not started';
