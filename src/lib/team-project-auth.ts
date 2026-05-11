import type { SupabaseClient } from '@supabase/supabase-js';

/** Team-scoped authorization for a single project (server-side). */
export type TeamProjectPrivilege =
  | 'team_manage'
  | 'project_pm'
  | 'project_dev'
  /** Client / member rows in project_members, or projects.client_id — sheet RBAC limits what they may write. */
  | 'project_assignee'
  | 'view';

/**
 * Who can manage project roles (PM/Dev/client) and inviting assigned roles:
 * platform admin, billing owner, or company admin — not regular members.
 */
export async function resolveTeamProjectPrivilege(
  supabase: SupabaseClient,
  profileId: string,
  project: {
    id: string
    team_id: string | null
    workspace_type: string
    pm_id: string | null
    client_id?: string | null
  }
): Promise<TeamProjectPrivilege> {
  if (project.workspace_type !== 'team' || !project.team_id) return 'view';

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', profileId).maybeSingle();
  if (profile?.role === 'admin') return 'team_manage';

  const { data: team } = await supabase.from('teams').select('owner_id').eq('id', project.team_id).maybeSingle();
  if (team?.owner_id === profileId) return 'team_manage';

  const { data: tm } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', project.team_id)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!tm) return 'view';
  if (tm.role === 'admin') return 'team_manage';

  const { data: mine } = await supabase
    .from('project_members')
    .select('workspace_role')
    .eq('project_id', project.id)
    .eq('profile_id', profileId)
    .maybeSingle();

  const wr = mine?.workspace_role;

  if (project.pm_id === profileId || wr === 'pm') return 'project_pm';
  if (wr === 'dev') return 'project_dev';
  if (wr === 'client' || wr === 'member') return 'project_assignee';
  if (project.client_id != null && project.client_id === profileId) return 'project_assignee';

  return 'view';
}

export function canMutateSheetRows(priv: TeamProjectPrivilege): boolean {
  return (
    priv === 'team_manage' ||
    priv === 'project_pm' ||
    priv === 'project_dev' ||
    priv === 'project_assignee'
  );
}

export function canManageProjectRoles(priv: TeamProjectPrivilege): boolean {
  return priv === 'team_manage';
}

export function canUpdateTeamProjectMetadata(priv: TeamProjectPrivilege): boolean {
  return priv === 'team_manage' || priv === 'project_pm';
}

export function canDeleteTeamProject(priv: TeamProjectPrivilege): boolean {
  return priv === 'team_manage' || priv === 'project_pm';
}
