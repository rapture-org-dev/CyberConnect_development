import { loginAction } from '@/server/auth'
import { apiError, apiJson, readJsonBody } from '@/lib/api/response'

type Body = {
  email: string
  role: string
  accountKind: 'team' | 'personal'
  activeWorkspaceRole?: string
  activeTeamSlug?: string
  accessToken?: string
  refreshToken?: string
}

export async function POST(request: Request) {
  const body = await readJsonBody<Body>(request)
  if (!body?.email || !body.role || !body.accountKind) {
    return apiError('email, role, and accountKind are required', 400)
  }
  await loginAction(
    body.email,
    body.role,
    body.accountKind,
    body.activeWorkspaceRole,
    body.activeTeamSlug,
    body.accessToken,
    body.refreshToken
  )
  return apiJson({ ok: true })
}
