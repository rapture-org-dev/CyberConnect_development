import type { SheetColumn, SheetTab } from '@/types';

/** Business keys that must stay in the layout for the sheet to work. */
export const REQUIRED_COLUMN_KEYS: Partial<Record<string, string[]>> = {
  tasks: ['task_code'],
  screen_list: ['screen_code'],
  function_list: ['function_code'],
}

const CUSTOM_KEY_RE = /^custom_[a-z0-9_]{1,48}$/

export function isCustomColumnKey(key: string): boolean {
  return CUSTOM_KEY_RE.test(key)
}

export function mergeTabWithLayout(base: SheetTab, layout: SheetColumn[] | null | undefined): SheetTab {
  if (!layout || !Array.isArray(layout) || layout.length === 0) {
    return base
  }

  const defaultByKey = new Map(base.columns.map((c) => [c.key, c]))
  const merged: SheetColumn[] = []

  for (const col of layout) {
    if (!col?.key || typeof col.key !== 'string') continue
    const d = defaultByKey.get(col.key)
    if (d) {
      merged.push({
        ...d,
        label: col.label ?? d.label,
        labelJa: col.labelJa ?? d.labelJa,
        width: typeof col.width === 'number' && col.width > 0 ? col.width : d.width,
        type: col.type ?? d.type,
        editable: col.editable !== undefined ? col.editable : d.editable,
        options: col.options ?? d.options,
      })
    } else if (isCustomColumnKey(col.key)) {
      const labelEn = col.label || col.key;
      const labelJa =
        col.labelJa === undefined || col.labelJa === null ? labelEn : col.labelJa;
      merged.push({
        key: col.key,
        label: labelEn,
        labelJa,
        width: typeof col.width === 'number' && col.width > 0 ? col.width : 160,
        type: col.type ?? 'text',
        editable: col.editable !== false,
        options: col.options,
      })
    }
  }

  if (merged.length === 0) return base
  return { ...base, columns: merged }
}

export function validateSheetColumnLayout(tabId: string, columns: SheetColumn[]): string | null {
  const required = REQUIRED_COLUMN_KEYS[tabId]
  if (required?.length) {
    const keys = new Set(columns.map((c) => c.key))
    for (const r of required) {
      if (!keys.has(r)) return `Missing required column: ${r}`
    }
  }
  for (const c of columns) {
    if (!c.key || typeof c.key !== 'string') return 'Each column needs a key'
    if (isCustomColumnKey(c.key)) continue
    if (!/^[a-z][a-z0-9_]+$/.test(c.key)) return `Invalid key: ${c.key}`
  }
  return null
}

export function generateCustomColumnKey(): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return `custom_${id}`
}
