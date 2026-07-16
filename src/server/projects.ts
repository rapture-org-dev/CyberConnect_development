import { createClient } from '@/lib/supabase-server'
import { getSession } from './auth'
import { Project } from '@/types'
import { revalidatePath } from 'next/cache'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveTeamProjectPrivilege,
  canManageProjectRoles,
  canUpdateTeamProjectMetadata,
  canDeleteTeamProject,
} from '@/lib/team-project-auth'
import { normalizeProjectGitHubFields } from '@/lib/githubRepo'

export type TeamProjectCoreDetailsInput = {
  name: string;
  name_ja: string;
  client: string;
  description: string;
  /** Optional `owner/repo` or leave empty to use env defaults. */
  github_full?: string;
  github_owner?: string;
  github_repo?: string;
}

/**
 * Server-side actions for managing Projects.
 * These actions enforce ownership and workspace isolation.
 */

async function getProfileByEmail(supabase: SupabaseClient, email: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()
  return data
}

async function getTeamIdBySlug(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('id')
    .eq('slug', slug)
    .single();
  
  if (error || !data) return null;
  return data.id;
}

/** Resolve team UUID from URL slug (e.g. when the user has no projects yet but needs the team roster). */
export async function getTeamIdBySlugAction(slug: string): Promise<string | null> {
  const session = await getSession()
  if (!session) return null
  const supabase = await createClient()
  return getTeamIdBySlug(supabase, slug)
}

export type GetProjectsOptions = {
  /** Every team project for this team (executive /admin/dashboard), ignoring active workspace role filters. */
  bypassProjectRoleFilter?: boolean;
};

export async function getProjectsAction(
  workspaceType?: 'personal' | 'team',
  teamId?: string,
  teamSlug?: string,
  _options?: GetProjectsOptions
): Promise<Project[]> {
  const session = await getSession()
  if (!session) return []
  
  const supabase = await createClient()
  const profile = await getProfileByEmail(supabase, session.email)
  if (!profile) return []

  const activeRole = session.activeWorkspaceRole || session.role;
  
  // Strict Context Resolution
  const targetType = workspaceType || (activeRole === 'personal' ? 'personal' : 'team');
  let targetTeamId = teamId;
  
  if (targetType === 'team' && !targetTeamId) {
    const slug = teamSlug || session.activeTeamSlug;
    if (slug) {
      targetTeamId = await getTeamIdBySlug(supabase, slug) || undefined;
    }
  }

  let query = supabase.from('projects')
    .select('*, project_members(profile_id, workspace_role)');

  if (targetType === 'personal') {
    // Scenario C: Personal Space - Strictly isolated to creator
    query = query.eq('workspace_type', 'personal')
      .is('team_id', null)
      .eq('owner_id', profile.id);
  } else if (targetType === 'team' && targetTeamId) {
    // TEAM SCOPE: Every member sees all team projects; sheet edit rights are enforced per project.
    query = query.eq('workspace_type', 'team').eq('team_id', targetTeamId);
  } else {
    // No valid context found
    return [];
  }

  const { data, error } = await query;
  if (error) {
    console.error('getProjectsAction error:', error);
    return [];
  }

  const rows = (data ?? []) as any[]
  return rows.map(p => {
    const members = (p.project_members || []) as { profile_id: string; workspace_role: string }[]
    return {
      ...p,
      projectMemberEntries: members.map(m => ({ profile_id: m.profile_id, workspace_role: m.workspace_role })),
      assignedDevIds: members.filter(m => m.workspace_role === 'dev').map(m => m.profile_id),
    }
  }) as Project[];
}

export async function getProjectByIdAction(id: string): Promise<Project | null> {
  const session = await getSession()
  if (!session) return null
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      project_members (
        profile_id,
        workspace_role
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('getProjectByIdAction error:', error)
    return null
  }
  
  const p = data as Record<string, unknown>
  const members = (p.project_members || []) as { profile_id: string; workspace_role: string }[]
  return {
    ...p,
    projectMemberEntries: members.map(m => ({ profile_id: m.profile_id, workspace_role: m.workspace_role })),
    assignedDevIds: members.filter(m => m.workspace_role === 'dev').map(m => m.profile_id),
  } as Project
}

export async function assignProjectMemberAction(projectId: string, profileId: string, role: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  const actor = await getProfileByEmail(supabase, session.email)
  if (!actor) throw new Error('Unauthorized')

  const { data: projectRow } = await supabase
    .from('projects')
    .select('id, team_id, workspace_type, pm_id')
    .eq('id', projectId)
    .single()
  if (!projectRow || projectRow.workspace_type !== 'team') throw new Error('Invalid project')

  const priv = await resolveTeamProjectPrivilege(supabase, actor.id, projectRow)
  if (!canManageProjectRoles(priv)) throw new Error('Forbidden: Only company admins or the billing owner can assign project roles')

  // Mapping 'dev' UI role to 'dev' SQL ENUM
  const dbRole = role === 'dev' ? 'dev' : role;

  const { error } = await supabase
    .from('project_members')
    .upsert({ 
      project_id: projectId, 
      profile_id: profileId, 
      workspace_role: dbRole 
    }, { onConflict: 'project_id,profile_id' });

  if (error) throw error;
  
  // If assigning as PM, also update the main pm_id on the projects table for quick lookup
  if (role === 'pm') {
    await supabase.from('projects').update({ pm_id: profileId }).eq('id', projectId);
  }

  revalidatePath('/', 'layout')
  revalidatePath('/', 'layout')
}

