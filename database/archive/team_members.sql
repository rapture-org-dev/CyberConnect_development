create table public.team_members (
  team_id uuid not null,
  profile_id uuid not null,
  role public.team_roles not null default 'member'::team_roles,
  created_at timestamp with time zone not null default now(),
  constraint team_members_pkey primary key (team_id, profile_id),
  constraint team_members_profile_id_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE,
  constraint team_members_team_id_fkey foreign KEY (team_id) references teams (id) on delete CASCADE
) TABLESPACE pg_default;