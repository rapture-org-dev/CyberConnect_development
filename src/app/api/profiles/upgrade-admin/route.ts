import { upgradeToAdminAction } from '@/server/profiles'
import { apiJson, apiError, errorMessage } from '@/lib/api/response'

export async function POST() {
  try {
    await upgradeToAdminAction()
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
