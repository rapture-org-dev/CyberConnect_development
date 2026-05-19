-- Adds function sheet status value for UI + function_list_rows.status (public.function_status enum).
-- Run on Supabase SQL editor or psql after reviewing your PG version.

DO $$
BEGIN
  ALTER TYPE public.function_status ADD VALUE 'In review';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
