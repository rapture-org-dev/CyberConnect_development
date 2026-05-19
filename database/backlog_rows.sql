create table public.backlog_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  epic text not null default ''::text,
  epic_ja text not null default ''::text,
  story text not null default ''::text,
  story_ja text not null default ''::text,
  task text not null default ''::text,
  task_ja text not null default ''::text,
  owner_id uuid null,
  sprint text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  extras jsonb not null default '{}'::jsonb,
  constraint backlog_rows_pkey primary key (id),
  constraint backlog_rows_owner_id_fkey foreign KEY (owner_id) references profiles (id) on delete set null,
  constraint backlog_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_backlog_project on public.backlog_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create trigger trg_backlog_updated_at BEFORE
update on backlog_rows for EACH row
execute FUNCTION set_updated_at ();

create trigger trg_rbac_general_backlog_rows BEFORE INSERT
or DELETE
or
update on backlog_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();