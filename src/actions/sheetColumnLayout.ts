'use server'

import { createClient } from '@/lib/supabase-server'
import { getSession } from './auth'
import type { SheetColumn } from '@/types'
import {
  resolveTeamProjectPrivilege,
  canUpdateTeamProjectMetadata,
} from '@/lib/team-project-auth'
import { validateSheetColumnLayout } from '@/lib/sheetColumnLayout'

async function assertCanManageSheetColumnLayout(projectId: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('id').eq('email', session.email).maybeSingle()
  if (!profile) throw new Error('Unauthorized')

  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, workspace_type, team_id, pm_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) throw new Error('Not found')

  if (project.workspace_type === 'personal') {
    if (project.owner_id !== profile.id) throw new Error('Forbidden')
    return
  }

  const priv = await resolveTeamProjectPrivilege(supabase, profile.id, project)
  if (!canUpdateTeamProjectMetadata(priv)) throw new Error('Forbidden')
}

export async function getProjectSheetColumnLayoutsAction(
  projectId: string
): Promise<Partial<Record<string, SheetColumn[]>>> {
  const supabase = await createClient()
  const session = await getSession()
  if (!session) return {}

  const { data: profile } = await supabase.from('profiles').select('id').eq('email', session.email).maybeSingle()
  if (!profile) return {}

  const { data: project } = await supabase
    .from('projects')
    .select('owner_id, workspace_type, team_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) return {}

  if (project.workspace_type === 'personal') {
    if (project.owner_id !== profile.id) return {}
  } else if (project.team_id) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('profile_id', profile.id)
      .eq('team_id', project.team_id)
      .maybeSingle()
    if (!membership) return {}
  } else return {}

  const { data, error } = await supabase
    .from('project_sheet_column_layouts')
    .select('tab_id, columns')
    .eq('project_id', projectId)

  if (error || !data) return {}

  const out: Partial<Record<string, SheetColumn[]>> = {}
  for (const row of data as { tab_id: string; columns: unknown }[]) {
    const cols = row.columns
    if (Array.isArray(cols) && cols.length > 0) {
      out[row.tab_id] = cols as SheetColumn[]
    }
  }
  return out
}

export async function saveProjectSheetColumnLayoutAction(
  projectId: string,
  tabId: string,
  columns: SheetColumn[]
): Promise<void> {
  await assertCanManageSheetColumnLayout(projectId)

  const err = validateSheetColumnLayout(tabId, columns)
  if (err) throw new Error(err)

  const supabase = await createClient()

  if (!columns.length) {
    await supabase.from('project_sheet_column_layouts').delete().eq('project_id', projectId).eq('tab_id', tabId)
    return
  }

  const { error } = await supabase.from('project_sheet_column_layouts').upsert(
    {
      project_id: projectId,
      tab_id: tabId,
      columns: columns as unknown as Record<string, unknown>[],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id,tab_id' }
  )

  if (error) throw new Error(error.message || 'Failed to save column layout')
}
