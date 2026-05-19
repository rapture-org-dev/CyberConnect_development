import { isTeamOwnerAction } from '@/server/teams'
import { apiJson } from '@/lib/api/response'

export async function GET() {
  const isOwner = await isTeamOwnerAction()
  return apiJson({ isOwner })
}
