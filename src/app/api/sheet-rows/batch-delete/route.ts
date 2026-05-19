import { deleteSheetRowsBatchAction } from '@/server/rows'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'

export async function POST(request: Request) {
  const body = await readJsonBody<{
    tabId: string
    projectId: string
    rowIds: string[]
  }>(request)
  if (!body?.tabId || !body.projectId || !body.rowIds) {
    return apiError('tabId, projectId, and rowIds are required', 400)
  }
  try {
    await deleteSheetRowsBatchAction(body.tabId, body.projectId, body.rowIds)
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
