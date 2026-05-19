import { clearRoleSessionAction } from '@/server/auth'
import { apiJson } from '@/lib/api/response'

export async function POST() {
  await clearRoleSessionAction()
  return apiJson({ ok: true })
}
