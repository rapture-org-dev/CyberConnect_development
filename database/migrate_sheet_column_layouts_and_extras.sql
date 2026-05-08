-- Per-project sheet column layouts + row-level JSON extras for custom fields.
-- Run on Supabase / Postgres. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.project_sheet_column_layouts (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  tab_id text NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_sheet_column_layouts_pkey PRIMARY KEY (project_id, tab_id)
);

CREATE INDEX IF NOT EXISTS idx_project_sheet_column_layouts_project
  ON public.project_sheet_column_layouts (project_id);

-- Custom field storage (flat keys merged client-side into each row)
ALTER TABLE public.purpose_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.tech_stack_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.non_func_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.screen_list_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.function_list_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.task_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.test_case_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.api_list_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.backlog_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.process_chart_rows ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
