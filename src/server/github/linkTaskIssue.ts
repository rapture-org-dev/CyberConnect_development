import { createClient } from '@/lib/supabase-server'
import { getSession } from '@/server/auth'
import {
  resolveTeamProjectPrivilege,
  type TeamProjectPrivilege,
} from '@/lib/team-project-auth'
import { upsertSheetRowAction, getSheetRowsAction } from '@/server/rows'
import type { SheetRow } from '@/types'
import {
  CYBERCONNECT_ISSUE_LABELS,
  readTaskGitHubIssue,
  resolveRepoForLinkedIssue,
  taskGitHubIssuePatch,
} from '@/lib/githubTaskLink'
import {
  createGitHubIssue,
  getGitHubIssue,
  listGitHubIssues,
  parseGitHubIssueInput,
  setGitHubIssueState,
  type GitHubIssueListItem,
} from '@/server/github/issues'
import { loadGitHubRepoForProject } from '@/server/github/projectRepo'
import { getEnvGitHubRepo, type GitHubRepoRef } from '@/lib/githubRepo'
import {
  buildTaskPatchFromGitHubState,
  desiredGitHubStateFromTaskStatus,
} from '@/lib/githubTaskSync'

export type LinkTaskGitHubIssueResult = {
  row: SheetRow
  issue: { number: number; htmlUrl: string; state: string }
  created: boolean
}

function optionalSection(title: string, value: string) {
  const v = value.trim()
  if (!v) return ''
  return `\n## ${title}\n\n${v}\n`
}

function buildIssueTitle(row: Record<string, unknown>) {
  const code = String(row.task_code ?? '').trim()
  const en = String(row.task ?? '').trim()
  const ja = String(row.task_ja ?? '').trim()
  const label = en || ja || 'Untitled task'
  return code ? `[${code}] ${label}` : label
}

function buildIssueBody(
  row: Record<string, unknown>,
  projectId: string,
  repoRef: GitHubRepoRef
) {
  return `## CyberConnect task

- Project ID: \`${projectId}\`
- Task code: \`${String(row.task_code ?? '').trim() || '—'}\`
- Status: ${String(row.status ?? '—')}
- Sprint: ${String(row.sprint ?? '').trim() || '—'}
- Epic: ${String(row.epic ?? '').trim() || '—'}
- Repo: ${repoRef.owner}/${repoRef.repo}

## Task (EN)

${String(row.task ?? '').trim() || '—'}
${optionalSection('Task (JA)', String(row.task_ja ?? ''))}
${optionalSection('Remark', String(row.remark ?? ''))}
## Source

Created from CyberConnect Tasks sheet (link/create GitHub Issue).
`
}

async function assertCanLinkGitHubIssue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<void> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .maybeSingle()
  if (!profile) throw new Error('Unauthorized')

  const { data: project } = await supabase
    .from('projects')
    .select('id, team_id, workspace_type, pm_id, client_id, owner_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new Error('Project not found')

  if (project.workspace_type === 'personal') {
    if (project.owner_id === profile.id) return
    throw new Error('Forbidden')
  }

  if (!project.team_id) throw new Error('Forbidden')

  const priv: TeamProjectPrivilege = await resolveTeamProjectPrivilege(supabase, profile.id, {
    id: project.id,
    team_id: project.team_id,
    workspace_type: project.workspace_type,
    pm_id: project.pm_id,
    client_id: project.client_id,
  })

  if (priv === 'team_manage' || priv === 'project_pm' || priv === 'project_dev') return
  throw new Error('Forbidden: Only PM, developers, or admins can link GitHub issues')
}

async function loadTaskRow(projectId: string, rowId: string): Promise<SheetRow> {
  const rows = await getSheetRowsAction(projectId, 'tasks')
  const row = rows.find((r) => r.id === rowId)
  if (!row) throw new Error('Task row not found')
  return row
}

export async function createGitHubIssueForTaskAction(
  projectId: string,
  rowId: string
): Promise<LinkTaskGitHubIssueResult> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const row = await loadTaskRow(projectId, rowId)
  const existing = readTaskGitHubIssue(row as Record<string, unknown>)
  if (existing.github_issue_url) {
    throw new Error('This task is already linked to a GitHub issue. Unlink first or open the existing link.')
  }

  const repoRef = await loadGitHubRepoForProject(projectId, supabase)
  const issue = await createGitHubIssue(
    {
      title: buildIssueTitle(row as Record<string, unknown>),
      body: buildIssueBody(row as Record<string, unknown>, projectId, repoRef),
      labels: CYBERCONNECT_ISSUE_LABELS,
    },
    repoRef
  )

  const patch = taskGitHubIssuePatch({ ...issue, owner: repoRef.owner, repo: repoRef.repo })
  const saved = await upsertSheetRowAction('tasks', {
    ...(row as SheetRow),
    id: rowId,
    project_id: projectId,
    ...patch,
  })

  return { row: saved, issue, created: true }
}

