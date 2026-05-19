create table public.test_case_rows (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid not null,
  sort_order integer not null default 0,
  category text not null default ''::text,
  category_ja text not null default ''::text,
  scenario_name text not null default ''::text,
  scenario_name_ja text not null default ''::text,
  test_type text not null default ''::text,
  summary text not null default ''::text,
  summary_ja text not null default ''::text,
  test_steps text not null default ''::text,
  test_steps_ja text not null default ''::text,
  expected_results text not null default ''::text,
  expected_results_ja text not null default ''::text,
  status public.test_result null default ''::test_result,
  tester_id uuid null,
  remarks text not null default ''::text,
  remarks_ja text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  test_type_ja text not null default ''::text,
  extras jsonb not null default '{}'::jsonb,
  constraint test_case_rows_pkey primary key (id),
  constraint test_case_rows_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE,
  constraint test_case_rows_tester_id_fkey foreign KEY (tester_id) references profiles (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_test_case_project on public.test_case_rows using btree (project_id, sort_order) TABLESPACE pg_default;

create trigger trg_rbac_general_test_case_rows BEFORE INSERT
or DELETE
or
update on test_case_rows for EACH row
execute FUNCTION enforce_general_sheet_row_rbac ();

create trigger trg_test_case_updated_at BEFORE
update on test_case_rows for EACH row
execute FUNCTION set_updated_at ();