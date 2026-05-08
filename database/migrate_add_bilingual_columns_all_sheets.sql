-- Migration: add missing EN/JP companion text columns so JP and EN CSV merge-by-code can
-- populate every human-readable field without overwriting the other locale.
--
-- Run against your Supabase / Postgres project (SQL editor or `psql`).
-- Safe to re-run: uses IF NOT EXISTS.
--
-- Tables purpose_rows, tech_stack_rows, non_func_rows, screen_list_rows (except path),
-- function_list_rows (except phase label + effort), test_case_rows (except test_type),
-- backlog_rows, app_list_rows, and most of task_rows already had *_ja pairs.
-- This migration fills the remaining gaps.

-- ── Tasks: JP docs often use 大項目/中項目/画面名/機能名/スプリント alongside EN merge keys ──
ALTER TABLE public.task_rows
  ADD COLUMN IF NOT EXISTS medium_item text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS medium_item_ja text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS phase_ja text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS sprint_ja text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS screen_name text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS screen_name_ja text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS function_name text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS function_name_ja text NOT NULL DEFAULT ''::text;

COMMENT ON COLUMN public.task_rows.medium_item IS 'Medium category (EN); pairs with medium_item_ja';
COMMENT ON COLUMN public.task_rows.medium_item_ja IS 'Medium category (JA)';
COMMENT ON COLUMN public.task_rows.phase_ja IS 'Phase label as shown in JP sources (canonical phase enum stays in phase)';
COMMENT ON COLUMN public.task_rows.sprint_ja IS 'Sprint label as shown in JP sources';
COMMENT ON COLUMN public.task_rows.screen_name IS 'Denormalized screen title (EN)';
COMMENT ON COLUMN public.task_rows.screen_name_ja IS 'Denormalized screen title (JA)';
COMMENT ON COLUMN public.task_rows.function_name IS 'Denormalized function title (EN)';
COMMENT ON COLUMN public.task_rows.function_name_ja IS 'Denormalized function title (JA)';

-- ── Screens: path JP companion ──
ALTER TABLE public.screen_list_rows
  ADD COLUMN IF NOT EXISTS path_ja text NOT NULL DEFAULT ''::text;

COMMENT ON COLUMN public.screen_list_rows.path_ja IS 'URL/path label (JA)';

-- ── Functions: JP phase wording + effort wording (enum phase stays in phase) ──
ALTER TABLE public.function_list_rows
  ADD COLUMN IF NOT EXISTS phase_ja text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS effort_ja text NOT NULL DEFAULT ''::text;

COMMENT ON COLUMN public.function_list_rows.phase_ja IS 'Phase label as shown in JP sources';
COMMENT ON COLUMN public.function_list_rows.effort_ja IS 'Effort / estimate text (JA)';

-- ── Test cases: test type JP ──
ALTER TABLE public.test_case_rows
  ADD COLUMN IF NOT EXISTS test_type_ja text NOT NULL DEFAULT ''::text;

COMMENT ON COLUMN public.test_case_rows.test_type_ja IS 'Test type label (JA)';

-- ── Process chart: sprint JP (sprint remains primary EN/slug column) ──
ALTER TABLE public.process_chart_rows
  ADD COLUMN IF NOT EXISTS sprint_ja text NOT NULL DEFAULT ''::text;

COMMENT ON COLUMN public.process_chart_rows.sprint_ja IS 'Sprint label (JA)';
