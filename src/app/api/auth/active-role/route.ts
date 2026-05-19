import { updateActiveRoleAction } from '@/server/auth'
import { apiError, apiJson, readJsonBody } from '@/lib/api/response'

export async function PATCH(request: Request) {
  const body = await readJsonBody<{ role: string; teamSlug?: string }>(request)
  if (!body?.role) return apiError('role is required', 400)
  await updateActiveRoleAction(body.role, body.teamSlug)
  return apiJson({ ok: true })
}
