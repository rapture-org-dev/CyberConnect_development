import {
  bilingualRowFieldMap,
  getBilingualRowFieldKey,
  sheetTabs,
  translate,
  type Language,
} from '@/lib/data'
import { isCustomColumnKey } from '@/lib/sheetColumnLayout'

export type BilingualFieldPair = { enKey: string; jaKey: string }

/** EN → JA keys for a sheet tab (from `bilingualRowFieldMap`). */
export function getBilingualPairsForTab(tabId: string): BilingualFieldPair[] {
  const map = bilingualRowFieldMap[tabId]
  if (!map) return []
  return Object.entries(map).map(([enKey, jaKey]) => ({ enKey, jaKey }))
}

/** Tab pairs plus custom `col_*` / `col_*_ja` keys present on the row. */
export function collectBilingualFieldPairs(
  tabId: string,
  row: Record<string, unknown>
): BilingualFieldPair[] {
  const pairs = [...getBilingualPairsForTab(tabId)]
  const seenEn = new Set(pairs.map((p) => p.enKey))

  for (const key of Object.keys(row)) {
    if (!isCustomColumnKey(key)) continue
    const jaKey = getBilingualRowFieldKey(tabId, key)
    if (!jaKey || seenEn.has(key)) continue
    seenEn.add(key)
    pairs.push({ enKey: key, jaKey })
  }

  return pairs
}

/**
 * Bilingual fields that must stay identical in EN and JA (e.g. Phase = MVP in both columns).
 * Never sent to DeepL.
 */
const MIRRORED_BILINGUAL_FIELD_KEYS: Record<string, string[]> = {
  tasks: ['phase'],
  function_list: ['phase'],
}

export function isMirroredBilingualField(tabId: string, enKey: string): boolean {
  return MIRRORED_BILINGUAL_FIELD_KEYS[tabId]?.includes(enKey) ?? false
}

/** Phase etc.: show stored enum value (MVP) in EN and JP grid — not UI strings like MVP（最小版）. */
export function formatSelectCellDisplayValue(
  tabId: string,
  colKey: string,
  value: string,
  language: Language
): string {
  if (!value) return value
  if (isMirroredBilingualField(tabId, colKey)) return value
  if (language === 'en') return value
  return translate(value, language)
}

/** Copy the same value to EN and JA columns when either side changes (no translation). */
export function applyMirroredBilingualFields(
  tabId: string,
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null
): void {
  const keys = MIRRORED_BILINGUAL_FIELD_KEYS[tabId]
  if (!keys?.length) return

  for (const enKey of keys) {
    const jaKey = getBilingualRowFieldKey(tabId, enKey)
    if (!jaKey) continue

    const en = str(incoming[enKey])
    const ja = str(incoming[jaKey])
    const exEn = str(existing?.[enKey])
    const exJa = str(existing?.[jaKey])

    if (en === exEn && ja === exJa) continue

    const value = en || ja
    incoming[enKey] = value
    incoming[jaKey] = value
  }
}

/** Only free-text sheet columns are sent to DeepL (not phase/status/select/code). */
export function isDeepLEligibleBilingualField(tabId: string, enKey: string): boolean {
  if (isMirroredBilingualField(tabId, enKey)) return false
  const tab = sheetTabs.find((t) => t.id === tabId)
  const col = tab?.columns.find((c) => c.key === enKey)
  if (col) {
    return col.type === 'text' || col.type === 'longtext'
  }
  if (isCustomColumnKey(enKey)) return true
  return false
}

/** Hiragana/katakana/CJK-heavy text → Japanese; otherwise English. */
export function detectTextLanguage(text: string): 'en' | 'ja' {
  const t = text.trim()
  if (!t) return 'en'

  let jp = 0
  let latin = 0
  for (const ch of t) {
    const c = ch.codePointAt(0) ?? 0
    if (
      (c >= 0x3040 && c <= 0x30ff) ||
      (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0xff00 && c <= 0xffef)
    ) {
      jp += 1
    } else if (
      (c >= 0x41 && c <= 0x5a) ||
      (c >= 0x61 && c <= 0x7a) ||
      (c >= 0x30 && c <= 0x39)
    ) {
      latin += 1
    }
  }
  if (jp > 0 && jp >= latin) return 'ja'
  return 'en'
}

/** Value shown in a single bilingual edit input (active language column only). */
export function getMergedBilingualFieldValue(
  row: Record<string, unknown>,
  enKey: string,
  jaKey: string,
  lang: 'en' | 'ja'
): string {
  if (lang === 'ja') return str(row[jaKey])
  return str(row[enKey])
}

function str(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

/** Update the EN or JA column for a single visible bilingual field (partner filled on save). */
export function applyUserBilingualInput(
  prev: Record<string, unknown>,
  enKey: string,
  jaKey: string,
  lang: 'en' | 'ja',
  value: string
): Record<string, unknown> {
  if (value.trim() === '') {
    return { ...prev, [enKey]: '', [jaKey]: '' }
  }
  if (lang === 'ja') return { ...prev, [jaKey]: value }
  return { ...prev, [enKey]: value }
}
