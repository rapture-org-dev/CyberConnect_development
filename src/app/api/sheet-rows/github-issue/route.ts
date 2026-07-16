import {
  createGitHubIssueForTaskAction,
  linkGitHubIssueToTaskAction,
  unlinkGitHubIssueFromTaskAction,
  refreshGitHubIssueForTaskAction,
  pushTaskStatusToGitHubAction,
} from '@/server/github/linkTaskIssue'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'

type Body = {
  projectId?: string
  rowId?: string
  action?: 'create' | 'link' | 'unlink' | 'refresh' | 'push-status'
  issueUrl?: string
  /** owner/repo when creating into a non-primary project repo */
  createRepo?: string
}

export async function POST(request: Request) {
  const body = await readJsonBody<Body>(request)
  if (!body?.projectId || !body?.rowId || !body?.action) {
    return apiError('projectId, rowId, and action are required', 400)
  }

  try {
    if (body.action === 'create') {
      const result = await createGitHubIssueForTaskAction(
        body.projectId,
        body.rowId,
        body.createRepo
      )
      return apiJson(result)
    }

    if (body.action === 'link') {
      if (!body.issueUrl?.trim()) {
        return apiError('issueUrl is required for link action', 400)
      }
      const result = await linkGitHubIssueToTaskAction(
        body.projectId,
        body.rowId,
        body.issueUrl
      )
      return apiJson(result)
    }

    if (body.action === 'unlink') {
      const row = await unlinkGitHubIssueFromTaskAction(body.projectId, body.rowId)
      return apiJson({ row, created: false })
    }

    if (body.action === 'refresh') {
      const result = await refreshGitHubIssueForTaskAction(body.projectId, body.rowId)
      return apiJson(result)
    }

    if (body.action === 'push-status') {
      const result = await pushTaskStatusToGitHubAction(body.projectId, body.rowId)
      return apiJson(result)
    }

    return apiError('action must be create, link, unlink, refresh, or push-status', 400)
  } catch (err) {
    const message = errorMessage(err)
    const status =
      message === 'Unauthorized'
        ? 401
        : message.startsWith('Forbidden')
          ? 403
          : message.includes('not found') || message.includes('not linked')
            ? 404
            : message.includes('required') ||
                message.includes('Invalid') ||
                message.includes('already linked')
              ? 400
              : 500
    return apiError(message, status)
  }
}
