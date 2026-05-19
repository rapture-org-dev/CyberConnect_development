import {
  getSheetRowsAction,
  upsertSheetRowAction,
  deleteSheetRowAction,
} from '@/server/rows'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'
import type { SheetRow } from '@/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const tabId = searchParams.get('tabId')
  if (!projectId || !tabId) {
    return apiError('projectId and tabId are required', 400)
  }
  try {
    const rows = await getSheetRowsAction(projectId, tabId)
    return apiJson(rows)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}

export async function PUT(request: Request) {
  const body = await readJsonBody<{
    tabId: string
    row: Partial<SheetRow> & { id: string; project_id: string }
  }>(request)
  if (!body?.tabId || !body.row) return apiError('tabId and row are required', 400)
  try {
    const saved = await upsertSheetRowAction(body.tabId, body.row)
    return apiJson(saved)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const tabId = searchParams.get('tabId')
  const projectId = searchParams.get('projectId')
  const rowId = searchParams.get('rowId')
  if (!tabId || !projectId || !rowId) {
    return apiError('tabId, projectId, and rowId are required', 400)
  }
  try {
    await deleteSheetRowAction(tabId, projectId, rowId)
    return apiJson({ ok: true })
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
