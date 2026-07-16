import { handleGitHubIssuesWebhook } from '@/server/github/webhook'
import { apiError, apiJson, errorMessage } from '@/lib/api/response'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  const eventName = request.headers.get('x-github-event')

  try {
    const result = await handleGitHubIssuesWebhook(rawBody, signature, eventName)
    return apiJson(result)
  } catch (err) {
    const message = errorMessage(err)
    const status =
      message.includes('Invalid GitHub webhook signature')
        ? 401
        : message.includes('required')
          ? 500
          : 400
    return apiError(message, status)
  }
}
