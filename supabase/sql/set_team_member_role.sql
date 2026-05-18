-- Same as database/migrate_set_team_member_role.sql (Supabase SQL folder copy).

create or replace function public.set_team_member_role(
  p_team_id uuid,
  p_profile_id uuid,
  p_role public.team_roles
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.id into caller_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if caller_profile is null then
    select p.id into caller_profile
    from public.profiles p
    inner join auth.users u on lower(u.email) = lower(p.email)
    where u.id = auth.uid()
    limit 1;
  end if;

  if caller_profile is null then
    raise exception 'Profile not found';
  end if;

  if not exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.owner_id = caller_profile
  ) then
    raise exception 'Forbidden: Only the billing owner can change company admin roles';
  end if;

  if exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.owner_id = p_profile_id
  ) then
    raise exception 'Cannot change the billing owner team role';
  end if;

  if not exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.profile_id = p_profile_id
  ) then
    raise exception 'Team member not found';
  end if;

  update public.team_members
  set role = p_role
  where team_id = p_team_id and profile_id = p_profile_id;
end;
$$;

revoke all on function public.set_team_member_role(uuid, uuid, public.team_roles) from public;
grant execute on function public.set_team_member_role(uuid, uuid, public.team_roles) to authenticated;
