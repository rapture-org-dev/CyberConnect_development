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

export function normalizeProjectGitHubFields(input: {
  github_owner?: string | null
  github_repo?: string | null
  github_full?: string | null
}): { github_owner: string; github_repo: string } {
  const full = String(input.github_full ?? '').trim()
  if (full) {
    const parsed = parseGitHubOwnerRepo(full)
    if (!parsed) {
      throw new Error('Invalid GitHub repository. Use owner/repo (e.g. rapture-org-dev/MyApp).')
    }
    return { github_owner: parsed.owner, github_repo: parsed.repo }
  }

  return {
    github_owner: String(input.github_owner ?? '').trim(),
    github_repo: String(input.github_repo ?? '').trim(),
  }
}

export function getEnvGitHubRepo(): GitHubRepoRef | null {
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  if (owner && repo) return { owner, repo }
  return null
}

/** Project columns win; otherwise env defaults. */
export function resolveGitHubRepoFromProject(project: {
  github_owner?: string | null
  github_repo?: string | null
}): GitHubRepoRef {
  const owner = String(project.github_owner ?? '').trim()
  const repo = String(project.github_repo ?? '').trim()
  if (owner && repo) return { owner, repo }

  const env = getEnvGitHubRepo()
  if (env) return env

  throw new Error(
    'GitHub repository is not configured. Set it on the project (owner/repo) or GITHUB_OWNER/GITHUB_REPO env.'
  )
}
