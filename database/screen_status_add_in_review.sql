-- =============================================================================
-- Screens sheet: allow Status = "In review"
-- =============================================================================
-- Without this, saves fail with:
--   invalid input value for enum screen_status: "In review"
-- Functions use a separate enum — run database/function_status_add_in_review.sql for those.
--
-- Run once in Supabase SQL Editor (same database as your app).
-- =============================================================================

DO $$
BEGIN
  ALTER TYPE public.screen_status ADD VALUE 'In review';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Postgres 15+ only: you can use instead (idempotent, no DO block):
-- ALTER TYPE public.screen_status ADD VALUE IF NOT EXISTS 'In review';
