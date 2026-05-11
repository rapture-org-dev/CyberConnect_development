-- Adds screen sheet status value for UI + screen_list_rows.status (public.screen_status enum).
-- Run on Supabase SQL editor or psql after reviewing your PG version.

DO $$
BEGIN
  ALTER TYPE public.screen_status ADD VALUE 'In review';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
