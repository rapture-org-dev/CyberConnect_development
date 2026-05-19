import { getProfiles } from '@/server/profiles'
import { apiJson, errorMessage, apiError } from '@/lib/api/response'

export async function GET() {
  try {
    const profiles = await getProfiles()
    return apiJson(profiles)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
