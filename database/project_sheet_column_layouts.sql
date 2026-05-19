create table public.project_sheet_column_layouts (
  project_id uuid not null,
  tab_id text not null,
  columns jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone not null default now(),
  constraint project_sheet_column_layouts_pkey primary key (project_id, tab_id),
  constraint project_sheet_column_layouts_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_project_sheet_column_layouts_project on public.project_sheet_column_layouts using btree (project_id) TABLESPACE pg_default;