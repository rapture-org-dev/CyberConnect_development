import { useState } from 'react';
import { X, AlertCircle, Loader } from 'lucide-react';
import type { ImportConflict, ConflictChoice } from '@/types';
import { finalizeImportRows } from '@/lib/api/client';
import type { SheetRow } from '@/types';
import { translate, type Language } from '@/lib/data';

interface Props {
  projectId: string;
  tabId: string;
  conflicts: ImportConflict[];
  previewRows: SheetRow[];
  columnMapping: Record<string, string>;
  totalRows: number;
  duplicateCount: number;
  onClose: () => void;
  /** Called immediately before server finalize — show global saving overlay. */
  onFinalizeStart?: () => void;
  onImportComplete: (results: { successful: SheetRow[]; failed: any[] }) => void | Promise<void>;
  language?: Language;
}

export function ConflictResolver({
  projectId,
  tabId,
  conflicts,
  previewRows,
  columnMapping,
  totalRows,
  duplicateCount,
  onClose,
  onFinalizeStart,
  onImportComplete,
  language = 'en',
}: Props) {
  const [resolutions, setResolutions] = useState<Record<number, 'skip' | 'overwrite' | 'use_new'>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleResolveConflict = (excelRowIndex: number, decision: 'skip' | 'overwrite' | 'use_new') => {
    setResolutions(prev => ({
      ...prev,
      [excelRowIndex]: decision,
    }));
  };

  const applyAllResolutions = (decision: 'skip' | 'overwrite' | 'use_new') => {
    setResolutions((prev) => {
      const next = { ...prev };
      for (const c of conflicts) {
        next[c.excelRowIndex] = decision;
      }
      return next;
    });
  };

  const handleContinueImport = async () => {
    setImporting(true);
    setError('');
    onFinalizeStart?.();

    try {
      // Build rows to import
      const rowsToImport: SheetRow[] = [...previewRows];

      // Add resolved conflict rows
      conflicts.forEach(conflict => {
        const decision = resolutions[conflict.excelRowIndex] || 'skip';
        
        if (decision === 'overwrite') {
          // Use existing row ID and update it
          rowsToImport.push({
            ...conflict.excelRow,
            id: conflict.existingRow.id, // Use existing ID for upsert
          });
        } else if (decision === 'use_new') {
          // Use new Excel row as-is
          rowsToImport.push(conflict.excelRow);
        }
        // 'skip' does nothing - row is excluded
      });

      // Call finalize action
      const conflictChoices: ConflictChoice[] = conflicts.map(c => ({
        excelRowIndex: c.excelRowIndex,
        decision: resolutions[c.excelRowIndex] || 'skip',
      }));

      const result = await finalizeImportRows(projectId, tabId, rowsToImport, conflictChoices);

      if (result.failed && result.failed.length > 0) {
        setError(`${result.failed.length} rows failed to import`);
      }

      await Promise.resolve(onImportComplete(result));
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const allResolved = conflicts.every(c => resolutions[c.excelRowIndex]);
  const skipCount = Object.values(resolutions).filter(d => d === 'skip').length;
  const overwriteCount = Object.values(resolutions).filter(d => d === 'overwrite').length;
  const useNewCount = Object.values(resolutions).filter(d => d === 'use_new').length;
  const rowsToImportCount = previewRows.length + conflicts.filter(c => (resolutions[c.excelRowIndex] || 'skip') !== 'skip').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="relative bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}>
        {importing && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-black/55 backdrop-blur-[2px]">
            <Loader className="h-8 w-8 animate-spin text-brand-400" />
            <p className="mt-3 text-sm text-gray-200 text-center px-2">
              {translate('Saving import and updating this sheet…', language)}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between p-6 border-b border-surface-700">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Resolve Conflicts
            </h2>
            <p className="text-xs text-gray-500 mt-1">{conflicts.length} duplicate(s) found</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {conflicts.length > 1 && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-surface-700 bg-surface-800/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-400">
                {translate('Apply to all conflicts', language)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyAllResolutions('skip')}
                  disabled={importing}
                  className="rounded-lg bg-surface-700 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600 disabled:opacity-50"
                >
                  {translate('Skip all', language)}
                </button>
                <button
                  type="button"
                  onClick={() => applyAllResolutions('overwrite')}
                  disabled={importing}
                  className="rounded-lg bg-amber-600/90 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
                >
                  {translate('Overwrite all', language)}
                </button>
                <button
                  type="button"
                  onClick={() => applyAllResolutions('use_new')}
                  disabled={importing}
                  className="rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {translate('Use new for all', language)}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {conflicts.map((conflict, idx) => {
              const resolution = resolutions[conflict.excelRowIndex];

              return (
                <div
                  key={idx}
                  className="border border-surface-700 rounded-lg p-4 bg-surface-800/50 hover:bg-surface-800 transition-colors"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-white mb-2">
                        {conflict.codeField}: <span className="text-brand-400">{conflict.codeValue}</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Existing Row */}
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Current in Project</p>
                          <div className="p-2 bg-surface-900 rounded border border-surface-700 text-xs space-y-1">
                            {Object.entries(conflict.existingRow)
                              .slice(0, 5)
                              .map(([key, val]) => (
                                <div key={key}>
                                  <span className="text-gray-600">{key}:</span>{' '}
                                  <span className="text-gray-300">{String(val || '')}</span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Excel Row */}
                        <div>
                          <p className="text-xs text-gray-500 mb-2">From Excel File</p>
                          <div className="p-2 bg-surface-900 rounded border border-surface-700 text-xs space-y-1">
                            {Object.entries(conflict.excelRow)
                              .slice(0, 5)
                              .map(([key, val]) => (
                                <div key={key}>
                                  <span className="text-gray-600">{key}:</span>{' '}
                                  <span className="text-gray-300">{String(val || '')}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Decision Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleResolveConflict(conflict.excelRowIndex, 'skip')}
                      className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-all ${
                        resolution === 'skip'
                          ? 'bg-gray-600 text-white'
                          : 'bg-surface-700 text-gray-300 hover:bg-surface-600'
                      }`}
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => handleResolveConflict(conflict.excelRowIndex, 'overwrite')}
                      className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-all ${
                        resolution === 'overwrite'
                          ? 'bg-amber-600 text-white'
                          : 'bg-surface-700 text-gray-300 hover:bg-surface-600'
                      }`}
                    >
                      Overwrite
                    </button>
                    <button
                      onClick={() => handleResolveConflict(conflict.excelRowIndex, 'use_new')}
                      className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-all ${
                        resolution === 'use_new'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-surface-700 text-gray-300 hover:bg-surface-600'
                      }`}
                    >
                      Use New
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="border-t border-surface-700 mt-6 pt-4">
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="p-2 bg-surface-800 rounded">
                <p className="text-gray-500">Total Conflicts</p>
                <p className="text-lg font-semibold text-white">{conflicts.length}</p>
              </div>
              <div className="p-2 bg-surface-800 rounded">
                <p className="text-gray-500">Skip</p>
                <p className="text-lg font-semibold text-gray-400">{skipCount}</p>
              </div>
              <div className="p-2 bg-surface-800 rounded">
                <p className="text-gray-500">Overwrite</p>
                <p className="text-lg font-semibold text-amber-400">{overwriteCount}</p>
              </div>
              <div className="p-2 bg-surface-800 rounded">
                <p className="text-gray-500">Use New</p>
                <p className="text-lg font-semibold text-emerald-400">{useNewCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-surface-700 p-6 flex items-center justify-between bg-surface-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleContinueImport}
            disabled={!allResolved || importing}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-all"
          >
            {importing ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              'Continue Import →'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
