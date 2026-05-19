import { getMyProfileAction, updateMyProfileAction } from '@/server/profiles'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'
import type { UserProfile } from '@/types'

export async function GET() {
  const profile = await getMyProfileAction()
  return apiJson(profile)
}

export async function PATCH(request: Request) {
  const body = await readJsonBody<Partial<Pick<UserProfile, 'name' | 'department' | 'avatar_url'>>>(request)
  if (!body) return apiError('Invalid body', 400)
  try {
    const updated = await updateMyProfileAction(body)
    return apiJson(updated)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
