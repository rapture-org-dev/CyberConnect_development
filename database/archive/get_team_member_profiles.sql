-- =============================================================================
-- Team roster for assignment UIs (run after team_members.sql + profiles exist).
-- PostgREST: exposes RPC get_team_member_profiles for authenticated clients.
-- Without this, getTeamMembersAction falls back to team_members + profiles(*),
-- which is often empty for other users under strict profiles RLS.
-- =============================================================================

create or replace function public.get_team_member_profiles(p_team_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  avatar_url text,
  department text,
  team_role public.team_roles
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_profile uuid;
begin
  if auth.uid() is null then
    return;
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
    return;
  end if;

  if not exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.profile_id = caller_profile
  ) then
    return;
  end if;

  return query
  select
    p.id,
    p.name,
    p.email,
    coalesce(p.role::text, 'dev'),
    p.avatar_url,
    p.department,
    tm.role
  from public.team_members tm
  inner join public.profiles p on p.id = tm.profile_id
  where tm.team_id = p_team_id;
end;
$$;

revoke all on function public.get_team_member_profiles(uuid) from public;
grant execute on function public.get_team_member_profiles(uuid) to authenticated;
