import {
  getProjectsAction,
  createProjectAction,
} from '@/server/projects'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'
import type { Project } from '@/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') as 'team' | 'personal' | null
  const teamId = searchParams.get('teamId') ?? undefined
  const teamSlug = searchParams.get('teamSlug') ?? undefined
  if (!scope || (scope !== 'team' && scope !== 'personal')) {
    return apiError('scope must be team or personal', 400)
  }
  try {
    const projects = await getProjectsAction(scope, teamId, teamSlug)
    return apiJson(projects)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody<Partial<Project>>(request)
  if (!body) return apiError('Invalid body', 400)
  const result = await createProjectAction(body)
  if (!result.success) {
    return apiJson(result, 400)
  }
  return apiJson(result, 201)
}
