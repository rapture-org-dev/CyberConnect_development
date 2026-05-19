import { cookies } from 'next/headers'

/**
 * Simulated authentication actions to bridge the gap between 
 * client-side localStorage/sessionStorage and a real backend.
 * These actions set HTTP-only cookies that the server-side 
 * Supabase client and other Server Actions can use.
 */

import { getUserAccessRoles } from '@/lib/roles'

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function getUserAccessRolesAction(userId: string, teamSlug?: string) {
  return await getUserAccessRoles(userId, teamSlug);
}

export async function loginAction(email: string, role: string, accountKind: 'team' | 'personal', activeWorkspaceRole?: string, activeTeamSlug?: string) {
  const cookieStore = await cookies()
  
  // Set session cookies
  cookieStore.set('cyberconnect_email', email, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  })
  
  cookieStore.set('cyberconnect_role', role, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  })

  cookieStore.set('cyberconnect_account_kind', accountKind, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  })

  // Also set the active workspace role cookie for RBAC tracking
  cookieStore.set('active_workspace_role', activeWorkspaceRole || role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  })

  // Set or clear active team slug for multi-tenancy routing
  if (activeTeamSlug) {
    cookieStore.set('active_team_slug', activeTeamSlug, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    })
  } else {
    cookieStore.delete('active_team_slug')
  }
}

export async function updateAccountKindAction(accountKind: 'team' | 'personal') {
  const cookieStore = await cookies()
  cookieStore.set('cyberconnect_account_kind', accountKind, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  })
}

export async function updateActiveRoleAction(role: string, teamSlug?: string) {
  const cookieStore = await cookies()
  cookieStore.set('active_workspace_role', role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  })
  if (teamSlug) {
    cookieStore.set('active_team_slug', teamSlug, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    })
  } else {
    cookieStore.delete('active_team_slug')
  }
}

export async function clearRoleSessionAction() {
  const cookieStore = await cookies()
  cookieStore.delete('active_workspace_role')
  cookieStore.delete('active_team_slug')
  cookieStore.delete('cyberconnect_account_kind')
}

export async function logoutAction() {
  const cookieStore = await cookies()
  
  // Wipe all session-related cookies
  cookieStore.delete('cyberconnect_email')
  cookieStore.delete('cyberconnect_role')
  cookieStore.delete('cyberconnect_account_kind')
  cookieStore.delete('active_workspace_role')
  cookieStore.delete('active_team_slug')
  
  // Also clear any other potentially project-specific cookies if they exist
}

export async function getSession() {
  const cookieStore = await cookies()
  const email = cookieStore.get('cyberconnect_email')?.value
  const role = cookieStore.get('cyberconnect_role')?.value
  const accountKind = cookieStore.get('cyberconnect_account_kind')?.value as 'team' | 'personal' | undefined
  const activeWorkspaceRole = cookieStore.get('active_workspace_role')?.value as string | undefined
  const activeTeamSlug = cookieStore.get('active_team_slug')?.value as string | undefined
  
  if (!email) return null
  
  return { email, role, accountKind, activeWorkspaceRole, activeTeamSlug }
}
