import { getNextTaskCodeAction } from '@/server/rows'
import { apiError, apiJson, errorMessage } from '@/lib/api/response'

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId')
  if (!projectId) return apiError('projectId is required', 400)
  try {
    const code = await getNextTaskCodeAction(projectId)
    return apiJson({ taskCode: code })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
