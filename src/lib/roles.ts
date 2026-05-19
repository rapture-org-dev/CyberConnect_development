import { createClient } from '@/lib/supabase-server';
import type { UserRole } from '@/types';
import { getSession } from '@/server/auth';

interface UserAccessRoles {
  isAdmin: boolean;
  projectRoles: UserRole[];
}

/**
 * Fetches user access roles for the ACTIVE team/company.
 * Logic:
 * 1. Use overrideTeamSlug if provided (for transitions), else read from session.
 * 2. Lookup team_id by slug.
 * 3. Check the user's role in that specific team via team_members junction table.
 */
export async function getUserAccessRoles(userId: string, overrideTeamSlug?: string): Promise<UserAccessRoles> {
  const supabase = await createClient();
  const session = await getSession();
  const targetSlug = overrideTeamSlug || session?.activeTeamSlug;

  try {
    if (!targetSlug) {
      return { isAdmin: false, projectRoles: [] };
    }

    // 1. Resolve Team ID from slug
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('slug', targetSlug)
      .single();

    if (!team) return { isAdmin: false, projectRoles: [] };

    // 2. Check user role in THIS specific team
    const { data: membership, error: membershipError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', team.id)
      .eq('profile_id', userId)
      .single();

    if (membershipError || !membership) {
      console.error('No membership found for team:', targetSlug);
      return { isAdmin: false, projectRoles: [] };
    }

    // Map database 'team_roles' to application 'UserRole' IDs
    // If the user is a team 'admin', they have the 'admin' permission
    const isAdmin = membership.role === 'admin';

    // Roles for "Switch perspective" must reflect how the app actually assigns people:
    // - project_members has at most ONE row per (project, user), so PM+Dev in the UI can mean
    //   pm_id still points to the user while workspace_role was last set to dev.
    // - Always union workspace_role with leadership columns on projects for this team.
    const roleSet = new Set<string>();

    const { data: teamProjects, error: projectsError } = await supabase
      .from('projects')
      .select('id, pm_id, client_id')
      .eq('team_id', team.id)
      .eq('workspace_type', 'team');

    if (projectsError) {
      console.error('getUserAccessRoles projects error:', projectsError);
    }

    for (const p of teamProjects || []) {
      if (p.pm_id === userId) roleSet.add('pm');
      if (p.client_id === userId) roleSet.add('client');
    }

    const projectIds = (teamProjects || []).map(p => p.id).filter(Boolean);
    if (projectIds.length > 0) {
      const { data: projectMembers, error: pmError } = await supabase
        .from('project_members')
        .select('workspace_role')
        .eq('profile_id', userId)
        .in('project_id', projectIds);

      if (pmError) {
        console.error('getUserAccessRoles project_members error:', pmError);
      }

      for (const m of projectMembers || []) {
        const wr = m.workspace_role as string;
        if (wr === 'pm' || wr === 'dev' || wr === 'client') {
          roleSet.add(wr);
        } else if (wr === 'member') {
          roleSet.add('dev');
        }
      }
    }

    const projectRoles = Array.from(roleSet) as UserRole[];

    return {
      isAdmin,
      projectRoles,
    };
  } catch (error) {
    console.error('Unexpected error in getUserAccessRoles:', error);
    return { isAdmin: false, projectRoles: [] };
  }
}
