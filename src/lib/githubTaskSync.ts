import {
  GITHUB_ISSUE_NUMBER_KEY,
  GITHUB_ISSUE_STATE_KEY,
  GITHUB_ISSUE_URL_KEY,
  GITHUB_ISSUE_OWNER_KEY,
  GITHUB_ISSUE_REPO_KEY,
  taskGitHubIssuePatch,
} from '@/lib/githubTaskLink'

/** Phase 2 sync rules (GitHub issue state ↔ task status). */
export const TASK_STATUS_DONE = 'Done'
export const TASK_STATUS_IN_PROGRESS = 'In progress'

export type IssueState = 'open' | 'closed'

export function normalizeIssueState(state: string): IssueState {
  return state === 'closed' ? 'closed' : 'open'
}

/**
 * Apply GitHub issue state onto a task row patch.
 * Rule: GitHub wins for github_issue_state; closed → Done; reopen from Done → In progress.
 */
export function buildTaskPatchFromGitHubState(
  row: Record<string, unknown>,
  issue: { number: number; htmlUrl: string; state: string; owner?: string; repo?: string }
): Record<string, unknown> {
  const state = normalizeIssueState(issue.state)
  const link = taskGitHubIssuePatch({ ...issue, state })
  const patch: Record<string, unknown> = { ...link }

  const currentStatus = String(row.status ?? '').trim()

  if (state === 'closed') {
    if (currentStatus !== TASK_STATUS_DONE) {
      patch.status = TASK_STATUS_DONE
    }
    const completed = row.completed_date
    if (completed === null || completed === undefined || String(completed).trim() === '') {
      patch.completed_date = new Date().toISOString().slice(0, 10)
    }
  } else if (currentStatus === TASK_STATUS_DONE) {
    patch.status = TASK_STATUS_IN_PROGRESS
  }

  return patch
}

/** Desired GitHub issue state from CyberConnect task status. */
export function desiredGitHubStateFromTaskStatus(status: unknown): IssueState {
  return String(status ?? '').trim() === TASK_STATUS_DONE ? 'closed' : 'open'
}

export function mergeExtrasWithGitHubFields(
  existingExtras: unknown,
  fields: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existingExtras && typeof existingExtras === 'object' && !Array.isArray(existingExtras)
      ? { ...(existingExtras as Record<string, unknown>) }
      : {}

  for (const key of [
    GITHUB_ISSUE_NUMBER_KEY,
    GITHUB_ISSUE_URL_KEY,
    GITHUB_ISSUE_STATE_KEY,
    GITHUB_ISSUE_OWNER_KEY,
    GITHUB_ISSUE_REPO_KEY,
  ]) {
    if (key in fields) {
      const v = fields[key]
      if (v === '' || v === null || v === undefined) delete base[key]
      else base[key] = v
    }
  }
  return base
}
