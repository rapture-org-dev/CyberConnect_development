import { headers } from 'next/headers'

/**
 * Server Components: call this app's REST API with the incoming request cookies.
 */
export async function serverApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const cookie = h.get('cookie') ?? ''
  const url = `${proto}://${host}${path}`

  const res = await fetch(url, {
    ...init,
    headers: {
      cookie,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? res.statusText)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}
