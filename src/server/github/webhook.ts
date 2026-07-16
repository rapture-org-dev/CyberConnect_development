import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase-admin'
import { mergeExtrasIntoSheetRow } from '@/lib/sheetRows'
import {
  GITHUB_ISSUE_NUMBER_KEY,
  GITHUB_ISSUE_STATE_KEY,
  parseOwnerRepoFromIssueUrl,
  readTaskGitHubIssue,
  resolveRepoForLinkedIssue,
} from '@/lib/githubTaskLink'
import {
  buildTaskPatchFromGitHubState,
  mergeExtrasWithGitHubFields,
  normalizeIssueState,
} from '@/lib/githubTaskSync'
import { getEnvGitHubRepo, listGitHubReposForProject, repoRefKey } from '@/lib/githubRepo'

type GitHubWebhookIssue = {
  number?: number
  html_url?: string
  state?: string
  pull_request?: unknown
}

type GitHubIssuesWebhookPayload = {
  action?: string
  issue?: GitHubWebhookIssue
  repository?: {
    name?: string
    owner?: { login?: string }
  }
}

export function verifyGitHubWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET is required')
  if (!signatureHeader?.startsWith('sha256=')) return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const received = signatureHeader.slice('sha256='.length)
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(received, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Projects that include this repo in their bound list (or env fallback). */
async function findProjectIdsForRepo(owner: string, repo: string): Promise<string[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, github_owner, github_repo, github_repos')
  if (error) throw new Error(error.message)

  const targetKey = repoRefKey({ owner, repo })
  const env = getEnvGitHubRepo()
  return (data ?? [])
    .filter((p) => {
      const list = listGitHubReposForProject(p)
      if (list.some((r) => repoRefKey(r) === targetKey)) return true
      if (list.length === 0 && env) {
        return repoRefKey(env) === targetKey
      }
      return false
    })
    .map((p) => String(p.id))
}

function rowMatchesWebhookRepo(
  merged: Record<string, unknown>,
  owner: string,
  repo: string
): boolean {
  const linked = readTaskGitHubIssue(merged)
  try {
    const resolved = resolveRepoForLinkedIssue(linked, null)
    return resolved.owner === owner && resolved.repo === repo
  } catch {
    const fromUrl = linked.github_issue_url
      ? parseOwnerRepoFromIssueUrl(linked.github_issue_url)
      : null
    return Boolean(fromUrl && fromUrl.owner === owner && fromUrl.repo === repo)
  }
}

/**
 * Find linked tasks for this issue in any project:
 * match by issue number + stored owner/repo (or URL), not only project default repo.
 */
async function findTaskRowsForWebhookIssue(owner: string, repo: string, issueNumber: number) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('task_rows')
    .select('*')
    .filter(`extras->>${GITHUB_ISSUE_NUMBER_KEY}`, 'eq', String(issueNumber))

  if (error) throw new Error(error.message)

  const matched = ((data ?? []) as Record<string, unknown>[]).filter((raw) => {
    const merged = mergeExtrasIntoSheetRow(raw) as Record<string, unknown>
    return rowMatchesWebhookRepo(merged, owner, repo)
  })

  if (matched.length > 0) return matched

  // Legacy fallback: projects bound to this repo with matching issue number
  // but missing URL/owner (should be rare).
  const projectIds = await findProjectIdsForRepo(owner, repo)
  if (projectIds.length === 0) return []

  return ((data ?? []) as Record<string, unknown>[]).filter((raw) => {
    const projectId = String(raw.project_id ?? '')
    if (!projectIds.includes(projectId)) return false
    const merged = mergeExtrasIntoSheetRow(raw) as Record<string, unknown>
    const linked = readTaskGitHubIssue(merged)
    // Only if we cannot tell repo from link — otherwise already handled above
    try {
      resolveRepoForLinkedIssue(linked, null)
      return false
    } catch {
      return true
    }
  })
}

async function applyGitHubIssueToLinkedTasks(
  rows: Record<string, unknown>[],
  issue: { number: number; htmlUrl: string; state: string; owner: string; repo: string }
) {
  if (rows.length === 0) {
    return { updated: 0, skipped: 0 }
  }

  const supabase = createServiceRoleClient()
  let updated = 0
  let skipped = 0

  for (const raw of rows) {
    const merged = mergeExtrasIntoSheetRow(raw) as Record<string, unknown>
    const patch = buildTaskPatchFromGitHubState(merged, issue)

    const prevState = String(merged[GITHUB_ISSUE_STATE_KEY] ?? '').trim()
    const prevStatus = String(merged.status ?? '').trim()
    const nextState = String(patch[GITHUB_ISSUE_STATE_KEY] ?? '')
    const nextStatus = patch.status !== undefined ? String(patch.status) : prevStatus

    const statusChanged = patch.status !== undefined && prevStatus !== nextStatus
    const stateChanged = prevState !== nextState
    const completedChanged = patch.completed_date !== undefined

    if (!stateChanged && !statusChanged && !completedChanged) {
      skipped += 1
      continue
    }

    const extras = mergeExtrasWithGitHubFields(raw.extras, patch)
    const { error } = await supabase
      .from('task_rows')
      .update({
        status: patch.status !== undefined ? patch.status : raw.status,
        completed_date:
          patch.completed_date !== undefined ? patch.completed_date : raw.completed_date,
        extras,
      })
      .eq('id', raw.id)

    if (error) throw new Error(error.message)
    updated += 1
  }

  return { updated, skipped }
}

export async function handleGitHubIssuesWebhook(
  rawBody: string,
  signatureHeader: string | null,
  eventName: string | null
): Promise<{ ok: true; updated: number; skipped: number; ignored?: string }> {
  if (!verifyGitHubWebhookSignature(rawBody, signatureHeader)) {
    throw new Error('Invalid GitHub webhook signature')
  }

  if (eventName && eventName !== 'issues' && eventName !== 'ping') {
    return { ok: true, updated: 0, skipped: 0, ignored: `event:${eventName}` }
  }

  const payload = JSON.parse(rawBody) as GitHubIssuesWebhookPayload

  if (eventName === 'ping' || !payload.issue) {
    return { ok: true, updated: 0, skipped: 0, ignored: 'ping' }
  }

  if (payload.issue.pull_request) {
    return { ok: true, updated: 0, skipped: 0, ignored: 'pull_request' }
  }

  const payloadOwner = payload.repository?.owner?.login
  const payloadRepo = payload.repository?.name
  if (!payloadOwner || !payloadRepo) {
    throw new Error('Webhook missing repository owner/name')
  }

  const action = payload.action ?? ''
  if (!['opened', 'reopened', 'closed', 'edited'].includes(action)) {
    return { ok: true, updated: 0, skipped: 0, ignored: `action:${action}` }
  }

  const number = payload.issue.number
  const htmlUrl = payload.issue.html_url
  const state = normalizeIssueState(String(payload.issue.state ?? 'open'))
  if (typeof number !== 'number' || !htmlUrl) {
    throw new Error('Webhook issue payload missing number/url')
  }

  const rows = await findTaskRowsForWebhookIssue(payloadOwner, payloadRepo, number)
  if (rows.length === 0) {
    return { ok: true, updated: 0, skipped: 0, ignored: 'no_matching_task' }
  }

  const result = await applyGitHubIssueToLinkedTasks(rows, {
    number,
    htmlUrl,
    state,
    owner: payloadOwner,
    repo: payloadRepo,
  })

  return { ok: true, ...result }
}
