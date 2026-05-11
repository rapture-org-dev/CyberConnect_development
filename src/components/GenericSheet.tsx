import { useState, useEffect, useRef, useLayoutEffect, useMemo, type CSSProperties } from 'react';
import type { SheetTab, SheetColumn, SheetRow, Project, ImportConflict, ImportValidationPreview } from '@/types';
import { finalizeImportRows } from '@/actions/rows';
import { useWorkspace } from '@/components/WorkspaceProvider';
import {
  getProjectAssignableProfiles,
  getTaskAssigneeProfileIdForProject,
  getUserName,
  translate,
  getLocalizedCell,
  getLocalizedColumnLabel,
  getBilingualRowFieldKey,
  columnUsesExplicitJaPair,
  type Language,
  type ProjectSheetRole,
  isTasksTab,
} from '@/lib/data';
import { ChevronUp, ChevronDown, Trash2, Plus, Download, Loader2, X, Columns3 } from 'lucide-react';
import { ImportModal } from './ImportModal';
import { SheetColumnManagerModal } from './SheetColumnManagerModal';
import { ImportPreviewModal } from './ImportPreviewModal';
import { ConflictResolver } from './ConflictResolver';
import { ImportResults } from './ImportResults';
import type { ImportPreviewRow } from '@/types';

interface Props {
  tab: SheetTab;
  rows: SheetRow[];
  project: Project | null;
  /** Role on this project for sheet write rules (pm / dev / client). */
  projectSheetRole: ProjectSheetRole;
  language: Language;
  onSelectRow: (row: SheetRow) => void;
  onUpdateRow: (id: string, key: string, value: string) => void | Promise<void>;
  onDeleteRow: (id: string) => void | Promise<void>;
  onDeleteRows?: (ids: string[]) => void | Promise<void>;
  onAddRow: () => void;
  selectedRowId: string | null;
  /** PM / project owner: open column layout editor (reorder, relabel, custom fields). */
  canManageSheetColumns?: boolean;
  onSheetColumnsChanged?: () => void;
}

