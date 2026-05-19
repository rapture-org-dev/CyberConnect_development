create table public.project_members (
  project_id uuid not null,
  profile_id uuid not null,
  workspace_role public.workspace_roles not null default 'member'::workspace_roles,
  constraint project_members_pkey primary key (project_id, profile_id),
  constraint project_members_profile_id_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE,
  constraint project_members_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger trigger_project_assignment_limit BEFORE INSERT
or
update OF workspace_role on project_members for EACH row
execute FUNCTION enforce_project_assignment_limit ();