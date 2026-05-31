'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import type { SheetColumn, SheetTab } from '@/types';
import { generateCustomColumnKey, REQUIRED_COLUMN_KEYS } from '@/lib/sheetColumnLayout';
import { saveProjectSheetColumnLayoutAction } from '@/lib/api/client';
import { translate, type Language } from '@/lib/data';

const COL_TYPES: SheetColumn['type'][] = [
  'text',
  'longtext',
  'number',
  'date',
  'code',
  'status',
  'select',
  'assignee',
];

function cloneColumns(cols: SheetColumn[]): SheetColumn[] {
  return cols.map((c) => ({
    ...c,
    options: c.options ? [...c.options] : undefined,
  }));
}

function parseOptions(input: string): string[] | undefined {
  const parts = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

interface Props {
  open: boolean;
  tab: SheetTab;
  projectId: string;
  language: Language;
  onClose: () => void;
  onSaved: () => void;
}

export function SheetColumnManagerModal({
  open,
  tab,
  projectId,
  language,
  onClose,
  onSaved,
}: Props) {
  const [columns, setColumns] = useState<SheetColumn[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const required = new Set(REQUIRED_COLUMN_KEYS[tab.id] ?? []);

  useEffect(() => {
    if (open) {
      setColumns(cloneColumns(tab.columns));
      setError('');
    }
  }, [open, tab]);

  if (!open) return null;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    const t = next[i]!;
    next[i] = next[j]!;
    next[j] = t;
    setColumns(next);
  };

  const update = (i: number, patch: Partial<SheetColumn>) => {
    setColumns((prev) => {
      const next = [...prev];
      const cur = next[i];
      if (!cur) return prev;
      next[i] = { ...cur, ...patch };
      return next;
    });
  };

  const remove = (i: number) => {
    const col = columns[i];
    if (!col || required.has(col.key)) return;
    setColumns((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addCustom = () => {
    setColumns((prev) => [
      ...prev,
      {
        key: generateCustomColumnKey(),
        label: 'Custom field',
        labelJa: 'カスタム項目',
        width: 160,
        type: 'text',
        editable: true,
      },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await saveProjectSheetColumnLayoutAction(projectId, tab.id, columns);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('Save failed', language));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        language === 'ja'
          ? '列設定を既定に戻しますか？'
          : 'Reset all column changes to the default layout for this sheet?'
      )
    ) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveProjectSheetColumnLayoutAction(projectId, tab.id, []);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('Save failed', language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {language === 'ja' ? '列の管理' : 'Manage columns'}
            </h2>
            <p className="text-xs text-gray-500">
              {language === 'ja' ? tab.nameJa : tab.name} · {tab.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-surface-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <p className="mb-3 text-xs text-gray-500">
            {language === 'ja'
              ? 'ラベル (EN) とラベル (JA) はそれぞれ独立して編集できます。'
              : 'Label (EN) and Label (JA) can be edited independently.'}
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addCustom}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {language === 'ja' ? '列を追加' : 'Add column'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-600 px-3 py-2 text-sm text-gray-300 hover:bg-surface-800 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {language === 'ja' ? '既定に戻す' : 'Reset to default'}
            </button>
          </div>

          <ul className="space-y-3">
            {columns.map((col, i) => (
              <li
                key={`${col.key}-${i}`}
                className="rounded-xl border border-surface-700 bg-surface-950/50 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <code className="truncate text-xs text-brand-400">{col.key}</code>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || saving}
                      className="rounded p-1 text-gray-500 hover:bg-surface-800 hover:text-white disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === columns.length - 1 || saving}
                      className="rounded p-1 text-gray-500 hover:bg-surface-800 hover:text-white disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={required.has(col.key) || saving}
                      className="rounded p-1 text-gray-500 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-30"
                      title={
                        required.has(col.key)
                          ? language === 'ja'
                            ? '必須列'
                            : 'Required column'
                          : undefined
                      }
                      aria-label="Remove column"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block text-xs text-gray-500">
                    {language === 'ja' ? 'ラベル (EN)' : 'Label (EN)'}
                    <input
                      value={col.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="block text-xs text-gray-500">
                    {language === 'ja' ? 'ラベル (JA)' : 'Label (JA)'}
                    <input
                      value={col.labelJa}
                      onChange={(e) => update(i, { labelJa: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="block text-xs text-gray-500">
                    {language === 'ja' ? '幅 (px)' : 'Width (px)'}
                    <input
                      type="number"
                      min={60}
                      max={800}
                      value={col.width}
                      onChange={(e) => update(i, { width: Math.max(60, Number(e.target.value) || 120) })}
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="block text-xs text-gray-500">
                    {language === 'ja' ? '型' : 'Type'}
                    <select
                      value={col.type}
                      onChange={(e) =>
                        update(i, { type: e.target.value as SheetColumn['type'], options: undefined })
                      }
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-sm text-white"
                    >
                      {COL_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {(col.type === 'select' || col.type === 'status') && (
                  <label className="mt-2 block text-xs text-gray-500">
                    {language === 'ja' ? '選択肢 (カンマ区切り)' : 'Options (comma-separated)'}
                    <input
                      value={(col.options ?? []).join(', ')}
                      onChange={(e) => update(i, { options: parseOptions(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-sm text-white"
                      placeholder="A, B, C"
                    />
                  </label>
                )}
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={col.editable}
                    onChange={(e) => update(i, { editable: e.target.checked })}
                    className="rounded border-surface-600 text-brand-500"
                  />
                  {language === 'ja' ? '編集可能' : 'Editable'}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-700 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-surface-800"
          >
            {language === 'ja' ? 'キャンセル' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? '…' : language === 'ja' ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