export async function removeProjectMemberAction(projectId: string, profileId: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  const actor = await getProfileByEmail(supabase, session.email)
  if (!actor) throw new Error('Unauthorized')

  const { data: projectRow } = await supabase
    .from('projects')
    .select('id, team_id, workspace_type, pm_id')
    .eq('id', projectId)
    .single()
  if (!projectRow || projectRow.workspace_type !== 'team') throw new Error('Invalid project')

  const priv = await resolveTeamProjectPrivilege(supabase, actor.id, projectRow)
  if (!canManageProjectRoles(priv)) throw new Error('Forbidden: Only company admins or the billing owner can remove project roles')

  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('profile_id', profileId);

  if (error) throw error;
  
  // If this user was the primary PM, also clear it from the projects table
  const { data: project } = await supabase.from('projects').select('pm_id').eq('id', projectId).single();
  if (project?.pm_id === profileId) {
    await supabase.from('projects').update({ pm_id: null }).eq('id', projectId);
  }

  revalidatePath('/', 'layout')
  revalidatePath('/', 'layout')
}

export async function createProjectAction(project: Partial<Project>): Promise<{ success: boolean; data?: Project; error?: string }> {
  try {
    const session = await getSession()
    if (!session) return { success: false, error: 'Unauthorized' }
    
    const supabase = await createClient()

    const { data: { user: authUser }, error: authUserError } = await supabase.auth.getUser()
    if (authUserError || !authUser) {
      return {
        success: false,
        error: 'Supabase session missing. Sign out, sign in again, then retry.',
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authUser.id)
      .single()

    if (!profile) return { success: false, error: 'User profile not found' }
    
    const activeRole = session.activeWorkspaceRole || session.role
    const explicitTeam = project.workspace_type === 'team'
    const explicitPersonal = project.workspace_type === 'personal'
    const isPersonal =
      explicitPersonal ||
      (!explicitTeam &&
        (session.accountKind === 'personal' || activeRole === 'personal'))
    
    // Resolve Team ID from context
    let teamId: string | null = null;
    if (!isPersonal) {
      // Priority: 1. team_id passed in project, 2. Resolve from activeTeamSlug
      if (project.team_id) {
        teamId = project.team_id;
      } else if (session.activeTeamSlug) {
        teamId = await getTeamIdBySlug(supabase, session.activeTeamSlug);
      }
      
      if (!teamId) {
        return { success: false, error: 'No active team context found. Please ensure you are in a team workspace.' }
      }
    }

    // Build payload dynamically based on active space
    const payload: Record<string, any> = {
      ...project,
      status: project.status || 'active',
      workspace_type: isPersonal ? 'personal' : 'team',
      owner_id: authUser.id,
      team_id: isPersonal ? null : teamId,
    }

    if (!isPersonal && teamId) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', profile.id).maybeSingle()
      const { data: teamRow } = await supabase.from('teams').select('owner_id').eq('id', teamId).maybeSingle()
      const { data: tm } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('profile_id', profile.id)
        .maybeSingle()
      const canSetLeadership =
        prof?.role === 'admin' || teamRow?.owner_id === profile.id || tm?.role === 'admin'
      if (prof?.role !== 'admin' && !tm) {
        return { success: false, error: 'Forbidden: You must be a member of this team to create projects' }
      }
      if (!canSetLeadership) {
        payload.pm_id = null
        payload.client_id = null
      }
    }

    // Clean up UI-only or temp fields
    delete payload.assignedDevIds
    delete payload.projectMemberEntries
    delete payload.nameJa
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (payload.id && !uuidRegex.test(String(payload.id))) delete payload.id
    
    const uuidFields = ['pm_id', 'client_id']
    uuidFields.forEach(f => {
      if (payload[f] === '' || (payload[f] && !uuidRegex.test(String(payload[f])))) {
        payload[f] = null
      }
    })

    try {
      const gh = normalizeProjectGitHubFields({
        github_full: (project as { github_full?: string }).github_full,
        github_owner: project.github_owner,
        github_repo: project.github_repo,
      })
      payload.github_owner = gh.github_owner
      payload.github_repo = gh.github_repo
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid GitHub repository' }
    }
    delete payload.github_full

    const { data, error } = await supabase
      .from('projects')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return { success: false, error: error.message }
    }
    
    revalidatePath('/', 'layout')
    return { success: true, data: { ...(data as Project), assignedDevIds: [] } }
  } catch (err: any) {
    console.error('Unexpected error in createProjectAction:', err)
    return { success: false, error: err.message || 'An unexpected error occurred' }
  }
}

