import { updateTeamProjectCoreDetailsAction } from '@/server/projects'
import type { TeamProjectCoreDetailsInput } from '@/server/projects'
import { apiError, apiJson, readJsonBody } from '@/lib/api/response'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await readJsonBody<TeamProjectCoreDetailsInput>(request)
  if (!body) return apiError('Invalid body', 400)
  const result = await updateTeamProjectCoreDetailsAction(id, body)
  const status = result.success ? 200 : 400
  return apiJson(result, status)
}
