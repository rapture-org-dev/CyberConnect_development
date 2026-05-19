create table public.code_sequences (
  project_id uuid not null,
  prefix text not null,
  last_val integer not null default 0,
  constraint code_sequences_pkey primary key (project_id, prefix),
  constraint code_sequences_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;