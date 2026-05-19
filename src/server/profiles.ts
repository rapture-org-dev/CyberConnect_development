import { createClient } from '@/lib/supabase-server'
import { getSession } from './auth'
import { revalidatePath } from 'next/cache'
import { UserProfile, TeamMembership } from '@/types'

/**
 * Server-side actions for managing User Profiles.
 */

export async function getMyTeamMembershipsAction(): Promise<TeamMembership[]> {
  const session = await getSession()
  if (!session) return []
  
  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .single()

  if (!profile) return []

  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, profile_id, role, team:teams(*)')
    .eq('profile_id', profile.id)

  if (error) {
    console.error('getMyTeamMembershipsAction DB error:', error)
    return []
  }

  // Ensure team is an object, not an array (due to Supabase join logic)
  const mapped = (data || []).map(m => ({
    ...m,
    team: Array.isArray(m.team) ? m.team[0] : m.team
  }))

  return mapped as TeamMembership[]
}

export async function getMyProfileAction(): Promise<UserProfile | null> {
  const session = await getSession()
  if (!session) return null
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', session.email)
    .single()

  if (error) {
    console.error('getMyProfileAction error:', error)
    return null
  }

  return data as UserProfile
}

export async function updateMyProfileAction(updates: Partial<Pick<UserProfile, 'name' | 'department' | 'avatar_url'>>): Promise<UserProfile> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .single()

  if (!profile) throw new Error('Profile not found')

  const payload = {
    ...(typeof updates.name === 'string' ? { name: updates.name.trim() } : {}),
    ...(typeof updates.department === 'string' ? { department: updates.department.trim() } : {}),
    ...(typeof updates.avatar_url === 'string' ? { avatar_url: updates.avatar_url.trim() } : {}),
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', profile.id)
    .select('*')
    .single()

  if (error) throw error

  revalidatePath('/')
  return data as UserProfile
}

export async function getProfiles(): Promise<UserProfile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, avatar_url, department')
    .eq('status', 'active');
  
  if (error) throw error;
  return data as UserProfile[];
}

export async function getProfileById(id: string): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, avatar_url, department')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data as UserProfile;
}

export async function getTeamMembersAction(teamId: string): Promise<UserProfile[]> {
  const session = await getSession()
  if (!session) return []

  const supabase = await createClient()

  // Prefer RPC: embedded `profiles(*)` on team_members is usually stripped by RLS for other
  // users' rows, so the assignment pool would only contain yourself. The RPC runs with a
  // narrow SECURITY DEFINER check (caller must be in the same team).
  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_team_member_profiles', {
    p_team_id: teamId,
  })

  if (!rpcError && Array.isArray(rpcRows)) {
    return (rpcRows as any[]).map(row => ({
      id: row.id,
      name: row.name ?? '',
      email: row.email ?? '',
      role: row.role as UserProfile['role'],
      avatar_url: row.avatar_url ?? undefined,
      department: row.department ?? undefined,
      team_role: row.team_role as UserProfile['team_role'],
    }))
  }

  if (rpcError) {
    console.error('getTeamMembersAction RPC error (fallback to direct select):', rpcError)
  }

  const { data: membershipData, error } = await supabase
    .from('team_members')
    .select('profile_id, role, profiles(*)')
    .eq('team_id', teamId)

  if (error) {
    console.error('getTeamMembersAction DB error:', error)
  }

  let pool = (membershipData || []).map(m => ({
    ...(m.profiles as any),
    team_role: m.role,
  })) as UserProfile[]

  const { data: currentUser } = await supabase.from('profiles').select('*').eq('email', session.email).single()

  if (currentUser) {
    const exists = pool.find(m => m.id === currentUser.id)
    if (!exists) {
      pool.push(currentUser as UserProfile)
    }
  }

  return pool
}

export async function upgradeToAdminAction() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  
  // Find profile by email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .single()
  
  if (!profile) throw new Error('Profile not found')

  const { error } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', profile.id)

  if (error) throw error
  revalidatePath('/')
}
