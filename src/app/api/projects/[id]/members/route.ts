import { assignProjectMemberAction, removeProjectMemberAction } from '@/server/projects'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  const body = await readJsonBody<{ profileId: string; role: string }>(request)
  if (!body?.profileId || !body.role) {
    return apiError('profileId and role are required', 400)
  }
  try {
    await assignProjectMemberAction(projectId, body.profileId, body.role)
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  const profileId = new URL(request.url).searchParams.get('profileId')
  if (!profileId) return apiError('profileId is required', 400)
  try {
    await removeProjectMemberAction(projectId, profileId)
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
