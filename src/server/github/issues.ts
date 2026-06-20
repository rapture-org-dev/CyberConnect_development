export type CreateGitHubIssueInput = {
  title: string
  body: string
  labels: string[]
}

export type CreatedGitHubIssue = {
  number: number
  htmlUrl: string
}

type GitHubIssueApiResponse = {
  number?: number
  html_url?: string
  message?: string
}

type FetchLike = typeof fetch

const GITHUB_API_VERSION = '2022-11-28'

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function getGitHubIssuesToken() {
  return requiredEnv('GITHUB_ISSUES_TOKEN')
}

export async function createGitHubIssue(
  input: CreateGitHubIssueInput,
  fetchImpl: FetchLike = fetch,
): Promise<CreatedGitHubIssue> {
  const owner = requiredEnv('GITHUB_OWNER')
  const repo = requiredEnv('GITHUB_REPO')
  const token = await getGitHubIssuesToken()
  const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: input.labels,
    }),
  })

  const data = (await response.json().catch(() => ({}))) as GitHubIssueApiResponse
  if (!response.ok) {
    throw new Error(data.message ? `GitHub API error: ${data.message}` : 'GitHub API error')
  }

  if (typeof data.number !== 'number' || !data.html_url) {
    throw new Error('GitHub API response did not include an issue URL')
  }

  return {
    number: data.number,
    htmlUrl: data.html_url,
  }
}
