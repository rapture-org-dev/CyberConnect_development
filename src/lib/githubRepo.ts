export type GitHubRepoRef = {
  owner: string
  repo: string
}

/** Parse `owner/repo` or a github.com URL. */
export function parseGitHubOwnerRepo(input: string): GitHubRepoRef | null {
  let raw = input.trim()
  if (!raw) return null

  raw = raw.replace(/^https?:\/\/(www\.)?github\.com\//i, '')
  raw = raw.replace(/\.git$/i, '')
  raw = raw.replace(/\/$/, '')

  const parts = raw.split('/').filter(Boolean)
  if (parts.length < 2) return null

  const owner = parts[0]!.trim()
  const repo = parts[1]!.trim()
  if (!owner || !repo) return null
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null

  return { owner, repo }
}

export function formatGitHubOwnerRepo(owner?: string | null, repo?: string | null): string {
  const o = String(owner ?? '').trim()
  const r = String(repo ?? '').trim()
  if (!o || !r) return ''
  return `${o}/${r}`
}

export function repoRefKey(ref: GitHubRepoRef): string {
  return `${ref.owner}/${ref.repo}`.toLowerCase()
}

export function dedupeGitHubRepos(refs: GitHubRepoRef[]): GitHubRepoRef[] {
  const seen = new Set<string>()
  const out: GitHubRepoRef[] = []
  for (const ref of refs) {
    const key = repoRefKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

/** Parse jsonb / string[] / mixed list of owner/repo or URLs. */
export function parseGitHubReposList(raw: unknown): GitHubRepoRef[] {
  if (raw == null) return []

  const items: string[] = []
  if (typeof raw === 'string') {
    items.push(
      ...raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        items.push(item)
      } else if (item && typeof item === 'object') {
        const o = item as { owner?: unknown; repo?: unknown; full?: unknown }
        if (typeof o.full === 'string') items.push(o.full)
        else if (o.owner && o.repo) items.push(`${o.owner}/${o.repo}`)
      }
    }
  }

  const refs: GitHubRepoRef[] = []
  for (const item of items) {
    const parsed = parseGitHubOwnerRepo(item)
    if (!parsed) {
      throw new Error(
        `Invalid GitHub repository "${item}". Use owner/repo (e.g. rapture-org-dev/MyApp).`
      )
    }
    refs.push(parsed)
  }
  return dedupeGitHubRepos(refs)
}

/**
 * Normalize project GitHub bindings.
 * Accepts multi-repo list (`github_repos` / multiline `github_full`) plus legacy single fields.
 * First repo is stored as github_owner/github_repo for backward compatibility.
 */
export function normalizeProjectGitHubFields(input: {
  github_owner?: string | null
  github_repo?: string | null
  github_full?: string | null
  github_repos?: unknown
}): { github_owner: string; github_repo: string; github_repos: string[] } {
  let refs: GitHubRepoRef[] = []

  if (input.github_repos !== undefined && input.github_repos !== null) {
    refs = parseGitHubReposList(input.github_repos)
  }

  const full = String(input.github_full ?? '').trim()
  if (full) {
    // Multiline or comma-separated in the single field
    if (full.includes('\n') || full.includes(',')) {
      refs = dedupeGitHubRepos([...refs, ...parseGitHubReposList(full)])
    } else {
      const parsed = parseGitHubOwnerRepo(full)
      if (!parsed) {
        throw new Error('Invalid GitHub repository. Use owner/repo (e.g. rapture-org-dev/MyApp).')
      }
      refs = dedupeGitHubRepos([...refs, parsed])
    }
  }

  const legacyOwner = String(input.github_owner ?? '').trim()
  const legacyRepo = String(input.github_repo ?? '').trim()
  if (legacyOwner && legacyRepo) {
    refs = dedupeGitHubRepos([...refs, { owner: legacyOwner, repo: legacyRepo }])
  }

  const primary = refs[0]
  return {
    github_owner: primary?.owner ?? '',
    github_repo: primary?.repo ?? '',
    github_repos: refs.map((r) => formatGitHubOwnerRepo(r.owner, r.repo)),
  }
}

export function getEnvGitHubRepo(): GitHubRepoRef | null {
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  if (owner && repo) return { owner, repo }
  return null
}

/** All repos bound to the project (list + legacy), else env default as a one-item list. */
export function listGitHubReposForProject(project: {
  github_owner?: string | null
  github_repo?: string | null
  github_repos?: unknown
}): GitHubRepoRef[] {
  let refs: GitHubRepoRef[] = []
  try {
    refs = parseGitHubReposList(project.github_repos)
  } catch {
    refs = []
  }

  const owner = String(project.github_owner ?? '').trim()
  const repo = String(project.github_repo ?? '').trim()
  if (owner && repo) {
    refs = dedupeGitHubRepos([...refs, { owner, repo }])
  }

  if (refs.length > 0) return refs

  const env = getEnvGitHubRepo()
  return env ? [env] : []
}

/** Primary (first) repo; throws if none configured. */
export function resolveGitHubRepoFromProject(project: {
  github_owner?: string | null
  github_repo?: string | null
  github_repos?: unknown
}): GitHubRepoRef {
  const list = listGitHubReposForProject(project)
  if (list[0]) return list[0]
  throw new Error(
    'GitHub repository is not configured. Set one or more repos on the project (owner/repo) or GITHUB_OWNER/GITHUB_REPO env.'
  )
}

export function projectHasGitHubRepo(
  project: {
    github_owner?: string | null
    github_repo?: string | null
    github_repos?: unknown
  },
  target: GitHubRepoRef
): boolean {
  const key = repoRefKey(target)
  return listGitHubReposForProject(project).some((r) => repoRefKey(r) === key)
}

export function formatProjectGitHubReposLabel(project: {
  github_owner?: string | null
  github_repo?: string | null
  github_repos?: unknown
}): string {
  const list = listGitHubReposForProject(project)
  if (list.length === 0) return ''
  if (list.length === 1) return formatGitHubOwnerRepo(list[0]!.owner, list[0]!.repo)
  return `${list.length} repos · ${formatGitHubOwnerRepo(list[0]!.owner, list[0]!.repo)} +${list.length - 1}`
}
