import type { GitHubRepoRef } from '@/lib/githubRepo'

/** Stored on task_rows via `extras` jsonb (no migration required for MVP). */
export const GITHUB_ISSUE_NUMBER_KEY = 'github_issue_number'
export const GITHUB_ISSUE_URL_KEY = 'github_issue_url'
export const GITHUB_ISSUE_STATE_KEY = 'github_issue_state'
export const GITHUB_ISSUE_OWNER_KEY = 'github_issue_owner'
export const GITHUB_ISSUE_REPO_KEY = 'github_issue_repo'

export const CYBERCONNECT_ISSUE_LABELS = ['source:cyberconnect', 'type:task']

export type TaskGitHubIssueFields = {
  github_issue_number: string
  github_issue_url: string
  github_issue_state: string
  github_issue_owner: string
  github_issue_repo: string
}

export function readTaskGitHubIssue(row: Record<string, unknown>): TaskGitHubIssueFields {
  return {
    github_issue_number: String(row[GITHUB_ISSUE_NUMBER_KEY] ?? '').trim(),
    github_issue_url: String(row[GITHUB_ISSUE_URL_KEY] ?? '').trim(),
    github_issue_state: String(row[GITHUB_ISSUE_STATE_KEY] ?? '').trim(),
    github_issue_owner: String(row[GITHUB_ISSUE_OWNER_KEY] ?? '').trim(),
    github_issue_repo: String(row[GITHUB_ISSUE_REPO_KEY] ?? '').trim(),
  }
}

export function taskGitHubIssuePatch(issue: {
  number: number
  htmlUrl: string
  state: string
  owner?: string
  repo?: string
}): TaskGitHubIssueFields {
  let owner = String(issue.owner ?? '').trim()
  let repo = String(issue.repo ?? '').trim()
  if ((!owner || !repo) && issue.htmlUrl) {
    const parsed = parseOwnerRepoFromIssueUrl(issue.htmlUrl)
    if (parsed) {
      owner = parsed.owner
      repo = parsed.repo
    }
  }
  return {
    github_issue_number: String(issue.number),
    github_issue_url: issue.htmlUrl,
    github_issue_state: issue.state,
    github_issue_owner: owner,
    github_issue_repo: repo,
  }
}

export function parseOwnerRepoFromIssueUrl(url: string): GitHubRepoRef | null {
  try {
    const u = new URL(url.trim())
    if (!u.hostname.endsWith('github.com')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length >= 4 && parts[2] === 'issues') {
      return { owner: parts[0]!, repo: parts[1]! }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Prefer stored owner/repo, then URL, then fallback (project/env). */
export function resolveRepoForLinkedIssue(
  linked: TaskGitHubIssueFields,
  fallback?: GitHubRepoRef | null
): GitHubRepoRef {
  if (linked.github_issue_owner && linked.github_issue_repo) {
    return { owner: linked.github_issue_owner, repo: linked.github_issue_repo }
  }
  const fromUrl = linked.github_issue_url
    ? parseOwnerRepoFromIssueUrl(linked.github_issue_url)
    : null
  if (fromUrl) return fromUrl
  if (fallback?.owner && fallback?.repo) return fallback
  throw new Error('Cannot determine GitHub repository for this linked issue.')
}
