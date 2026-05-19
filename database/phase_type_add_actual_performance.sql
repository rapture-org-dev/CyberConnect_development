-- Run in Supabase SQL editor (or psql) once.
-- Spreadsheets often use "The actual performance" for phase; the app enum must allow it.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'phase_type'
      AND e.enumlabel = 'actual_performance'
  ) THEN
    ALTER TYPE public.phase_type ADD VALUE 'actual_performance';
  END IF;
END
$migration$;
  