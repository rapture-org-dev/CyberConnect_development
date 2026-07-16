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
import { loadGitHubRepoForProject, loadGitHubReposForProject } from '@/server/github/projectRepo'
import {
  getEnvGitHubRepo,
  parseGitHubOwnerRepo,
  type GitHubRepoRef,
} from '@/lib/githubRepo'
import {
  buildTaskPatchFromGitHubState,
  desiredGitHubStateFromTaskStatus,
} from '@/lib/githubTaskSync'
import { deeplTranslateMany, isDeepLAutoTranslateEnabled } from '@/server/deepl'

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
  rowId: string,
  createRepoFull?: string
): Promise<LinkTaskGitHubIssueResult> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const row = await loadTaskRow(projectId, rowId)
  const existing = readTaskGitHubIssue(row as Record<string, unknown>)
  if (existing.github_issue_url) {
    throw new Error('This task is already linked to a GitHub issue. Unlink first or open the existing link.')
  }

  const allowed = await loadGitHubReposForProject(projectId, supabase)
  let repoRef: GitHubRepoRef
  if (createRepoFull?.trim()) {
    const parsed = parseGitHubOwnerRepo(createRepoFull)
    if (!parsed) {
      throw new Error('Invalid create repository. Use owner/repo.')
    }
    const ok = allowed.some(
      (r) =>
        r.owner.toLowerCase() === parsed.owner.toLowerCase() &&
        r.repo.toLowerCase() === parsed.repo.toLowerCase()
    )
    if (!ok) {
      throw new Error(
        `Repository ${parsed.owner}/${parsed.repo} is not bound to this project. Add it in Edit Project.`
      )
    }
    repoRef = parsed
  } else {
    if (!allowed[0]) {
      throw new Error(
        'GitHub repository is not configured. Set one or more repos on the project or GITHUB_OWNER/GITHUB_REPO env.'
      )
    }
    repoRef = allowed[0]
  }

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

/** Translate titles in order; empty titles stay empty. Failures return originals. */
async function maybeTranslateIssueTitles(
  titles: string[],
  displayLang: 'en' | 'ja' | undefined
): Promise<string[]> {
  if (displayLang !== 'en' || !isDeepLAutoTranslateEnabled() || titles.length === 0) {
    return titles
  }

  try {
    const indices: number[] = []
    const batch: string[] = []
    titles.forEach((title, i) => {
      const t = title.trim()
      if (t) {
        indices.push(i)
        batch.push(t)
      }
    })
    if (batch.length === 0) return titles

    const translated = await deeplTranslateMany(batch, 'EN')
    const out = [...titles]
    indices.forEach((idx, j) => {
      const next = translated[j]?.trim()
      if (next) out[idx] = next
    })
    return out
  } catch (err) {
    console.error('DeepL translate GitHub issue titles failed:', err)
    return titles
  }
}

/** List issues from all GitHub repos bound to the project (for Link dropdown). */
export async function listProjectGitHubIssuesAction(
  projectId: string,
  state: 'open' | 'closed' | 'all' = 'open',
  displayLang?: 'en' | 'ja'
): Promise<{
  repos: GitHubRepoRef[]
  issues: Array<GitHubIssueListItem & { owner: string; repo: string; titleOriginal?: string }>
}> {
  const supabase = await createClient()
  await assertCanLinkGitHubIssue(supabase, projectId)

  const repos = await loadGitHubReposForProject(projectId, supabase)
  if (repos.length === 0) {
    throw new Error(
      'GitHub repository is not configured. Set one or more repos on the project or GITHUB_OWNER/GITHUB_REPO env.'
    )
  }

  const issues: Array<
    GitHubIssueListItem & { owner: string; repo: string; titleOriginal?: string }
  > = []
  const errors: string[] = []

  for (const repo of repos) {
    try {
      const batch = await listGitHubIssues(repo, { state, perPage: 50, maxPages: 2 })
      for (const issue of batch) {
        issues.push({ ...issue, owner: repo.owner, repo: repo.repo })
      }
    } catch (err) {
      errors.push(
        `${repo.owner}/${repo.repo}: ${err instanceof Error ? err.message : 'failed'}`
      )
    }
  }

  if (issues.length === 0 && errors.length > 0) {
    throw new Error(`Could not load issues. ${errors.join(' | ')}`)
  }

  issues.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'open' ? -1 : 1
    return b.number - a.number
  })

  if (displayLang === 'en') {
    const originals = issues.map((i) => i.title)
    const translated = await maybeTranslateIssueTitles(originals, displayLang)
    for (let i = 0; i < issues.length; i += 1) {
      const item = issues[i]!
      item.titleOriginal = originals[i]
      item.title = translated[i] ?? item.title
    }
  }

  return { repos, issues }
}
