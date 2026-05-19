import { getMyTeamMembershipsAction } from '@/server/profiles'
import { apiJson } from '@/lib/api/response'

export async function GET() {
  const memberships = await getMyTeamMembershipsAction()
  return apiJson(memberships)
}
