import { isDeepLEligibleBilingualField } from '@/lib/bilingualFields'
import { getBilingualRowFieldKey } from '@/lib/data'
import { deeplTranslateText, isDeepLAutoTranslateEnabled } from '@/server/deepl'

export async function translateBilingualFieldAction(
  tabId: string,
  enKey: string,
  sourceLang: 'en' | 'ja',
  text: string
): Promise<{ en: string; ja: string }> {
  const jaKey = getBilingualRowFieldKey(tabId, enKey)
  if (!jaKey) {
    throw new Error('Not a bilingual field')
  }
  if (!isDeepLEligibleBilingualField(tabId, enKey)) {
    throw new Error('This field cannot be translated')
  }
  if (!isDeepLAutoTranslateEnabled()) {
    throw new Error('DeepL is not configured (set DEEPL_AUTH_KEY)')
  }

  const source = text.trim()
  if (!source) {
    return { en: '', ja: '' }
  }

  if (sourceLang === 'en') {
    const ja = await deeplTranslateText(source, 'JA', 'EN')
    return { en: source, ja }
  }
  const en = await deeplTranslateText(source, 'EN', 'JA')
  return { en, ja: source }
}
