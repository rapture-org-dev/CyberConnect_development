/**
 * REST API client for the Next.js app. All browser and client-component data access
 * should go through these functions (not Server Actions).
 */
import { apiFetch } from '@/lib/api/http'
import { supabase } from '@/lib/supabase'
import type { Project, SheetColumn, SheetRow, TeamMembership, UserProfile } from '@/types'
import type { TeamProjectCoreDetailsInput } from '@/server/projects'
import type { FinalizeImportRowsOptions, ValidateImportRowsOptions } from '@/server/rows'
import type {
  ConflictChoice,
  ImportFinalResult,
  ImportValidationResult,
} from '@/types'

export type AppSession = {
  email: string
  role?: string
  accountKind?: 'team' | 'personal'
  activeWorkspaceRole?: string
  activeTeamSlug?: string
} | null

// —— Auth ——
export async function getSession(): Promise<AppSession> {
  return apiFetch<AppSession>('/api/auth/session')
}

/** App cookies + Supabase session cookies (required for Postgres RLS auth.uid()). */
export async function syncAppLoginSession(
  email: string,
  role: string,
  accountKind: 'team' | 'personal',
  activeWorkspaceRole?: string,
  activeTeamSlug?: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  await loginAction(
    email,
    role,
    accountKind,
    activeWorkspaceRole,
    activeTeamSlug,
    session?.access_token,
    session?.refresh_token
  )
}

export async function loginAction(
  email: string,
  role: string,
  accountKind: 'team' | 'personal',
  activeWorkspaceRole?: string,
  activeTeamSlug?: string,
  accessToken?: string,
  refreshToken?: string
): Promise<void> {
  await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      role,
      accountKind,
      activeWorkspaceRole,
      activeTeamSlug,
      accessToken,
      refreshToken,
    }),
  })
}

export async function logoutAction(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' })
}

export async function updateActiveRoleAction(role: string, teamSlug?: string): Promise<void> {
  await apiFetch('/api/auth/active-role', {
    method: 'PATCH',
    body: JSON.stringify({ role, teamSlug }),
  })
}

export async function updateAccountKindAction(accountKind: 'team' | 'personal'): Promise<void> {
  await apiFetch('/api/auth/account-kind', {
    method: 'PATCH',
    body: JSON.stringify({ accountKind }),
  })
}

export async function clearRoleSessionAction(): Promise<void> {
  await apiFetch('/api/auth/clear-role', { method: 'POST' })
}

export async function getUserAccessRolesAction(userId: string, teamSlug?: string) {
  const q = new URLSearchParams({ userId })
  if (teamSlug) q.set('teamSlug', teamSlug)
  return apiFetch<{ isAdmin: boolean; projectRoles: string[] }>(
    `/api/auth/access-roles?${q.toString()}`
  )
}

// —— Profiles ——
export async function getMyProfileAction(): Promise<UserProfile | null> {
  return apiFetch<UserProfile | null>('/api/profiles/me')
}

export async function updateMyProfileAction(
  updates: Partial<Pick<UserProfile, 'name' | 'department' | 'avatar_url'>>
): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/profiles/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function getProfiles(): Promise<UserProfile[]> {
  return apiFetch<UserProfile[]>('/api/profiles')
}

export async function getProfileById(id: string): Promise<UserProfile | null> {
  return apiFetch<UserProfile | null>(`/api/profiles/${encodeURIComponent(id)}`)
}

export async function getTeamMembersAction(teamId: string): Promise<UserProfile[]> {
  return apiFetch<UserProfile[]>(
    `/api/profiles/team-members?teamId=${encodeURIComponent(teamId)}`
  )
}

export async function getMyTeamMembershipsAction(): Promise<TeamMembership[]> {
  return apiFetch<TeamMembership[]>('/api/profiles/team-memberships')
}

export async function upgradeToAdminAction(): Promise<void> {
  await apiFetch('/api/profiles/upgrade-admin', { method: 'POST' })
}

// —— Projects ——
export async function getTeamIdBySlugAction(slug: string): Promise<string | null> {
  const { teamId } = await apiFetch<{ teamId: string | null }>(
    `/api/teams/by-slug/${encodeURIComponent(slug)}/id`
  )
  return teamId
}

export async function getProjectsAction(
  scope: 'team' | 'personal',
  teamId?: string,
  teamSlug?: string
): Promise<Project[]> {
  const q = new URLSearchParams({ scope })
  if (teamId) q.set('teamId', teamId)
  if (teamSlug) q.set('teamSlug', teamSlug)
  return apiFetch<Project[]>(`/api/projects?${q.toString()}`)
}

export async function getProjectByIdAction(id: string): Promise<Project | null> {
  return apiFetch<Project | null>(`/api/projects/${encodeURIComponent(id)}`)
}

export async function createProjectAction(
  project: Partial<Project>
): Promise<{ success: boolean; data?: Project; error?: string }> {
  return apiFetch(`/api/projects`, {
    method: 'POST',
    body: JSON.stringify(project),
  })
}

