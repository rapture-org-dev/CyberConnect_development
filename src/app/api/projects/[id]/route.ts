import {
  getProjectByIdAction,
  updateProjectAction,
  deleteProjectAction,
} from '@/server/projects'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'
import type { Project } from '@/types'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const project = await getProjectByIdAction(id)
  return apiJson(project)
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await readJsonBody<Partial<Project>>(request)
  if (!body) return apiError('Invalid body', 400)
  try {
    const updated = await updateProjectAction(id, body)
    return apiJson(updated)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  try {
    await deleteProjectAction(id)
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
