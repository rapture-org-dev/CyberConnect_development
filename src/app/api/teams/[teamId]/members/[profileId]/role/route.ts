import { setTeamMemberRoleAction } from '@/server/teams'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ teamId: string; profileId: string }> }
) {
  const { teamId, profileId } = await context.params
  const body = await readJsonBody<{ role: 'admin' | 'member' }>(request)
  if (!body?.role) return apiError('role is required', 400)
  try {
    await setTeamMemberRoleAction(teamId, profileId, body.role)
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
