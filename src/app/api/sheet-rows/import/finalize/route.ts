import { finalizeImportRows } from '@/server/rows'
import type { FinalizeImportRowsOptions } from '@/server/rows'
import type { ConflictChoice } from '@/types'
import { apiError, apiJson, errorMessage, readJsonBody } from '@/lib/api/response'
import type { SheetRow } from '@/types'

export async function POST(request: Request) {
  const body = await readJsonBody<{
    projectId: string
    tabId: string
    rowsToImport: SheetRow[]
    conflictResolutions: ConflictChoice[]
    options?: FinalizeImportRowsOptions
  }>(request)
  if (!body?.projectId || !body.tabId || !body.rowsToImport) {
    return apiError('projectId, tabId, and rowsToImport are required', 400)
  }
  try {
    const result = await finalizeImportRows(
      body.projectId,
      body.tabId,
      body.rowsToImport,
      body.conflictResolutions ?? [],
      body.options
    )
    return apiJson(result)
  } catch (err) {
    return apiError(errorMessage(err), 500)
  }
}
