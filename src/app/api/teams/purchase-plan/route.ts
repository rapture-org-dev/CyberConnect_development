import { purchaseTeamPlanAction } from '@/server/teams'
import { apiError, apiJson, readJsonBody } from '@/lib/api/response'

export async function POST(request: Request) {
  const body = await readJsonBody<{ teamName: string; teamSlug: string }>(request)
  if (!body?.teamName || !body.teamSlug) {
    return apiError('teamName and teamSlug are required', 400)
  }
  const result = await purchaseTeamPlanAction(body.teamName, body.teamSlug)
  return apiJson(result)
}
