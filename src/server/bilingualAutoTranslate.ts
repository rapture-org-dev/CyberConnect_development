import {
  applyMirroredBilingualFields,
  collectBilingualFieldPairs,
  detectTextLanguage,
  isDeepLEligibleBilingualField,
  type BilingualFieldPair,
} from '@/lib/bilingualFields'
import { deeplTranslateMany, isDeepLAutoTranslateEnabled } from '@/server/deepl'

function str(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

type PendingJob = {
  pair: BilingualFieldPair
  sourceText: string
  detected: 'en' | 'ja'
}

function collectPendingJobs(
  tabId: string,
  pairs: BilingualFieldPair[],
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null
): PendingJob[] {
  const jobs: PendingJob[] = []

  for (const pair of pairs) {
    if (!isDeepLEligibleBilingualField(tabId, pair.enKey)) continue

    const { enKey, jaKey } = pair
    const en = str(incoming[enKey])
    const ja = str(incoming[jaKey])
    const exEn = str(existing?.[enKey])
    const exJa = str(existing?.[jaKey])

    const enChanged = en !== exEn
    const jaChanged = ja !== exJa
    if (!enChanged && !jaChanged) continue

    let sourceText = ''
    if (enChanged && !jaChanged) sourceText = en
    else if (jaChanged && !enChanged) sourceText = ja
    else if (enChanged && jaChanged) {
      sourceText = en.length >= ja.length ? en : ja
    } else {
      continue
    }

    if (!sourceText) {
      incoming[enKey] = ''
      incoming[jaKey] = ''
      continue
    }

    jobs.push({ pair, sourceText, detected: detectTextLanguage(sourceText) })
  }

  return jobs
}

async function runPendingJobs(jobs: PendingJob[], incoming: Record<string, unknown>): Promise<void> {
  if (jobs.length === 0) return

  const toJa = jobs.filter((j) => j.detected === 'en')
  const toEn = jobs.filter((j) => j.detected === 'ja')

  try {
    if (toJa.length > 0) {
      const translated = await deeplTranslateMany(
        toJa.map((j) => j.sourceText),
        'JA',
        'EN'
      )
      toJa.forEach((job, i) => {
        incoming[job.pair.enKey] = job.sourceText
        incoming[job.pair.jaKey] = translated[i] ?? job.sourceText
      })
    }
    if (toEn.length > 0) {
      const translated = await deeplTranslateMany(
        toEn.map((j) => j.sourceText),
        'EN',
        'JA'
      )
      toEn.forEach((job, i) => {
        incoming[job.pair.jaKey] = job.sourceText
        incoming[job.pair.enKey] = translated[i] ?? job.sourceText
      })
    }
  } catch (e) {
    console.error('DeepL batch translation failed:', e)
    for (const job of jobs) {
      if (job.detected === 'en') {
        incoming[job.pair.enKey] = job.sourceText
      } else {
        incoming[job.pair.jaKey] = job.sourceText
      }
    }
  }
}

/**
 * Detect language of user text, store in EN or JA column, fill partner via DeepL.
 */
export async function applyBilingualAutoTranslateToRow(
  tabId: string,
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null
): Promise<void> {
  applyMirroredBilingualFields(tabId, incoming, existing)

  if (!isDeepLAutoTranslateEnabled()) return

  const pairs = collectBilingualFieldPairs(tabId, incoming)
  const jobs = collectPendingJobs(tabId, pairs, incoming, existing)
  await runPendingJobs(jobs, incoming)
}

const IMPORT_ROW_DELAY_MS = 120

export async function applyBilingualAutoTranslateBatch(
  tabId: string,
  payloads: Record<string, unknown>[],
  existingById: Map<string, Record<string, unknown>>
): Promise<void> {
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i]
    const id = String(payload.id ?? '')
    const existing = id ? existingById.get(id) ?? null : null
    await applyBilingualAutoTranslateToRow(tabId, payload, existing)
    if (i < payloads.length - 1) {
      await new Promise((r) => setTimeout(r, IMPORT_ROW_DELAY_MS))
    }
  }
}