export async function linkGitHubIssueToTaskAction(
  projectId: string,
  rowId: string,
  issueInput: string
): Promise<LinkTaskGitHubIssueResult> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const row = await loadTaskRow(projectId, rowId)
  const existing = readTaskGitHubIssue(row as Record<string, unknown>)
  if (existing.github_issue_url) {
    throw new Error('This task is already linked to a GitHub issue. Unlink first or open the existing link.')
  }

  // Full URL = any repo. Bare #123 = project/env default repo only.
  let defaultRepo: GitHubRepoRef | null = null
  try {
    defaultRepo = await loadGitHubRepoForProject(projectId, supabase)
  } catch {
    defaultRepo = getEnvGitHubRepo()
  }

  const parsed = parseGitHubIssueInput(issueInput, defaultRepo)
  if (!parsed) {
    throw new Error(
      'Invalid GitHub issue. Paste a full issue URL (any repo), or #123 if this project has a default repo.'
    )
  }

  const repoRef = { owner: parsed.owner, repo: parsed.repo }
  const issue = await getGitHubIssue(parsed.number, repoRef)
  const patch = taskGitHubIssuePatch({ ...issue, owner: repoRef.owner, repo: repoRef.repo })
  const saved = await upsertSheetRowAction('tasks', {
    ...(row as SheetRow),
    id: rowId,
    project_id: projectId,
    ...patch,
  })

  return { row: saved, issue, created: false }
}

export async function unlinkGitHubIssueFromTaskAction(
  projectId: string,
  rowId: string
): Promise<SheetRow> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const row = await loadTaskRow(projectId, rowId)
  return upsertSheetRowAction('tasks', {
    ...(row as SheetRow),
    id: rowId,
    project_id: projectId,
    github_issue_number: '',
    github_issue_url: '',
    github_issue_state: '',
    github_issue_owner: '',
    github_issue_repo: '',
  })
}

export async function refreshGitHubIssueForTaskAction(
  projectId: string,
  rowId: string
): Promise<LinkTaskGitHubIssueResult> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const row = await loadTaskRow(projectId, rowId)
  const existing = readTaskGitHubIssue(row as Record<string, unknown>)
  const issueNumber = Number(existing.github_issue_number)
  if (!existing.github_issue_url || !Number.isFinite(issueNumber) || issueNumber <= 0) {
    throw new Error('This task is not linked to a GitHub issue.')
  }

  let fallback: GitHubRepoRef | null = null
  try {
    fallback = await loadGitHubRepoForProject(projectId, supabase)
  } catch {
    fallback = getEnvGitHubRepo()
  }
  const repoRef = resolveRepoForLinkedIssue(existing, fallback)
  const issue = await getGitHubIssue(issueNumber, repoRef)
  const patch = buildTaskPatchFromGitHubState(row as Record<string, unknown>, {
    ...issue,
    owner: repoRef.owner,
    repo: repoRef.repo,
  })
  const saved = await upsertSheetRowAction('tasks', {
    ...(row as SheetRow),
    id: rowId,
    project_id: projectId,
    ...patch,
  })

  return { row: saved, issue, created: false }
}

/**
 * Push CyberConnect task status to GitHub:
 * Done → close issue; otherwise → reopen.
 * Uses the repo from the linked issue URL (any repo), not only project default.
 */
export async function pushTaskStatusToGitHubAction(
  projectId: string,
  rowId: string
): Promise<LinkTaskGitHubIssueResult> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const row = await loadTaskRow(projectId, rowId)
  const existing = readTaskGitHubIssue(row as Record<string, unknown>)
  const issueNumber = Number(existing.github_issue_number)
  if (!existing.github_issue_url || !Number.isFinite(issueNumber) || issueNumber <= 0) {
    throw new Error('This task is not linked to a GitHub issue.')
  }

  let fallback: GitHubRepoRef | null = null
  try {
    fallback = await loadGitHubRepoForProject(projectId, supabase)
  } catch {
    fallback = getEnvGitHubRepo()
  }
  const repoRef = resolveRepoForLinkedIssue(existing, fallback)
  const desired = desiredGitHubStateFromTaskStatus(row.status)
  const issue = await setGitHubIssueState(issueNumber, desired, repoRef)
  const patch = buildTaskPatchFromGitHubState(row as Record<string, unknown>, {
    ...issue,
    owner: repoRef.owner,
    repo: repoRef.repo,
  })
  const saved = await upsertSheetRowAction('tasks', {
    ...(row as SheetRow),
    id: rowId,
    project_id: projectId,
    ...patch,
  })

  return { row: saved, issue, created: false }
}

/** List issues from the project's default GitHub repo (for Link dropdown). */
export async function listProjectGitHubIssuesAction(
  projectId: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<{ repo: GitHubRepoRef; issues: GitHubIssueListItem[] }> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const repo = await loadGitHubRepoForProject(projectId, supabase)
  const issues = await listGitHubIssues(repo, { state, perPage: 50, maxPages: 2 })
  return { repo, issues }
}
