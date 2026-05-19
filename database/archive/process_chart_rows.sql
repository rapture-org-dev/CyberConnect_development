create table public.process_chart_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  code text not null default ''::text,
  category text not null default ''::text,
  category_ja text not null default ''::text,
  task text not null default ''::text,
  task_ja text not null default ''::text,
  sprint text not null default ''::text,
  person_days numeric(6, 1) null,
  status public.process_status null default 'Planned'::process_status,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  sprint_ja text not null default ''::text,
  extras jsonb not null default '{}'::jsonb,
  constraint process_chart_rows_pkey primary key (id),
  constraint process_chart_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_process_chart_project on public.process_chart_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create trigger trg_process_chart_updated_at BEFORE
update on process_chart_rows for EACH row
execute FUNCTION set_updated_at ();

create trigger trg_rbac_general_process_chart_rows BEFORE INSERT
or DELETE
or
update on process_chart_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();