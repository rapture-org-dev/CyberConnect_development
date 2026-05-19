import {
  getProjectSheetColumnLayoutsAction,
  saveProjectSheetColumnLayoutAction,
} from '@/server/sheetColumnLayout'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'
import type { SheetColumn } from '@/types'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  try {
    const layouts = await getProjectSheetColumnLayoutsAction(projectId)
    return apiJson(layouts)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  const body = await readJsonBody<{ tabId: string; columns: SheetColumn[] }>(request)
  if (!body?.tabId || body.columns === undefined) {
    return apiError('tabId and columns are required', 400)
  }
  try {
    await saveProjectSheetColumnLayoutAction(projectId, body.tabId, body.columns)
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
