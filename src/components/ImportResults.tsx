import { X, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import type { SheetRow } from '@/types';
import { translate, type Language } from '@/lib/data';

function formatFailReason(reason: unknown): string {
  if (reason == null) return 'Unknown error';
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message || 'Unknown error';
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    const m = (reason as { message: unknown }).message;
    return formatFailReason(m);
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

interface Props {
  successful: SheetRow[];
  failed: Array<{ rowData: Record<string, unknown>; reason: string }>;
  totalRows: number;
  duplicateCount: number;
  onClose: () => void;
  language?: Language;
}

export function ImportResults({
  successful,
  failed,
  totalRows,
  duplicateCount,
  onClose,
  language = 'en',
}: Props) {
  const total = successful.length + failed.length;
  const successRate = totalRows > 0 ? Math.round((successful.length / totalRows) * 100) : 0;
  const otherNotUploadedCount = Math.max(totalRows - successful.length - duplicateCount, 0);

  const outcome: 'success' | 'partial' | 'fail' | 'empty' =
    failed.length === 0 && successful.length > 0
      ? 'success'
      : successful.length > 0 && failed.length > 0
        ? 'partial'
        : failed.length > 0 && successful.length === 0
          ? 'fail'
          : 'empty';

  const outcomeVisual =
    outcome === 'success'
      ? {
          ring: 'border-emerald-500/35 bg-emerald-500/10',
          icon: <CheckCircle className="h-12 w-12 text-emerald-400" />,
          title: translate('Import succeeded', language),
          subtitle:
            language === 'ja'
              ? `${successful.length} 件を保存し、このシートを更新しました。`
              : `${successful.length} row${successful.length === 1 ? '' : 's'} saved and this sheet was updated.`,
        }
      : outcome === 'partial'
        ? {
            ring: 'border-amber-500/35 bg-amber-500/10',
            icon: <AlertTriangle className="h-12 w-12 text-amber-400" />,
            title: translate('Import completed with some errors', language),
            subtitle: translate('Import finished with some rows failed.', language),
          }
        : outcome === 'fail'
          ? {
              ring: 'border-red-500/35 bg-red-500/10',
              icon: <AlertCircle className="h-12 w-12 text-red-400" />,
              title: translate('Import failed', language),
              subtitle: translate('Import failed — no rows were saved.', language),
            }
          : {
              ring: 'border-surface-600 bg-surface-800/80',
              icon: <AlertCircle className="h-12 w-12 text-gray-500" />,
              title: translate('No rows were written', language),
              subtitle: translate('No rows were imported.', language),
            };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-white">{translate('Import Results', language)}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800"
            type="button"
            aria-label={translate('Cancel', language)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div
            className={`flex flex-col items-center text-center rounded-xl border px-6 py-8 ${outcomeVisual.ring}`}
          >
            {outcomeVisual.icon}
            <p className="mt-4 text-lg font-semibold text-white">{outcomeVisual.title}</p>
            <p className="mt-2 text-sm text-gray-400 max-w-md">{outcomeVisual.subtitle}</p>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-surface-800 rounded-lg border border-surface-700">
              <p className="text-xs text-gray-500 mb-1">{translate('Rows in File', language)}</p>
              <p className="text-2xl font-semibold text-white">{totalRows}</p>
            </div>
            <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
              <p className="text-xs text-gray-500 mb-1">{translate('Uploaded', language)}</p>
              <p className="text-2xl font-semibold text-emerald-400">{successful.length}</p>
            </div>
            <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <p className="text-xs text-gray-500 mb-1">{translate('Duplicates', language)}</p>
              <p className="text-2xl font-semibold text-red-400">{duplicateCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <p className="text-xs text-gray-500 mb-1">{translate('Not Uploaded', language)}</p>
              <p className="text-2xl font-semibold text-amber-400">{otherNotUploadedCount}</p>
            </div>
            <div className="p-4 bg-surface-800 rounded-lg border border-surface-700">
              <p className="text-xs text-gray-500 mb-1">{translate('Failed Validation', language)}</p>
              <p className="text-2xl font-semibold text-white">{failed.length}</p>
            </div>
          </div>

          {/* Success Rate Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-300">{translate('Success Rate', language)}</p>
              <p className="text-sm text-gray-500">{successRate}%</p>
            </div>
            <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  successRate === 100 ? 'bg-emerald-500' : successRate >= 75 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${successRate}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {otherNotUploadedCount > 0 || duplicateCount > 0
                ? language === 'ja'
                  ? `重複 ${duplicateCount} 行、その他 ${otherNotUploadedCount} 行はアップロードされませんでした。`
                  : `${duplicateCount} duplicate row(s) and ${otherNotUploadedCount} other row(s) were not uploaded.`
                : language === 'ja'
                  ? 'アップロードされた行はすべて処理されました。'
                  : 'All uploaded rows were processed.'}
            </p>
          </div>

          {/* Successful Rows */}
          {successful.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {language === 'ja' ? `保存済み (${successful.length})` : `Saved (${successful.length})`}
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {successful.map((row, idx) => (
                  <div
                    key={typeof row.id === 'string' && row.id ? row.id : `import-ok-${idx}`}
                    className="p-2 bg-surface-800 rounded text-xs text-gray-300"
                  >
                    <p className="truncate">
                      Row {idx + 1}: {Object.values(row).slice(0, 3).join(' • ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Rows */}
          {failed.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {language === 'ja' ? `失敗 (${failed.length})` : `Failed (${failed.length})`}
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {failed.map((fail, idx) => (
                  <div key={idx} className="p-3 bg-red-500/10 rounded border border-red-500/30 text-xs">
                    <p className="text-red-300 font-medium mb-1">Row {idx + 1}</p>
                    <p className="text-red-400">{formatFailReason(fail.reason)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-surface-700 p-6 flex justify-end gap-2 bg-surface-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium text-sm transition-all"
          >
            {translate('Got it', language)}
          </button>
        </div>
      </div>
    </div>
  );
}
