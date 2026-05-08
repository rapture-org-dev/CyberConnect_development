create table public.function_list_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  function_code text not null default ''::text,
  phase public.phase_type null,
  phase_ja text not null default ''::text,
  user_category text not null default ''::text,
  user_category_ja text not null default ''::text,
  main_category text not null default ''::text,
  main_category_ja text not null default ''::text,
  subcategory text not null default ''::text,
  subcategory_ja text not null default ''::text,
  screen_code text not null default ''::text,
  screen_name text not null default ''::text,
  screen_name_ja text not null default ''::text,
  function_name text not null default ''::text,
  function_name_ja text not null default ''::text,
  function_details text not null default ''::text,
  function_details_ja text not null default ''::text,
  effort text not null default ''::text,
  effort_ja text not null default ''::text,
  status public.function_status null default 'Need to be checked'::function_status,
  completion_dev public.check_status null default ''::check_status,
  completion_client public.check_status null default ''::check_status,
  remarks text not null default ''::text,
  remarks_ja text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint function_list_rows_pkey primary key (id),
  constraint function_list_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_function_list_project on public.function_list_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create index IF not exists idx_function_screen_code on public.function_list_rows using btree (project_id, screen_code) TABLESPACE pg_default;

create unique INDEX IF not exists idx_function_code_project on public.function_list_rows using btree (project_id, function_code) TABLESPACE pg_default
where
  (function_code <> ''::text);

create trigger trg_rbac_general_function_list_rows BEFORE INSERT
or DELETE
or
update on function_list_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();