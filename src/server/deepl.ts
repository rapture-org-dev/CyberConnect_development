/**
 * DeepL API client (server-only). Configure via DEEPL_AUTH_KEY and DEEPL_API_URL.
 */

const DEFAULT_FREE_API_URL = 'https://api-free.deepl.com'
const MAX_RETRIES = 5
/** DeepL allows many `text` params per request; keep conservative for URL size. */
const MAX_TEXTS_PER_REQUEST = 40

export function isDeepLAutoTranslateEnabled(): boolean {
  if (process.env.DEEPL_AUTO_TRANSLATE === 'false') return false
  const key = process.env.DEEPL_AUTH_KEY?.trim()
  return Boolean(key)
}

function getApiBaseUrl(): string {
  const fromEnv = process.env.DEEPL_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return DEFAULT_FREE_API_URL
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postTranslate(body: URLSearchParams): Promise<Response> {
  const authKey = process.env.DEEPL_AUTH_KEY?.trim()
  if (!authKey) throw new Error('DEEPL_AUTH_KEY is not configured')

  let attempt = 0
  while (attempt < MAX_RETRIES) {
    const res = await fetch(`${getApiBaseUrl()}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${authKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      const waitSec = retryAfter ? Number.parseInt(retryAfter, 10) : NaN
      const waitMs = Number.isFinite(waitSec) && waitSec > 0
        ? waitSec * 1000
        : Math.min(60_000, 1500 * 2 ** attempt)
      await sleep(waitMs)
      attempt += 1
      continue
    }

    return res
  }

  throw new Error('DeepL API error 429: rate limit exceeded after retries')
}

function parseTranslateResponse(json: { translations?: { text?: string }[] }): string[] {
  const list = json.translations ?? []
  return list.map((t) => (typeof t.text === 'string' ? t.text : ''))
}

/**
 * Translate multiple strings in one API call (same target/source language).
 */
export async function deeplTranslateMany(
  texts: string[],
  targetLang: 'EN' | 'JA',
  sourceLang?: 'EN' | 'JA'
): Promise<string[]> {
  const trimmed = texts.map((t) => t.trim()).filter((t) => t.length > 0)
  if (trimmed.length === 0) return []

  const results: string[] = []
  for (let i = 0; i < trimmed.length; i += MAX_TEXTS_PER_REQUEST) {
    const chunk = trimmed.slice(i, i + MAX_TEXTS_PER_REQUEST)
    const body = new URLSearchParams()
    for (const t of chunk) body.append('text', t)
    body.set('target_lang', targetLang)
    if (sourceLang) body.set('source_lang', sourceLang)

    const res = await postTranslate(body)
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`DeepL API error ${res.status}: ${errText.slice(0, 200)}`)
    }
    const json = (await res.json()) as { translations?: { text?: string }[] }
    results.push(...parseTranslateResponse(json))
    if (i + MAX_TEXTS_PER_REQUEST < trimmed.length) {
      await sleep(250)
    }
  }
  return results
}

export async function deeplTranslateText(
  text: string,
  targetLang: 'EN' | 'JA',
  sourceLang?: 'EN' | 'JA'
): Promise<string> {
  const [one] = await deeplTranslateMany([text], targetLang, sourceLang)
  return one ?? ''
}
