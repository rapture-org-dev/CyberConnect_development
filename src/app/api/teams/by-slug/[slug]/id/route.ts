import { getTeamIdBySlugAction } from '@/server/projects'
import { apiJson } from '@/lib/api/response'

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params
  const teamId = await getTeamIdBySlugAction(slug)
  return apiJson({ teamId })
}