export async function updateProjectAction(id: string, updates: Partial<Project>) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  
  const supabase = await createClient()
  const profile = await getProfileByEmail(supabase, session.email)
  if (!profile) throw new Error('Unauthorized')

  const { data: existing } = await supabase
    .from('projects')
    .select('owner_id, workspace_type, team_id, pm_id')
    .eq('id', id)
    .single()

  if (!existing) throw new Error('Not found')

  if (session.accountKind === 'personal' || existing.workspace_type === 'personal') {
    if (existing.owner_id !== profile.id) throw new Error('Forbidden')
  } else if (existing.workspace_type === 'team') {
    const priv = await resolveTeamProjectPrivilege(supabase, profile.id, {
      id,
      team_id: existing.team_id,
      workspace_type: existing.workspace_type,
      pm_id: existing.pm_id,
    })
    if (!canUpdateTeamProjectMetadata(priv)) throw new Error('Forbidden')

    const leadershipKeys = ['pm_id', 'client_id', 'team_id', 'owner_id'] as const
    if (priv !== 'team_manage') {
      for (const key of leadershipKeys) {
        if (key in updates && (updates as Record<string, unknown>)[key] !== undefined) {
          throw new Error('Forbidden: Only company admins or the billing owner can change PM/client assignment')
        }
      }
    }
  }

  const payload: Record<string, unknown> = { ...updates }
  delete payload.assignedDevIds
  delete payload.projectMemberEntries
  delete payload.nameJa

  if (
    'github_owner' in payload ||
    'github_repo' in payload ||
    'github_full' in payload
  ) {
    const gh = normalizeProjectGitHubFields({
      github_full: payload.github_full as string | undefined,
      github_owner: payload.github_owner as string | undefined,
      github_repo: payload.github_repo as string | undefined,
    })
    payload.github_owner = gh.github_owner
    payload.github_repo = gh.github_repo
    delete payload.github_full
  }

  const { error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', id)

  if (error) throw error
  revalidatePath('/')
}

/**
 * Updates core listing fields for a team project. Restricted to company admin, billing owner,
 * or platform admin — same bar as role assignment (must not rely on UI-only checks).
 */
export async function updateTeamProjectCoreDetailsAction(
  projectId: string,
  input: TeamProjectCoreDetailsInput
): Promise<{ success: boolean; error?: string; data?: Partial<Project> }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Unauthorized' }

  const supabase = await createClient()
  const profile = await getProfileByEmail(supabase, session.email)
  if (!profile) return { success: false, error: 'Unauthorized' }

  const name = input.name.trim()
  if (!name) return { success: false, error: 'Project name is required' }

  const { data: existing, error: fetchErr } = await supabase
    .from('projects')
    .select('id, workspace_type, team_id, pm_id')
    .eq('id', projectId)
    .single()

  if (fetchErr || !existing) return { success: false, error: 'Project not found' }
  if (existing.workspace_type !== 'team') return { success: false, error: 'Invalid project' }

  const priv = await resolveTeamProjectPrivilege(supabase, profile.id, {
    id: projectId,
    team_id: existing.team_id,
    workspace_type: existing.workspace_type,
    pm_id: existing.pm_id,
  })
  if (!canManageProjectRoles(priv)) {
    return { success: false, error: 'Forbidden: Only a company admin or the billing owner can edit project details' }
  }

  const payload: Record<string, unknown> = {
    name,
    name_ja: input.name_ja.trim() || name,
    client: input.client.trim(),
    description: input.description.trim(),
  }

  try {
    const gh = normalizeProjectGitHubFields({
      github_full: input.github_full,
      github_owner: input.github_owner,
      github_repo: input.github_repo,
    })
    payload.github_owner = gh.github_owner
    payload.github_repo = gh.github_repo
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid GitHub repository' }
  }

  const { data: updated, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true, data: updated as Partial<Project> }
}

export async function deleteProjectAction(id: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  
  const supabase = await createClient()
  const profile = await getProfileByEmail(supabase, session.email)
  if (!profile) throw new Error('Unauthorized')

  const { data: existing } = await supabase
    .from('projects')
    .select('owner_id, workspace_type, team_id, pm_id')
    .eq('id', id)
    .single()

  if (!existing) throw new Error('Not found')

  if (session.accountKind === 'personal' || existing.workspace_type === 'personal') {
    if (existing.owner_id !== profile.id) throw new Error('Forbidden')
  } else if (existing.workspace_type === 'team') {
    const priv = await resolveTeamProjectPrivilege(supabase, profile.id, {
      id,
      team_id: existing.team_id,
      workspace_type: existing.workspace_type,
      pm_id: existing.pm_id,
    })
    if (!canDeleteTeamProject(priv)) throw new Error('Forbidden')
  }

  const { error } = await supabase      
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) throw error
  revalidatePath('/')
}
