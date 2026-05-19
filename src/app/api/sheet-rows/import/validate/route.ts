import { validateAndMapImportRows } from '@/server/rows'
import type { ValidateImportRowsOptions } from '@/server/rows'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'

export async function POST(request: Request) {
  const body = await readJsonBody<{
    projectId: string
    tabId: string
    excelRows: Record<string, unknown>[]
    columnMapping: Record<string, string>
    options?: ValidateImportRowsOptions
  }>(request)
  if (!body?.projectId || !body.tabId || !body.excelRows || !body.columnMapping) {
    return apiError('projectId, tabId, excelRows, and columnMapping are required', 400)
  }
  try {
    const result = await validateAndMapImportRows(
      body.projectId,
      body.tabId,
      body.excelRows,
      body.columnMapping,
      body.options
    )
    return apiJson(result)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
