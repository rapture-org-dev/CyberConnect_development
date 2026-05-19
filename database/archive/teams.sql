create table public.teams (
  id uuid not null default gen_random_uuid (),
  name text not null,
  created_at timestamp with time zone null default now(),
  slug text not null,
  owner_id uuid null,
  invite_code text null,
  constraint teams_pkey primary key (id),
  constraint teams_slug_unique unique (slug),
  constraint teams_owner_id_fkey foreign KEY (owner_id) references profiles (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists teams_invite_code_unique on public.teams using btree (invite_code) TABLESPACE pg_default;

create trigger trg_teams_invite_code BEFORE INSERT on teams for EACH row
execute FUNCTION set_team_invite_code ();