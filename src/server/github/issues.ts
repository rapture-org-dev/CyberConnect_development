import type { GitHubRepoRef } from '@/lib/githubRepo'
import { getEnvGitHubRepo } from '@/lib/githubRepo'

export type CreateGitHubIssueInput = {
  title: string
  body: string
  labels?: string[]
}

export type GitHubIssueRef = {
  number: number
  htmlUrl: string
  state: 'open' | 'closed'
}

type GitHubIssueApiResponse = {
  number?: number
  html_url?: string
  state?: string
  title?: string
  message?: string
  pull_request?: unknown
}

type FetchLike = typeof fetch

const GITHUB_API_VERSION = '2022-11-28'

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

/** @deprecated Prefer resolveGitHubRepoFromProject / explicit GitHubRepoRef */
export function getConfiguredGitHubRepo(): GitHubRepoRef {
  const env = getEnvGitHubRepo()
  if (!env) throw new Error('GITHUB_OWNER and GITHUB_REPO are required')
  return env
}

async function getGitHubIssuesToken() {
  return requiredEnv('GITHUB_ISSUES_TOKEN')
}

function mapIssueResponse(data: GitHubIssueApiResponse): GitHubIssueRef {
  if (typeof data.number !== 'number' || !data.html_url) {
    throw new Error('GitHub API response did not include an issue URL')
  }
  const state = data.state === 'closed' ? 'closed' : 'open'
  return {
    number: data.number,
    htmlUrl: data.html_url,
    state,
  }
}

async function postGitHubIssue(
  repoRef: GitHubRepoRef,
  token: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike
) {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: JSON.stringify(body),
    }
  )
  const data = (await response.json().catch(() => ({}))) as GitHubIssueApiResponse
  return { response, data }
}

export async function createGitHubIssue(
  input: CreateGitHubIssueInput,
  repoRef: GitHubRepoRef,
  fetchImpl: FetchLike = fetch
): Promise<GitHubIssueRef> {
  const token = await getGitHubIssuesToken()
  const labels = input.labels ?? []

  let { response, data } = await postGitHubIssue(
    repoRef,
    token,
    { title: input.title, body: input.body, labels },
    fetchImpl
  )

  if (!response.ok && labels.length > 0) {
    const msg = String(data.message ?? '').toLowerCase()
    if (msg.includes('label') || response.status === 422) {
      ;({ response, data } = await postGitHubIssue(
        repoRef,
        token,
        { title: input.title, body: input.body },
        fetchImpl
      ))
    }
  }

  if (!response.ok) {
    throw new Error(data.message ? `GitHub API error: ${data.message}` : 'GitHub API error')
  }

  return mapIssueResponse(data)
}

export async function getGitHubIssue(
  issueNumber: number,
  repoRef: GitHubRepoRef,
  fetchImpl: FetchLike = fetch
): Promise<GitHubIssueRef> {
  const token = await getGitHubIssuesToken()
  const response = await fetchImpl(
    `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/issues/${issueNumber}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      cache: 'no-store',
    }
  )

  const data = (await response.json().catch(() => ({}))) as GitHubIssueApiResponse
  if (!response.ok) {
    throw new Error(data.message ? `GitHub API error: ${data.message}` : 'GitHub API error')
  }

  return mapIssueResponse(data)
}

export async function setGitHubIssueState(
  issueNumber: number,
  state: 'open' | 'closed',
  repoRef: GitHubRepoRef,
  fetchImpl: FetchLike = fetch
): Promise<GitHubIssueRef> {
  const token = await getGitHubIssuesToken()
  const response = await fetchImpl(
    `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: JSON.stringify({ state }),
    }
  )

  const data = (await response.json().catch(() => ({}))) as GitHubIssueApiResponse
  if (!response.ok) {
    throw new Error(data.message ? `GitHub API error: ${data.message}` : 'GitHub API error')
  }

  return mapIssueResponse(data)
}

export type GitHubIssueListItem = {
  number: number
  title: string
  htmlUrl: string
  state: 'open' | 'closed'
}

/**
 * List issues for a repo (excludes PRs). Fetches up to `maxPages` pages of `perPage`.
 * Default: open issues first (state=open).
 */
export async function listGitHubIssues(
  repoRef: GitHubRepoRef,
  options?: { state?: 'open' | 'closed' | 'all'; perPage?: number; maxPages?: number },
  fetchImpl: FetchLike = fetch
): Promise<GitHubIssueListItem[]> {
  const token = await getGitHubIssuesToken()
  const state = options?.state ?? 'open'
  const perPage = Math.min(Math.max(options?.perPage ?? 50, 1), 100)
  const maxPages = Math.min(Math.max(options?.maxPages ?? 2, 1), 5)
  const out: GitHubIssueListItem[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(
      `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/issues`
    )
    url.searchParams.set('state', state)
    url.searchParams.set('per_page', String(perPage))
    url.searchParams.set('page', String(page))
    url.searchParams.set('sort', 'updated')
    url.searchParams.set('direction', 'desc')

    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      cache: 'no-store',
    })

    const data = (await response.json().catch(() => null)) as
      | GitHubIssueApiResponse[]
      | GitHubIssueApiResponse
    if (!response.ok) {
      const msg =
        data && !Array.isArray(data) && data.message
          ? data.message
          : 'GitHub API error'
      throw new Error(`GitHub API error: ${msg}`)
    }

    const batch = Array.isArray(data) ? data : []
    for (const item of batch) {
      if (item.pull_request) continue
      if (typeof item.number !== 'number' || !item.html_url) continue
      out.push({
        number: item.number,
        title: String(item.title ?? '').trim() || `(#${item.number})`,
        htmlUrl: item.html_url,
        state: item.state === 'closed' ? 'closed' : 'open',
      })
    }

    if (batch.length < perPage) break
  }

  return out
}

/** Parse any GitHub issue URL (any repo) or `#123` / `123` (uses defaultRepo). */
export function parseGitHubIssueInput(
  input: string,
  defaultRepo?: GitHubRepoRef | null
): { number: number; owner: string; repo: string } | null {
  const raw = input.trim()
  if (!raw) return null

  const bare = raw.match(/^#?(\d+)$/)
  if (bare) {
    const n = Number(bare[1])
    if (!Number.isFinite(n) || n <= 0) return null
    if (!defaultRepo?.owner || !defaultRepo?.repo) {
      throw new Error(
        'Issue number alone needs a project/default GitHub repo. Paste a full issue URL instead (any repo).'
      )
    }
    return { number: n, owner: defaultRepo.owner, repo: defaultRepo.repo }
  }

  try {
    const url = new URL(raw)
    if (!url.hostname.endsWith('github.com')) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 4 && parts[2] === 'issues') {
      const n = Number(parts[3])
      if (!Number.isFinite(n) || n <= 0) return null
      return { number: n, owner: parts[0]!, repo: parts[1]! }
    }
  } catch {
    /* ignore */
  }

  return null
}

/** @deprecated use parseGitHubIssueInput */
export function parseGitHubIssueRef(
  input: string,
  owner: string,
  repo: string
): number | null {
  const parsed = parseGitHubIssueInput(input, { owner, repo })
  return parsed?.number ?? null
}