const statusColors: Record<string, { text: string; bg: string }> = {
  'Not started': { text: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' },
  'In progress': { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  'In review': { text: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  'Completed': { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Done': { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Blocked': { text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  'Need to be checked': { text: 'text-brand-400', bg: 'bg-brand-500/10 border-brand-500/20' },
  'Pass': { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Fail': { text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  'Planned': { text: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' },
  'Deprecated': { text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  'MVP': { text: 'text-brand-400', bg: 'bg-brand-500/10 border-brand-500/20' },
  'v2': { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  'v3': { text: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' },
};

/** Beyond this, rows use `content-visibility: auto` so off-screen `<tr>` cost less to lay out (Chromium / Safari). */
const SHEET_VIRTUAL_ROW_THRESHOLD = 72;

/**
 * Frozen row-index + checkbox columns: width of `#` must match Tailwind `left-*` on the checkbox column
 * (e.g. w-14 + left-14). Mismatches caused sticky checkbox cells to drift over the next data column.
 */
const SHEET_ROW_INDEX_CELL =
  'sticky left-0 z-30 w-14 min-w-[3.5rem] max-w-[3.5rem] shrink-0 box-border px-2';
const SHEET_CHECKBOX_CELL =
  'sticky left-14 z-30 w-12 min-w-[3rem] max-w-[3rem] shrink-0 box-border px-0 align-middle border-r border-surface-800/80';

/** Pixel widths matching frozen columns (w-14 / w-12) for table `min-width` math. */
const SHEET_ROW_INDEX_PX = 56;
const SHEET_CHECKBOX_COL_PX = 48;
const SHEET_DELETE_COL_PX = 40;

/** Minimum width for `code` columns so IDs like TSK-106 stay on one line (see sheetDataColumnStyle). */
const SHEET_CODE_COL_MIN_PX = 120;

function sheetCodeLayoutWidthPx(declaredWidth: number): number {
  return Math.max(declaredWidth, SHEET_CODE_COL_MIN_PX);
}

/** Spreadsheet-style wrapping: fixed column width so text breaks within the cell instead of one endless line. */
function sheetDataColumnStyle(px: number, colType?: SheetColumn['type']): CSSProperties {
  if (colType === 'code') {
    const w = sheetCodeLayoutWidthPx(px);
    return {
      width: w,
      minWidth: w,
      maxWidth: w,
      wordBreak: 'normal',
      overflowWrap: 'normal',
      whiteSpace: 'nowrap',
      overflowX: 'auto',
    };
  }
  return {
    width: px,
    minWidth: px,
    maxWidth: px,
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  };
}

/** Match checkbox column: short fields vertically centered; paragraph-style columns stay top-aligned for readability. */
function sheetDataCellVerticalAlign(type: SheetColumn['type'], widthPx: number): string {
  if (type === 'longtext') return 'align-top';
  if (type === 'text' && widthPx >= 200) return 'align-top';
  return 'align-middle';
}

export function GenericSheet({
  tab,
  rows,
  project,
  projectSheetRole,
  language,
  onSelectRow,
  onUpdateRow,
  onDeleteRow,
  onDeleteRows,
  onAddRow,
  selectedRowId,
  canManageSheetColumns = false,
  onSheetColumnsChanged,
}: Props) {
  const { refreshSheetTab, refreshSheetColumnLayouts } = useWorkspace();
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingSaveCell, setPendingSaveCell] = useState<{ id: string; key: string } | null>(null);
  const [sheetMutationError, setSheetMutationError] = useState<string | null>(null);
  
  // Import workflow state
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importConflicts, setImportConflicts] = useState<ImportConflict[]>([]);
  const [importAllRows, setImportAllRows] = useState<ImportPreviewRow[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<SheetRow[]>([]);
  const [importColumnMapping, setImportColumnMapping] = useState<Record<string, string>>({});
  const [importTotalRows, setImportTotalRows] = useState(0);
  const [importDuplicateCount, setImportDuplicateCount] = useState(0);
  const [importNoMatchCount, setImportNoMatchCount] = useState(0);
  const [importMergeIntoExistingByCode, setImportMergeIntoExistingByCode] = useState(false);
  const [showConflictResolver, setShowConflictResolver] = useState(false);
  const [showImportResults, setShowImportResults] = useState(false);
  const [importResults, setImportResults] = useState<{ successful: SheetRow[]; failed: any[] }>({ successful: [], failed: [] });
  /** One overlay: DB import + refresh of this tab only (avoids full-project loading / unmounting the sheet). */
  const [importSaving, setImportSaving] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  /** Avoid ref-callback DOM writes during React placement (fixes insertBefore errors after bulk row refresh). */
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const displayColumns = tab.columns.flatMap((c) => {
    const jaKey = getBilingualRowFieldKey(tab.id, c.key);
    if (!jaKey) {
      return [{ ...c, displayKey: c.key, actualKey: c.key, sourceKey: c.key, langTag: null as null | 'EN' | 'JA' }];
    }

    const enCol = { ...c, displayKey: `${c.key}__en`, actualKey: c.key, sourceKey: c.key, langTag: null as null | 'EN' | 'JA' };
    const jaCol = { ...c, displayKey: `${c.key}__ja`, actualKey: jaKey, sourceKey: c.key, langTag: null as null | 'EN' | 'JA' };
    if (language === 'ja') return [jaCol];
    return [enCol];
  });

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const av = String(a[sortKey] ?? '');
    const bv = String(b[sortKey] ?? '');
    const cmp = av.localeCompare(bv, language === 'ja' ? 'ja' : 'en');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortedIds = sorted.map((r) => r.id);
  const tasks = isTasksTab(tab.id);
  const pm = projectSheetRole === 'pm';

  const canEditCell = (colKey: string) => {
    if (tasks) {
      if (pm) return true;
      if (projectSheetRole === 'dev') {
        const c = tab.columns.find(c => c.key === colKey);
        return c?.editable ?? false;
      }
      return false;
    }
    if (pm) return true;
    if (
      (tab.id === 'screen_list' || tab.id === 'function_list') &&
      colKey === 'status' &&
      (projectSheetRole === 'dev' || projectSheetRole === 'client')
    ) {
      return true;
    }
    return false;
  };

  const canAddRow = tab.pmCanAddRows && (pm || (tasks && projectSheetRole === 'dev'));
  const canDeleteRow = pm || (tasks && projectSheetRole === 'dev');
  const showBatchDelete = canDeleteRow && !!onDeleteRows;

  const sheetTableMinWidthPx = useMemo(() => {
    let w = SHEET_ROW_INDEX_PX + (showBatchDelete ? SHEET_CHECKBOX_COL_PX : 0);
    w += displayColumns.reduce(
      (sum, c) => sum + (c.type === 'code' ? sheetCodeLayoutWidthPx(c.width) : c.width),
      0
    );
    if (canDeleteRow) w += SHEET_DELETE_COL_PX;
    return w;
  }, [displayColumns, showBatchDelete, canDeleteRow]);

  const allVisibleSelected =
    sortedIds.length > 0 && sortedIds.every((id) => selectedRowIds.has(id));

  useLayoutEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate =
      !allVisibleSelected && sortedIds.some((id) => selectedRowIds.has(id));
  }, [allVisibleSelected, sortedIds, selectedRowIds]);

  const startEdit = (id: string, key: string, value: string) => {
    if (!canEditCell(key)) return;
    setEditingCell({ id, key });
    setEditValue(value);
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    const cell = editingCell;
    setSheetMutationError(null);
    setEditingCell(null);
    setPendingSaveCell(cell);
    try {
      await Promise.resolve(onUpdateRow(cell.id, cell.key, editValue));
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'duplicate_task_code') {
        setSheetMutationError(translate('duplicate_task_code', language))
      } else if (msg) {
        setSheetMutationError(msg)
      } else {
        setSheetMutationError(translate('Save failed', language))
      }
    } finally {
      setPendingSaveCell(null);
    }
  };

  const resetImportFlow = () => {
    setShowImportModal(false);
    setShowImportPreview(false);
    setShowConflictResolver(false);
    setShowImportResults(false);
    setImportConflicts([]);
    setImportAllRows([]);
    setImportPreviewRows([]);
    setImportColumnMapping({});
    setImportTotalRows(0);
    setImportDuplicateCount(0);
    setImportNoMatchCount(0);
    setImportMergeIntoExistingByCode(false);
    setImportResults({ successful: [], failed: [] });
    setImportSaving(false);
  };

  const handleImportMappingComplete = (result: ImportValidationPreview) => {
    setImportColumnMapping(result.columnMapping);
    setImportTotalRows(result.totalRows);
    setImportDuplicateCount(result.duplicateCount);
    setImportNoMatchCount(result.noMatchCount);
    setImportMergeIntoExistingByCode(result.mergeIntoExistingByCode);
    setImportConflicts(result.conflicts);
    setImportAllRows(result.allRows);
    setImportPreviewRows(result.previewRows);
    setShowImportModal(false);
    setShowImportPreview(true);
  };

  const handleImportPreviewContinue = async () => {
    setShowImportPreview(false);

    if (importConflicts.length > 0) {
      setShowConflictResolver(true);
      return;
    }

    setImportSaving(true);
    try {
      const result = await finalizeImportRows(project?.id || '', tab.id, importPreviewRows, [], {
        mergeIntoExistingByCode: importMergeIntoExistingByCode,
      });
      setImportResults(result);
      if (project?.id) {
        try {
          await refreshSheetTab(project.id, tab.id);
        } catch (e) {
          console.error('refreshSheetTab after import:', e);
        }
      }
    } catch (error) {
      console.error('Batch import failed:', error);
      const failedResult = {
        successful: [] as SheetRow[],
        failed: [{ rowData: {}, reason: error instanceof Error ? error.message : 'Import failed' }],
      };
      setImportResults(failedResult);
    } finally {
      setImportSaving(false);
      queueMicrotask(() => setShowImportResults(true));
    }
  };

  const handleConflictResolved = async (results: { successful: SheetRow[]; failed: any[] }) => {
    setImportResults(results);
    setShowConflictResolver(false);
    try {
      if (project?.id) {
        try {
          await refreshSheetTab(project.id, tab.id);
        } catch (e) {
          console.error('refreshSheetTab after import:', e);
        }
      }
    } finally {
      setImportSaving(false);
      queueMicrotask(() => setShowImportResults(true));
    }
  };

  const handleImportComplete = () => {
    resetImportFlow();
  };

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id));
    setSelectedRowIds((prev) => new Set([...prev].filter((id) => valid.has(id))));
  }, [rows]);

  const toggleRowSelected = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        sortedIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedRowIds((prev) => new Set([...prev, ...sortedIds]));
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    setSheetMutationError(null);
    setPendingDeleteId(rowId);
    try {
      await Promise.resolve(onDeleteRow(rowId));
    } catch {
      setSheetMutationError(translate('Delete failed', language));
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleBatchDelete = async () => {
    if (!onDeleteRows || selectedRowIds.size === 0) return;
    const n = selectedRowIds.size;
    const msg =
      language === 'ja'
        ? `選択した ${n} 行を削除しますか？`
        : `Delete ${n} selected row(s)?`;
    if (!window.confirm(msg)) return;
    setSheetMutationError(null);
    setPendingBatchDelete(true);
    try {
      await Promise.resolve(onDeleteRows([...selectedRowIds]));
      setSelectedRowIds(new Set());
    } catch {
      setSheetMutationError(translate('Delete failed', language));
    } finally {
      setPendingBatchDelete(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {importSaving && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-surface-700 bg-surface-900 px-8 py-6 shadow-xl max-w-sm">
            <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            <p className="text-base text-gray-200 text-center font-medium">
              {translate('Saving import and updating this sheet…', language)}
            </p>
            <p className="text-sm text-gray-500 text-center">
              {translate('This may take a moment for large files.', language)}
            </p>
          </div>
        </div>
      )}
      {sheetMutationError && (
        <div className="px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-base text-red-300 shrink-0">{sheetMutationError}</div>
      )}
      <div className="px-4 py-2 border-b border-surface-800 flex flex-wrap items-center gap-2 bg-surface-950/50">
        {canAddRow && (
          <>
            <button
              onClick={onAddRow}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-base font-medium transition-all"
            >
              <Plus className="w-4 h-4" />
              {translate('Add Row', language)}
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg text-base font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              Batch Import
            </button>
          </>
        )}
        {canManageSheetColumns && project?.id && !tab.isSpecialView && tab.columns.length > 0 && (
          <button
            type="button"
            onClick={() => setShowColumnManager(true)}
            className="flex items-center gap-2 px-4 py-2 border border-surface-600 bg-surface-900 hover:bg-surface-800 text-gray-200 rounded-lg text-base font-medium transition-all"
          >
            <Columns3 className="w-4 h-4" />
            {language === 'ja' ? '列' : 'Columns'}
          </button>
        )}
        {showBatchDelete && selectedRowIds.size > 0 && (
          <button
            type="button"
            onClick={() => void handleBatchDelete()}
            disabled={pendingBatchDelete}
            className="flex items-center gap-2 px-4 py-2 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-lg text-base font-medium transition-all disabled:opacity-50"
          >
            {pendingBatchDelete ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {translate('Delete selected', language)} ({selectedRowIds.size})
          </button>
        )}
        <span className="text-base text-gray-500">{rows.length} rows</span>
      </div>

      <div className="flex-1 overflow-auto">
        <table
          className="border-collapse"
          style={{
            tableLayout: 'fixed',
            width: sheetTableMinWidthPx,
          }}
        >
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-900 border-b border-surface-700">
              <th
                className={`${SHEET_ROW_INDEX_CELL} py-3 text-center bg-surface-900`}
              >
                <span className="text-gray-500 text-base">#</span>
              </th>
              {showBatchDelete && (
                <th className={`${SHEET_CHECKBOX_CELL} bg-surface-900 py-3`}>
                  <div className="flex h-full w-full items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={selectAllCheckboxRef}
                      onChange={toggleSelectAllVisible}
                      disabled={pendingBatchDelete || sorted.length === 0}
                      className="rounded border-surface-600 text-brand-500 focus:ring-brand-500/40"
                      title={language === 'ja' ? '表示中の行をすべて選択' : 'Select all visible rows'}
                    />
                  </div>
                </th>
              )}
              {displayColumns.map(c => {
                const sourceColForHead = tab.columns.find((col) => col.key === c.sourceKey) ?? c;
                return (
                <th
                  key={c.displayKey}
                  className={`px-3 py-3 text-left cursor-pointer group select-none ${sheetDataCellVerticalAlign(sourceColForHead.type, c.width)}`}
                  style={sheetDataColumnStyle(c.width, sourceColForHead.type)}
                  onClick={() => handleSort(c.actualKey)}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="min-w-0">
                      <span className="block break-words text-base font-medium text-gray-300 group-hover:text-white transition-colors">
                        {getLocalizedColumnLabel(c, language)}
                      </span>
                      <span className="block text-sm text-gray-600">
                        {c.langTag ?? ''}
                      </span>
                    </div>
                    {sortKey === c.actualKey && (
                      sortDir === 'asc'
                        ? <ChevronUp className="w-4 h-4 text-brand-400" />
                        : <ChevronDown className="w-4 h-4 text-brand-400" />
                    )}
                  </div>
                </th>
                );
              })}
              {canDeleteRow && (
                <th
                  className="px-2 py-3 align-middle"
                  style={{ width: SHEET_DELETE_COL_PX, minWidth: SHEET_DELETE_COL_PX, maxWidth: SHEET_DELETE_COL_PX }}
                />
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr
                key={row.id}
                style={
                  sorted.length >= SHEET_VIRTUAL_ROW_THRESHOLD
                    ? ({
                        contentVisibility: 'auto',
                        containIntrinsicSize: '96px',
                      } satisfies CSSProperties)
                    : undefined
                }
                className={`group border-b border-surface-800 hover:bg-surface-900/50 cursor-pointer transition-colors ${
                  selectedRowId === row.id ? 'bg-brand-600/8 border-brand-500/20' : ''
                }`}
                onClick={() => onSelectRow(row)}
              >
                <td
                  className={`${SHEET_ROW_INDEX_CELL} align-middle py-3 text-base text-gray-600 backdrop-blur-sm ${
                    selectedRowId === row.id
                      ? 'bg-brand-600/12'
                      : 'bg-surface-950/80 group-hover:bg-surface-900/60'
                  }`}
                >
                  {idx + 1}
                </td>
                {showBatchDelete && (
                  <td
                    className={`${SHEET_CHECKBOX_CELL} py-3 backdrop-blur-sm ${
                      selectedRowId === row.id
                        ? 'bg-brand-600/12'
                        : 'bg-surface-950/80 group-hover:bg-surface-900/60'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex w-full items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(row.id)}
                        onChange={() => toggleRowSelected(row.id)}
                        disabled={pendingBatchDelete}
                        className="rounded border-surface-600 text-brand-500 focus:ring-brand-500/40"
                        aria-label={language === 'ja' ? '行を選択' : 'Select row'}
                      />
                    </div>
                  </td>
                )}
                {displayColumns.map(c => {
                  const sourceCol = tab.columns.find(col => col.key === c.sourceKey) ?? c;
                  const isTasksAssignee = tasks && sourceCol.type === 'assignee';
                  const assigneeEffectiveId = isTasksAssignee
                    ? getTaskAssigneeProfileIdForProject(row, project)
                    : null;
                  const value = isTasksAssignee
                    ? (assigneeEffectiveId ?? '')
                    : String(row[c.actualKey] ?? '');
                  const displayValue = c.langTag
                    ? value
                    : isTasksAssignee
                      ? (assigneeEffectiveId ? getUserName(assigneeEffectiveId) : '')
                      : columnUsesExplicitJaPair(tab, c.actualKey)
                        ? String(row[c.actualKey] ?? '')
                        : getLocalizedCell(row, c.actualKey, language);
                  const isEditing = editingCell?.id === row.id && editingCell?.key === c.actualKey;
                  const isSavingThisCell =
                    pendingSaveCell?.id === row.id && pendingSaveCell?.key === c.actualKey;
                  const editable = canEditCell(c.sourceKey);
                  const isGuestEditable =
                    projectSheetRole === 'client' &&
                    tab.guestEditableColumns.includes(c.sourceKey) &&
                    editable;

                  return (
                    <td
                      key={c.displayKey}
                      className={`${sheetDataCellVerticalAlign(sourceCol.type, c.width)} px-3 py-3 text-base ${isGuestEditable ? 'bg-amber-500/3' : ''}`}
                      style={sheetDataColumnStyle(c.width, sourceCol.type)}
                      onDoubleClick={(e) => { e.stopPropagation(); if (editable) startEdit(row.id, c.actualKey, value); }}
                    >
                      {isEditing ? (
                        sourceCol.type === 'assignee' ? (
                          <select
                            autoFocus
                            value={editValue}
                            onChange={e => { setEditValue(e.target.value); }}
                            onBlur={() => void commitEdit()}
                            className="w-full bg-surface-800 border border-brand-500 rounded px-2 py-1.5 text-base text-white focus:outline-none"
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="">{translate('Unassigned', language)}</option>
                            {getProjectAssignableProfiles(project).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        ) : sourceCol.type === 'status' || sourceCol.type === 'select' ? (
                          <select
                            autoFocus
                            value={editValue}
                            onChange={e => { setEditValue(e.target.value); }}
                            onBlur={() => void commitEdit()}
                            className="w-full bg-surface-800 border border-brand-500 rounded px-2 py-1.5 text-base text-white focus:outline-none"
                            onClick={e => e.stopPropagation()}
                          >
                            {(sourceCol.options ?? []).map(o => <option key={o} value={o}>{translate(o, language)}</option>)}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => void commitEdit()}
                            onKeyDown={e => { if (e.key === 'Enter') void commitEdit(); if (e.key === 'Escape') setEditingCell(null); }}
                            className={`w-full rounded border border-brand-500 bg-surface-800 px-2 py-1.5 text-base text-white focus:outline-none ${
                              sourceCol.type === 'code' ? 'font-mono text-brand-300' : ''
                            }`}
                            onClick={e => e.stopPropagation()}
                          />
                        )
                      ) : sourceCol.type === 'code' ? (
                        <span className="inline-flex max-w-none items-center gap-1.5 whitespace-nowrap rounded border border-surface-700 bg-surface-800 px-2.5 py-1 font-mono text-base text-brand-300">
                          {displayValue}
                          {isSavingThisCell && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-400" />}
                        </span>
                      ) : sourceCol.type === 'status' || sourceCol.type === 'select' ? (
                        value ? (
                          <span
                            className={`inline-flex max-w-full flex-wrap items-center gap-1 whitespace-normal break-words text-base font-medium px-2.5 py-1 rounded-full border ${statusColors[value]?.bg ?? 'bg-gray-500/10 border-gray-500/20'} ${statusColors[value]?.text ?? 'text-gray-400'}`}
                          >
                            {translate(value, language)}
                          </span>
                        ) : <span className="text-gray-600">—</span>
                      ) : sourceCol.type === 'assignee' ? (
                        displayValue ? (
                          <span className="inline-flex min-w-0 max-w-full items-center gap-2 text-base">
                            <span className="w-7 h-7 shrink-0 rounded-full bg-brand-600 flex items-center justify-center text-sm text-white font-medium">
                              {displayValue.charAt(0)}
                            </span>
                            <span className="min-w-0 break-words text-gray-300">{displayValue}</span>
                          </span>
                        ) : <span className="text-gray-600 text-base">{translate('Unassigned', language)}</span>
                      ) : sourceCol.type === 'date' ? (
                        <span className="text-gray-400 text-base">{displayValue || '—'}</span>
                      ) : sourceCol.type === 'number' ? (
                        <span className="text-gray-300 font-mono text-base">{displayValue || '—'}</span>
                      ) : sourceCol.type === 'longtext' ? (
                        <span className="block whitespace-normal break-words text-gray-300 text-base leading-relaxed">
                          {displayValue || <span className="text-gray-600">—</span>}
                        </span>
                      ) : (
                        <span
                          className={`block whitespace-normal break-words text-gray-300 text-base ${isGuestEditable ? 'cursor-text' : ''}`}
                        >
                          {displayValue || <span className="text-gray-600">—</span>}
                        </span>
                      )}
                    </td>
                  );
                })}
                {canDeleteRow && (
                  <td
                    className="align-middle px-2 py-2"
                    style={{ width: SHEET_DELETE_COL_PX, minWidth: SHEET_DELETE_COL_PX, maxWidth: SHEET_DELETE_COL_PX }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteRow(row.id);
                      }}
                      disabled={pendingDeleteId !== null || pendingBatchDelete}
                      className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/10 disabled:opacity-40"
                      aria-busy={pendingDeleteId === row.id}
                    >
                      {pendingDeleteId === row.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <p className="text-xl font-medium">{translate('No data in this sheet', language)}</p>
            {canAddRow && (
              <button onClick={onAddRow} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-base font-medium transition-all">
                <Plus className="w-5 h-5" />
                {translate('Add First Row', language)}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Import Modals */}
      {showImportModal && (
        <ImportModal
          tab={tab}
          projectId={project?.id || ''}
          language={language}
          onClose={resetImportFlow}
          onMappingComplete={handleImportMappingComplete}
        />
      )}

      {showImportPreview && (
        <ImportPreviewModal
          tab={tab}
          rows={importAllRows}
          totalRows={importTotalRows}
          rowsToImportCount={importPreviewRows.length}
          duplicateCount={importDuplicateCount}
          conflictCount={importConflicts.length}
          noMatchCount={importNoMatchCount}
          mergeIntoExistingByCode={importMergeIntoExistingByCode}
          language={language}
          onBack={() => {
            setShowImportPreview(false);
            setShowImportModal(true);
          }}
          onContinue={handleImportPreviewContinue}
          onClose={resetImportFlow}
        />
      )}

      {showConflictResolver && importConflicts.length > 0 && (
        <ConflictResolver
          projectId={project?.id || ''}
          tabId={tab.id}
          conflicts={importConflicts}
          previewRows={importPreviewRows}
          columnMapping={importColumnMapping}
          totalRows={importTotalRows}
          duplicateCount={importDuplicateCount}
          language={language}
          onClose={() => setShowConflictResolver(false)}
          onFinalizeStart={() => setImportSaving(true)}
          onImportComplete={handleConflictResolved}
        />
      )}

      {showImportResults && (
        <ImportResults
          successful={importResults.successful}
          failed={importResults.failed}
          totalRows={importTotalRows}
          duplicateCount={importDuplicateCount}
          language={language}
          onClose={handleImportComplete}
        />
      )}

      {canManageSheetColumns && project?.id && (
        <SheetColumnManagerModal
          open={showColumnManager}
          tab={tab}
          projectId={project.id}
          language={language}
          onClose={() => setShowColumnManager(false)}
          onSaved={() => {
            void refreshSheetColumnLayouts(project.id);
            onSheetColumnsChanged?.();
          }}
        />
      )}
    </div>
  );
}
