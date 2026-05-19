import { updateTeamAction } from '@/server/teams'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await context.params
  const body = await readJsonBody<{ name?: string }>(request)
  if (!body) return apiError('Invalid body', 400)
  try {
    const team = await updateTeamAction(teamId, body)
    return apiJson(team)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
