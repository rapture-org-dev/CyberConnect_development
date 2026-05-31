import { translateBilingualFieldAction } from '@/server/translateBilingualField'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tabId?: string
      enKey?: string
      sourceLang?: 'en' | 'ja'
      text?: string
    }
    const { tabId, enKey, sourceLang, text } = body
    if (!tabId || !enKey || (sourceLang !== 'en' && sourceLang !== 'ja') || typeof text !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const result = await translateBilingualFieldAction(tabId, enKey, sourceLang, text)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Translation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
