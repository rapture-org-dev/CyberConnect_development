import { upsertSheetRowsBatchAction } from '@/server/rows'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'
import type { SheetRow } from '@/types'

export async function PUT(request: Request) {
  const body = await readJsonBody<{
    tabId: string
    projectId: string
    rows: SheetRow[]
  }>(request)
  if (!body?.tabId || !body.projectId || !body.rows) {
    return apiError('tabId, projectId, and rows are required', 400)
  }
  try {
    const saved = await upsertSheetRowsBatchAction(body.tabId, body.projectId, body.rows)
    return apiJson(saved)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
