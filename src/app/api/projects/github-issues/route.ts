import { listProjectGitHubIssuesAction } from '@/server/github/linkTaskIssue'
import { apiError, apiJson, errorMessage } from '@/lib/api/response'

/**
 * GET /api/projects/github-issues?projectId=...&state=open|closed|all
 * Lists issues from the project's default GitHub repo for the Link dropdown.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')?.trim()
  const stateParam = searchParams.get('state')?.trim() ?? 'open'
  const state =
    stateParam === 'closed' || stateParam === 'all' || stateParam === 'open'
      ? stateParam
      : 'open'

  if (!projectId) {
    return apiError('projectId is required', 400)
  }

  try {
    const result = await listProjectGitHubIssuesAction(projectId, state)
    return apiJson(result)
  } catch (err) {
    const message = errorMessage(err)
    const status =
      message === 'Unauthorized'
        ? 401
        : message.startsWith('Forbidden')
          ? 403
          : message.includes('not found')
            ? 404
            : message.includes('required') || message.includes('GITHUB_')
              ? 400
              : 500
    return apiError(message, status)
  }
}
