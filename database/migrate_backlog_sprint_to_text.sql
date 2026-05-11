-- Backlog sheet: `sprint` was `public.sprint_slot` (enum, often only "Backlog") while the app
-- treats Sprint as free text (same as Tasks). Arbitrary values failed with invalid enum input.
--
-- Run once in Supabase SQL Editor on the project database.

ALTER TABLE public.backlog_rows
  ALTER COLUMN sprint DROP DEFAULT;

ALTER TABLE public.backlog_rows
  ALTER COLUMN sprint TYPE text
  USING (COALESCE(sprint::text, ''));

ALTER TABLE public.backlog_rows
  ALTER COLUMN sprint SET DEFAULT ''::text,
  ALTER COLUMN sprint SET NOT NULL;
