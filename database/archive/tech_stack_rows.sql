create table public.tech_stack_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  major_item text not null default ''::text,
  major_item_ja text not null default ''::text,
  medium_item text not null default ''::text,
  medium_item_ja text not null default ''::text,
  content text not null default ''::text,
  content_ja text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  extras jsonb not null default '{}'::jsonb,
  constraint tech_stack_rows_pkey primary key (id),
  constraint tech_stack_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tech_stack_project on public.tech_stack_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create trigger trg_rbac_general_tech_stack_rows BEFORE INSERT
or DELETE
or
update on tech_stack_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();

create trigger trg_tech_stack_updated_at BEFORE
update on tech_stack_rows for EACH row
execute FUNCTION set_updated_at ();