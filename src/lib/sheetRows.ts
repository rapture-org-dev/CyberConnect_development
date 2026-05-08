import type { SheetRow } from '@/types'

/** Flatten `extras` jsonb into the row shape returned to the client. */
export function mergeExtrasIntoSheetRow(row: Record<string, unknown>): SheetRow {
  const { extras: rawExtras, ...rest } = row
  const ex =
    rawExtras && typeof rawExtras === 'object' && !Array.isArray(rawExtras)
      ? (rawExtras as Record<string, unknown>)
      : {}
  return { ...rest, ...ex } as SheetRow
}
