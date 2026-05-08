create table public.screen_list_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  screen_code text not null default ''::text,
  user_category text not null default ''::text,
  user_category_ja text not null default ''::text,
  major_item text not null default ''::text,
  major_item_ja text not null default ''::text,
  medium_item text not null default ''::text,
  medium_item_ja text not null default ''::text,
  screen_name text not null default ''::text,
  screen_name_ja text not null default ''::text,
  path text not null default ''::text,
  path_ja text not null default ''::text,
  overview text not null default ''::text,
  overview_ja text not null default ''::text,
  status public.screen_status null default 'Not started'::screen_status,
  completion_dev public.check_status null default ''::check_status,
  completion_client public.check_status null default ''::check_status,
  remarks text not null default ''::text,
  remarks_ja text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint screen_list_rows_pkey primary key (id),
  constraint screen_list_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_screen_list_project on public.screen_list_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create unique INDEX IF not exists idx_screen_code_project on public.screen_list_rows using btree (project_id, screen_code) TABLESPACE pg_default
where
  (screen_code <> ''::text);

create trigger trg_rbac_general_screen_list_rows BEFORE INSERT
or DELETE
or
update on screen_list_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();

create trigger trg_screen_list_updated_at BEFORE
update on screen_list_rows for EACH row
execute FUNCTION set_updated_at ();