create table public.profiles (
  id uuid not null,
  name text not null,
  email text not null,
  role public.user_role not null default 'client'::user_role,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  extra_roles user_role[] not null default '{}'::user_role[],
  invited_by uuid null,
  status text not null default 'active'::text,
  avatar_url text not null default ''::text,
  department text not null default ''::text,
  team_id uuid null,
  team_role public.team_roles null default 'member'::team_roles,
  constraint profiles_pkey primary key (id),
  constraint profiles_email_key unique (email),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint profiles_invited_by_fkey foreign KEY (invited_by) references profiles (id),
  constraint profiles_team_id_fkey foreign KEY (team_id) references teams (id),
  constraint profiles_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'active'::text,
          'suspended'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create trigger trg_profiles_updated_at BEFORE
update on profiles for EACH row
execute FUNCTION set_updated_at ();

create trigger trigger_check_team_size BEFORE INSERT
or
update OF team_id,
role on profiles for EACH row when (new.team_id is not null)
execute FUNCTION check_team_size ();

create trigger trigger_enforce_staff_limit BEFORE INSERT
or
update OF team_role,
team_id on profiles for EACH row when (new.team_id is not null)
execute FUNCTION enforce_staff_limit ();