create table public.task_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  task_code text not null default ''::text,
  phase text null,
  sprint text not null default ''::text,
  epic text not null default ''::text,
  epic_ja text not null default ''::text,
  screen_code text not null default ''::text,
  function_code text not null default ''::text,
  task text not null default ''::text,
  task_ja text not null default ''::text,
  person_day numeric(6, 1) null,
  assignee_id uuid null,
  status text null default 'Not started'::task_status,
  deadline date null,
  completed_date date null,
  completion_pm public.pm_check null default ''::pm_check,
  remark text not null default ''::text,
  remark_ja text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  medium_item text not null default ''::text,
  medium_item_ja text not null default ''::text,
  phase_ja text not null default ''::text,
  sprint_ja text not null default ''::text,
  screen_name text not null default ''::text,
  screen_name_ja text not null default ''::text,
  function_name text not null default ''::text,
  function_name_ja text not null default ''::text,
  extras jsonb not null default '{}'::jsonb,
  constraint task_rows_pkey primary key (id),
  constraint task_rows_assignee_id_fkey foreign KEY (assignee_id) references profiles (id) on delete set null,
  constraint task_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_task_rows_project on public.task_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create index IF not exists idx_task_screen_code on public.task_rows using btree (project_id, screen_code) TABLESPACE pg_default;

create index IF not exists idx_task_function_code on public.task_rows using btree (project_id, function_code) TABLESPACE pg_default;

create unique INDEX IF not exists idx_task_code_project on public.task_rows using btree (project_id, task_code) TABLESPACE pg_default
where
  (task_code <> ''::text);

create trigger trg_rbac_task_rows BEFORE INSERT
or DELETE
or
update on task_rows for EACH row
execute FUNCTION enforce_task_row_rbac ();

create trigger trg_task_rows_updated_at BEFORE
update on task_rows for EACH row
execute FUNCTION set_updated_at ();