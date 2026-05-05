-- Adds task status value for UI + task_rows.status (public.task_status enum).
-- Run on Supabase SQL editor or psql after reviewing your PG version.
-- PostgreSQL 15+: you can use ADD VALUE IF NOT EXISTS instead of the DO block.

DO $$
BEGIN
  ALTER TYPE public.task_status ADD VALUE 'In review';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
