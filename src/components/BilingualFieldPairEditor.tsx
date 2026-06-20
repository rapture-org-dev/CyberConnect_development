'use client'

import { useState } from 'react'
import type { SheetColumn } from '@/types'
import { translate, type Language } from '@/lib/data'
import {
  isDeepLEligibleBilingualField,
  isMirroredBilingualField,
} from '@/lib/bilingualFields'
import { translateBilingualFieldAction } from '@/lib/api/client'
import { Loader2, Languages } from 'lucide-react'

type Props = {
  tabId: string
  col: SheetColumn
  enKey: string
  jaKey: string
  enValue: string
  jaValue: string
  editable: boolean
  disabled?: boolean
  language: Language
  size?: 'default' | 'large'
  onChange: (enKey: string, jaKey: string, en: string, ja: string) => void
}

const inputClass =
  'w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40'
const readOnlyClass =
  'text-sm text-gray-300 bg-surface-850 rounded-lg px-3 py-2 border border-surface-800 whitespace-pre-wrap min-h-[36px]'

export function BilingualFieldPairEditor({
  tabId,
  col,
  enKey,
  jaKey,
  enValue,
  jaValue,
  editable,
  disabled = false,
  language,
  size = 'default',
  onChange,
}: Props) {
  const [translating, setTranslating] = useState<'en' | 'ja' | null>(null)
  const [translateError, setTranslateError] = useState<string | null>(null)

  const canTranslate = isDeepLEligibleBilingualField(tabId, enKey)
  const isLong = col.type === 'longtext'
  const longTextRows = size === 'large' ? 8 : 4
  const longTextMinHeight = size === 'large' ? 'min-h-[180px]' : 'min-h-[100px]'

  const runTranslate = async (sourceLang: 'en' | 'ja') => {
    if (!canTranslate || !editable || disabled) return
    const sourceText = sourceLang === 'en' ? enValue : jaValue
    if (!sourceText.trim()) return
    setTranslateError(null)
    setTranslating(sourceLang)
    try {
      const result = await translateBilingualFieldAction(tabId, enKey, sourceLang, sourceText)
      onChange(enKey, jaKey, result.en, result.ja)
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : translate('Save failed', language))
    } finally {
      setTranslating(null)
    }
  }

  if (isMirroredBilingualField(tabId, enKey)) {
    return null
  }

  const enLabel = language === 'ja' ? '英語 (EN)' : 'English (EN)'
  const jaLabel = language === 'ja' ? '日本語 (JA)' : 'Japanese (JA)'
  const toJaLabel = language === 'ja' ? '英→日' : 'EN → JA'
  const toEnLabel = language === 'ja' ? '日→英' : 'JA → EN'

  const renderInput = (
    value: string,
    onValueChange: (v: string) => void,
    ariaLabel: string
  ) => {
    if (!editable) {
      return (
        <p className={`${readOnlyClass} ${isLong ? longTextMinHeight : ''}`}>
          {value || <span className="text-gray-600 italic">—</span>}
        </p>
      )
    }
    if (isLong) {
      return (
        <textarea
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled || translating !== null}
          rows={longTextRows}
          aria-label={ariaLabel}
          className={`${inputClass} resize-none ${longTextMinHeight}`}
        />
      )
    }
    return (
      <input
        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled || translating !== null}
        aria-label={ariaLabel}
        className={inputClass}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs text-gray-500">{enLabel}</span>
          {canTranslate && editable && (
            <button
              type="button"
              disabled={disabled || !enValue.trim() || translating !== null}
              onClick={() => runTranslate('en')}
              className="text-[10px] px-2 py-1 rounded-md border border-surface-600 text-gray-400 hover:text-brand-300 hover:border-brand-500/40 disabled:opacity-40 flex items-center gap-1"
            >
              {translating === 'en' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Languages className="w-3 h-3" />
              )}
              {toJaLabel}
            </button>
          )}
        </div>
        {renderInput(enValue, (v) => onChange(enKey, jaKey, v, jaValue), enLabel)}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs text-gray-500">{jaLabel}</span>
          {canTranslate && editable && (
            <button
              type="button"
              disabled={disabled || !jaValue.trim() || translating !== null}
              onClick={() => runTranslate('ja')}
              className="text-[10px] px-2 py-1 rounded-md border border-surface-600 text-gray-400 hover:text-brand-300 hover:border-brand-500/40 disabled:opacity-40 flex items-center gap-1"
            >
              {translating === 'ja' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Languages className="w-3 h-3" />
              )}
              {toEnLabel}
            </button>
          )}
        </div>
        {renderInput(jaValue, (v) => onChange(enKey, jaKey, enValue, v), jaLabel)}
      </div>

      {translateError && (
        <p className="text-[10px] text-red-400">{translateError}</p>
      )}
    </div>
  )
}
