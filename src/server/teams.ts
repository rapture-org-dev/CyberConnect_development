import { createClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSession } from './auth'
import { revalidatePath } from 'next/cache'

async function getActorProfileId(supabase: SupabaseClient, email: string): Promise<string> {
  const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).single()
  if (!profile?.id) throw new Error('Unauthorized')
  return profile.id
}

/** Company admin or billing owner may update team settings and invite codes. */
async function assertTeamAdminOrOwner(
  supabase: SupabaseClient,
  actorId: string,
  teamId: string
): Promise<{ owner_id: string | null }> {
  const { data: team } = await supabase.from('teams').select('owner_id').eq('id', teamId).single()
  if (!team) throw new Error('Team not found')
  if (team.owner_id === actorId) return team

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', actorId).maybeSingle()
  if (profile?.role === 'admin') return team

  const { data: tm } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('profile_id', actorId)
    .maybeSingle()
  if (tm?.role === 'admin') return team

  throw new Error('Forbidden: Only the billing owner or a company admin can manage this team')
}

async function assertTeamBillingOwner(
  supabase: SupabaseClient,
  actorId: string,
  teamId: string
): Promise<{ owner_id: string | null }> {
  const { data: team } = await supabase.from('teams').select('owner_id').eq('id', teamId).single()
  if (!team) throw new Error('Team not found')
  if (team.owner_id !== actorId) {
    throw new Error('Forbidden: Only the billing owner can change company admin roles')
  }
  return team
}

function generateInviteCode(): string {
  return `TEAM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** Row shape returned by public.join_team_by_invite_code (PostgREST RPC). */
type JoinTeamByInviteRpcRow = {
  success: boolean
  error?: string | null
  team_slug?: string | null
  team_name?: string | null
}

export async function isTeamOwnerAction(): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  
  const supabase = await createClient()
  
  // Get profile ID first
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .single()

  if (!profile) return false

  // Call the DB function
  const { data, error } = await supabase
    .rpc('is_team_owner', { user_id: profile.id })

  if (error) {
    console.error('isTeamOwnerAction error:', error)
    return false
  }

  return !!data
}

export async function purchaseTeamPlanAction(teamName: string, teamSlug: string): Promise<{ success: boolean; error?: string }> {
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

    // 2. Create the Team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: teamName,
        slug: teamSlug,
        owner_id: authUser.id,
        invite_code: generateInviteCode()
      })
      .select()
      .single()

    if (teamError) {
      if (teamError.code === '23505') return { success: false, error: 'Team slug already exists' }
      throw teamError
    }

    // 3. Automatically add user as Admin in team_members
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        profile_id: authUser.id,
        role: 'admin'
      })

    if (memberError) throw memberError

    // 4. Update cookies immediately so middleware allows the new route
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

    cookieStore.set('active_workspace_role', 'admin', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    })

    cookieStore.set('active_team_slug', teamSlug, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    })

    cookieStore.set('cyberconnect_account_kind', 'team', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    })

    revalidatePath('/personal/dashboard')
    revalidatePath('/', 'layout')
    
    return { success: true }
  } catch (err: any) {
    console.error('purchaseTeamPlanAction unexpected error:', err)
    return { success: false, error: err.message || 'An unexpected error occurred' }
  }
}

export async function updateTeamAction(teamId: string, updates: { name?: string }): Promise<{ id: string; name: string; slug: string; invite_code: string | null }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  const actorId = await getActorProfileId(supabase, session.email)
  await assertTeamAdminOrOwner(supabase, actorId, teamId)

  const payload: Record<string, string> = {}
  if (typeof updates.name === 'string') payload.name = updates.name.trim()

  const { data, error } = await supabase
    .from('teams')
    .update(payload)
    .eq('id', teamId)
    .select('id, name, slug, invite_code')
    .single()

  if (error) throw error
  revalidatePath('/')
  return data
}

export async function regenerateTeamInviteCodeAction(teamId: string): Promise<string> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  const actorId = await getActorProfileId(supabase, session.email)
  await assertTeamAdminOrOwner(supabase, actorId, teamId)

  const nextCode = generateInviteCode()
  const { error } = await supabase
    .from('teams')
    .update({ invite_code: nextCode })
    .eq('id', teamId)

  if (error) throw error
  revalidatePath('/')
  return nextCode
}

export async function setTeamMemberRoleAction(
  teamId: string,
  profileId: string,
  role: 'admin' | 'member'
): Promise<void> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  const actorId = await getActorProfileId(supabase, session.email)
  const team = await assertTeamBillingOwner(supabase, actorId, teamId)

  if (profileId === team.owner_id) {
    throw new Error('Cannot change the billing owner team role')
  }
  if (role !== 'admin' && role !== 'member') {
    throw new Error('Invalid role')
  }

  const { error: rpcError } = await supabase.rpc('set_team_member_role', {
    p_team_id: teamId,
    p_profile_id: profileId,
    p_role: role,
  })

  if (rpcError) {
    const msg = rpcError.message || ''
    if (msg.includes('Could not find the function') || rpcError.code === 'PGRST202') {
      const { data: updated, error: directError } = await supabase
        .from('team_members')
        .update({ role })
        .eq('team_id', teamId)
        .eq('profile_id', profileId)
        .select('profile_id')

      if (directError) throw directError
      if (!updated?.length) {
        throw new Error(
          'Role was not updated. Run database/cyberconnect_schema.sql (or archive/migrate_set_team_member_role.sql) in Supabase SQL editor, then try again.'
        )
      }
    } else {
      throw new Error(rpcError.message)
    }
  }

  revalidatePath('/')
}

export async function joinTeamByInviteCodeAction(code: string): Promise<{ success: boolean; teamSlug?: string; teamName?: string; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Unauthorized' }

  const normalizedCode = code.trim().toUpperCase()
  if (!normalizedCode) return { success: false, error: 'Invite code is required' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .rpc('join_team_by_invite_code', { p_invite_code: normalizedCode })
    .single()

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to join team' }
  }

  const row = data as JoinTeamByInviteRpcRow
  if (!row.success) {
    return { success: false, error: row.error || 'Failed to join team' }
  }

  revalidatePath('/')
  return {
    success: true,
    teamSlug: row.team_slug ?? undefined,
    teamName: row.team_name ?? undefined,
  }
}
