import { joinTeamByInviteCodeAction } from '@/server/teams'
import { apiError, apiJson, readJsonBody } from '@/lib/api/response'

export async function POST(request: Request) {
  const body = await readJsonBody<{ code: string }>(request)
  if (!body?.code) return apiError('code is required', 400)
  const result = await joinTeamByInviteCodeAction(body.code)
  return apiJson(result)
}
