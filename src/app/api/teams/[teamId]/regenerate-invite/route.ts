import { regenerateTeamInviteCodeAction } from '@/server/teams'
import { apiError, apiJson, errorMessage } from '@/lib/api/response'

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await context.params
  try {
    const code = await regenerateTeamInviteCodeAction(teamId)
    return apiJson({ inviteCode: code })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
