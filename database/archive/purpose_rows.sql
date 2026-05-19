create table public.purpose_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  major_item text not null default ''::text,
  major_item_ja text not null default ''::text,
  content text not null default ''::text,
  content_ja text not null default ''::text,
  details text not null default ''::text,
  details_ja text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  extras jsonb not null default '{}'::jsonb,
  constraint purpose_rows_pkey primary key (id),
  constraint purpose_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_purpose_rows_project on public.purpose_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create trigger trg_purpose_rows_updated_at BEFORE
update on purpose_rows for EACH row
execute FUNCTION set_updated_at ();

create trigger trg_rbac_general_purpose_rows BEFORE INSERT
or DELETE
or
update on purpose_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();