import { logoutAction } from '@/server/auth'
import { apiJson } from '@/lib/api/response'

export async function POST() {
  await logoutAction()
  return apiJson({ ok: true })
}
