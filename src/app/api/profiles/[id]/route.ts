import { getProfileById } from '@/server/profiles'
import { apiJson } from '@/lib/api/response'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const profile = await getProfileById(id)
  return apiJson(profile)
}
