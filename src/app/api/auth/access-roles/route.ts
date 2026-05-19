import { getUserAccessRolesAction } from '@/server/auth'
import { apiError, apiJson } from '@/lib/api/response'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const teamSlug = searchParams.get('teamSlug') ?? undefined
  if (!userId) return apiError('userId is required', 400)
  const roles = await getUserAccessRolesAction(userId, teamSlug)
  return apiJson(roles)
}
