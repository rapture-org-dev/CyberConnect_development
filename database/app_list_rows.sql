create table public.api_list_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  category text not null default ''::text,
  category_ja text not null default ''::text,
  service_name text not null default ''::text,
  service_name_ja text not null default ''::text,
  api_name text not null default ''::text,
  api_name_ja text not null default ''::text,
  auth_method text not null default ''::text,
  auth_method_ja text not null default ''::text,
  data_handling text not null default ''::text,
  data_handling_ja text not null default ''::text,
  realtime public.realtime_type null,
  mvp_required public.phase_type null,
  status public.api_status null default 'Not started'::api_status,
  remarks text not null default ''::text,
  remarks_ja text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  extras jsonb not null default '{}'::jsonb,
  constraint api_list_rows_pkey primary key (id),
  constraint api_list_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_api_list_project on public.api_list_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create trigger trg_api_list_updated_at BEFORE
update on api_list_rows for EACH row
execute FUNCTION set_updated_at ();

create trigger trg_rbac_general_api_list_rows BEFORE INSERT
or DELETE
or
update on api_list_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();