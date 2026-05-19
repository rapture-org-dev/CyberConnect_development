import { getTeamMembersAction } from '@/server/profiles'
import { apiError, apiJson, errorMessage } from '@/lib/api/response'

export async function GET(request: Request) {
  const teamId = new URL(request.url).searchParams.get('teamId')
  if (!teamId) return apiError('teamId is required', 400)
  try {
    const members = await getTeamMembersAction(teamId)
    return apiJson(members)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