export async function updateProjectAction(id: string, updates: Partial<Project>) {
  return apiFetch<Project>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function updateTeamProjectCoreDetailsAction(
  projectId: string,
  input: TeamProjectCoreDetailsInput
): Promise<{ success: boolean; error?: string; data?: Partial<Project> }> {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/team-details`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteProjectAction(id: string): Promise<void> {
  await apiFetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function assignProjectMemberAction(
  projectId: string,
  profileId: string,
  role: string
): Promise<void> {
  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ profileId, role }),
  })
}

export async function removeProjectMemberAction(
  projectId: string,
  profileId: string
): Promise<void> {
  await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/members?profileId=${encodeURIComponent(profileId)}`,
    { method: 'DELETE' }
  )
}

// —— Teams ——
export async function isTeamOwnerAction(): Promise<boolean> {
  const { isOwner } = await apiFetch<{ isOwner: boolean }>('/api/teams/is-owner')
  return isOwner
}

export async function purchaseTeamPlanAction(
  teamName: string,
  teamSlug: string
): Promise<{ success: boolean; error?: string }> {
  return apiFetch('/api/teams/purchase-plan', {
    method: 'POST',
    body: JSON.stringify({ teamName, teamSlug }),
  })
}

export async function updateTeamAction(
  teamId: string,
  updates: { name?: string }
): Promise<{ id: string; name: string; slug: string; invite_code: string | null }> {
  return apiFetch(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function regenerateTeamInviteCodeAction(teamId: string): Promise<string> {
  const { inviteCode } = await apiFetch<{ inviteCode: string }>(
    `/api/teams/${encodeURIComponent(teamId)}/regenerate-invite`,
    { method: 'POST' }
  )
  return inviteCode
}

export async function setTeamMemberRoleAction(
  teamId: string,
  profileId: string,
  role: 'admin' | 'member'
): Promise<void> {
  await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(profileId)}/role`,
    { method: 'PATCH', body: JSON.stringify({ role }) }
  )
}

export async function joinTeamByInviteCodeAction(code: string): Promise<{
  success: boolean
  teamSlug?: string
  teamName?: string
  error?: string
}> {
  return apiFetch('/api/teams/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

// —— Sheet rows ——
export async function getNextTaskCodeAction(projectId: string): Promise<string> {
  const { taskCode } = await apiFetch<{ taskCode: string }>(
    `/api/sheet-rows/next-task-code?projectId=${encodeURIComponent(projectId)}`
  )
  return taskCode
}

export async function getSheetRowsAction(projectId: string, tabId: string): Promise<SheetRow[]> {
  const q = new URLSearchParams({ projectId, tabId })
  return apiFetch<SheetRow[]>(`/api/sheet-rows?${q.toString()}`)
}

export async function upsertSheetRowAction(
  tabId: string,
  row: Partial<SheetRow> & { id: string; project_id: string }
): Promise<SheetRow> {
  return apiFetch<SheetRow>('/api/sheet-rows', {
    method: 'PUT',
    body: JSON.stringify({ tabId, row }),
  })
}

export async function upsertSheetRowsBatchAction(
  tabId: string,
  projectId: string,
  rows: SheetRow[]
): Promise<SheetRow[]> {
  return apiFetch<SheetRow[]>('/api/sheet-rows/batch', {
    method: 'PUT',
    body: JSON.stringify({ tabId, projectId, rows }),
  })
}

export async function deleteSheetRowAction(
  tabId: string,
  projectId: string,
  rowId: string
): Promise<void> {
  const q = new URLSearchParams({ tabId, projectId, rowId })
  await apiFetch(`/api/sheet-rows?${q.toString()}`, { method: 'DELETE' })
}

export async function deleteSheetRowsBatchAction(
  tabId: string,
  projectId: string,
  rowIds: string[]
): Promise<void> {
  await apiFetch('/api/sheet-rows/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ tabId, projectId, rowIds }),
  })
}

export async function validateAndMapImportRows(
  projectId: string,
  tabId: string,
  excelRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
  options?: ValidateImportRowsOptions
): Promise<ImportValidationResult> {
  return apiFetch('/api/sheet-rows/import/validate', {
    method: 'POST',
    body: JSON.stringify({ projectId, tabId, excelRows, columnMapping, options }),
  })
}

export async function finalizeImportRows(
  projectId: string,
  tabId: string,
  rowsToImport: SheetRow[],
  conflictResolutions: ConflictChoice[],
  options?: FinalizeImportRowsOptions
): Promise<ImportFinalResult> {
  return apiFetch('/api/sheet-rows/import/finalize', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      tabId,
      rowsToImport,
      conflictResolutions,
      options,
    }),
  })
}

// —— Sheet column layouts ——
export async function getProjectSheetColumnLayoutsAction(
  projectId: string
): Promise<Partial<Record<string, SheetColumn[]>>> {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sheet-column-layouts`)
}

export async function saveProjectSheetColumnLayoutAction(
  projectId: string,
  tabId: string,
  columns: SheetColumn[]
): Promise<void> {
  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sheet-column-layouts`, {
    method: 'PUT',
    body: JSON.stringify({ tabId, columns }),
  })
}
