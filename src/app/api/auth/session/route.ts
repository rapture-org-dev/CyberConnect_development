import { getSession } from '@/server/auth'
import { apiJson } from '@/lib/api/response'

export async function GET() {
  const session = await getSession()
  return apiJson(session)
}
