import { updateAccountKindAction } from '@/server/auth'
import { apiError, apiJson, readJsonBody } from '@/lib/api/response'

export async function PATCH(request: Request) {
  const body = await readJsonBody<{ accountKind: 'team' | 'personal' }>(request)
  if (!body?.accountKind) return apiError('accountKind is required', 400)
  await updateAccountKindAction(body.accountKind)
  return apiJson({ ok: true })
}
