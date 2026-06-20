import type { SheetTab, SheetRow, Project } from '@/types';
import {
  getProjectAssignableProfiles,
  getTaskAssigneeProfileIdForProject,
  translate,
  getLocalizedCell,
  getLocalizedColumnLabel,
  getLocalizedTabName,
  getBilingualRowFieldKey,
  shouldRenderMergedBilingualBlock,
  columnUsesExplicitJaPair,
  type Language,
  type ProjectSheetRole,
  getClientRemarkColumnKeys,
  isTasksTab,
} from '@/lib/data';
import { RegisteredCodePicker } from '@/components/RegisteredCodePicker';
import { X, Save, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Props {
  tab: SheetTab;
  row: SheetRow;
  project: Project | null;
  projectSheetRole: ProjectSheetRole;
  language: Language;
  screenCodeOptions?: string[];
  functionCodeOptions?: string[];
  onClose: () => void;
  onUpdate: (updates: Partial<SheetRow>) => void | Promise<void>;
}

const readOnlyControlClass =
  'opacity-50 cursor-not-allowed bg-surface-850/80 border-surface-800 text-gray-400 pointer-events-none';

export function SheetRowDetail({
  tab,
  row,
  project,
  projectSheetRole,
  language,
  screenCodeOptions = [],
  functionCodeOptions = [],
  onClose,
  onUpdate,
}: Props) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, unknown> = { ...row };
    if (isTasksTab(tab.id)) {
      const aid = getTaskAssigneeProfileIdForProject(row, project);
      next.assignee = aid ?? '';
      next.assignee_id = aid ?? null;
    }
    setFormData(next);
  }, [row, tab.id, project?.id, project?.workspace_type, (project?.assignedDevIds ?? []).join(',')]);

  const statusOnlyTabs = tab.id === 'screen_list' || tab.id === 'function_list';
  /** Dev may edit only status on Screens / Functions; assignees (client/member) may edit status there too. */
  const devBlockedNonTaskSheet =
    projectSheetRole === 'dev' && !isTasksTab(tab.id) && !statusOnlyTabs;
  const clientRemarkKeys = getClientRemarkColumnKeys(tab.id);
  const clientRemarkOnly = projectSheetRole === 'client';
  const oppositeLanguage: Language = language === 'en' ? 'ja' : 'en';

  const clientCanEditStatusHere = clientRemarkOnly && statusOnlyTabs;

  const showSave =
    !devBlockedNonTaskSheet &&
    (!clientRemarkOnly || clientRemarkKeys.length > 0 || clientCanEditStatusHere);

  const canEditField = (colKey: string) => {
    if (clientRemarkOnly) {
      return (
        clientRemarkKeys.includes(colKey) || (statusOnlyTabs && colKey === 'status')
      );
    }

    if (projectSheetRole === 'pm') return true;
    if (statusOnlyTabs && colKey === 'status') {
      return projectSheetRole === 'dev' || projectSheetRole === 'client';
    }
    if (projectSheetRole === 'dev' && isTasksTab(tab.id)) {
      const c = tab.columns.find(c => c.key === colKey);
      return c?.editable ?? false;
    }
    return false;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSave || savePending) return;
    setSaveError(null);
    setSavePending(true);
    try {
      await Promise.resolve(onUpdate(formData as SheetRow));
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'duplicate_task_code') {
        setSaveError(translate('duplicate_task_code', language))
      } else if (msg) {
        setSaveError(msg)
      } else {
        setSaveError(translate('Save failed', language))
      }
    } finally {
      setSavePending(false);
    }
  };

  const codeCol = tab.columns.find(c => c.type === 'code');
  const codeValue = codeCol ? row[codeCol.key] : null;

  return (
    <div className="w-[420px] bg-surface-900 border-l border-surface-700 flex flex-col animate-slide-in shrink-0 h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 bg-surface-850/50">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-1.5 h-4 bg-brand-500 rounded-full shrink-0" />
          <span className="text-sm font-medium text-white truncate">
            {getLocalizedTabName(tab, language)}
          </span>
          {codeValue && (
            <span className="font-mono text-[10px] bg-surface-800 px-2 py-0.5 rounded text-brand-300 border border-surface-700 shrink-0">
              {String(codeValue)}
            </span>
          )}
          {(devBlockedNonTaskSheet || (clientRemarkOnly && !showSave)) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-800 text-gray-400 border border-surface-700 shrink-0">
              View only
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800 shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
        {saveError && (
          <div className="px-5 pt-4 shrink-0">
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{saveError}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {tab.columns.map(col => {
            const mergedJaKey = getBilingualRowFieldKey(tab.id, col.key);
            if (mergedJaKey && shouldRenderMergedBilingualBlock(tab, col.key)) {
              const valueEn = String(formData[col.key] ?? '');
              const valueJa = String(formData[mergedJaKey] ?? '');
              const editableMerged = canEditField(col.key);
              const lockedMerged =
                !editableMerged &&
                (clientRemarkOnly ||
                  devBlockedNonTaskSheet ||
                  (statusOnlyTabs && projectSheetRole === 'dev') ||
                  (projectSheetRole === 'dev' && isTasksTab(tab.id)));
              const isTaskRemarkField = isTasksTab(tab.id) && col.key === 'remark';
              const longTextRows = isTaskRemarkField ? 8 : 4;
              const longTextMinHeight = isTaskRemarkField ? 'min-h-[180px]' : 'min-h-[100px]';
              const readOnlyMinHeight = isTaskRemarkField ? 'min-h-[180px]' : 'min-h-[36px]';
              return (
                <div key={col.key}>
                  <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-2">
                    <span className="flex flex-col">
                      <span>{getLocalizedColumnLabel(col, language)}</span>
                      <span className="text-[10px] text-gray-600">
                        {getLocalizedColumnLabel(col, oppositeLanguage)}
                      </span>
                    </span>
                    <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20">
                      EN / JA
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-gray-500">English</div>
                      {editableMerged && col.type === 'longtext' ? (
                        <textarea
                          value={valueEn}
                          onChange={e =>
                            setFormData(prev => ({ ...prev, [col.key]: e.target.value }))
                          }
                          rows={longTextRows}
                          disabled={savePending}
                          className={`w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none ${longTextMinHeight}`}
                        />
                      ) : editableMerged && col.type !== 'longtext' ? (
                        <input
                          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          value={valueEn}
                          onChange={e =>
                            setFormData(prev => ({ ...prev, [col.key]: e.target.value }))
                          }
                          disabled={savePending}
                          className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        />
                      ) : lockedMerged ? (
                        <p className={`text-sm text-gray-300 bg-surface-850 rounded-lg px-3 py-2 border border-surface-800 whitespace-pre-wrap ${readOnlyMinHeight} ${readOnlyControlClass}`}>
                          {valueEn || <span className="text-gray-600 italic">—</span>}
                        </p>
                      ) : (
                        <p className={`text-sm text-gray-300 bg-surface-850 rounded-lg px-3 py-2 border border-surface-800 whitespace-pre-wrap ${readOnlyMinHeight}`}>
                          {valueEn || <span className="text-gray-600 italic">—</span>}
                        </p>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-gray-500">Japanese</div>
                      {editableMerged && col.type === 'longtext' ? (
                        <textarea
                          value={valueJa}
                          onChange={e =>
                            setFormData(prev => ({ ...prev, [mergedJaKey]: e.target.value }))
                          }
                          rows={longTextRows}
                          disabled={savePending}
                          className={`w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none ${longTextMinHeight}`}
                        />
                      ) : editableMerged && col.type !== 'longtext' ? (
                        <input
                          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          value={valueJa}
                          onChange={e =>
                            setFormData(prev => ({ ...prev, [mergedJaKey]: e.target.value }))
                          }
                          disabled={savePending}
                          className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        />
                      ) : lockedMerged ? (
                        <p className={`text-sm text-gray-300 bg-surface-850 rounded-lg px-3 py-2 border border-surface-800 whitespace-pre-wrap ${readOnlyMinHeight} ${readOnlyControlClass}`}>
                          {valueJa || <span className="text-gray-600 italic">—</span>}
                        </p>
                      ) : (
                        <p className={`text-sm text-gray-300 bg-surface-850 rounded-lg px-3 py-2 border border-surface-800 whitespace-pre-wrap ${readOnlyMinHeight}`}>
                          {valueJa || <span className="text-gray-600 italic">—</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            const value = String(formData[col.key] ?? '');
            const displayValue = columnUsesExplicitJaPair(tab, col.key)
              ? String(formData[col.key] ?? '')
              : getLocalizedCell(formData as SheetRow, col.key, language);
            const editable = canEditField(col.key);
            const lockedVisual =
              !editable &&
              (clientRemarkOnly ||
                devBlockedNonTaskSheet ||
                (statusOnlyTabs && projectSheetRole === 'dev') ||
                (projectSheetRole === 'dev' && isTasksTab(tab.id)));
            const readonlyDisplay =
              col.type === 'status' || col.type === 'select'
                ? translate(value, language)
                : displayValue || '';

            return (
              <div key={col.key}>
                <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-2">
                  <span className="flex flex-col">
                    <span>{getLocalizedColumnLabel(col, language)}</span>
                    <span className="text-[10px] text-gray-600">
                      {getLocalizedColumnLabel(col, oppositeLanguage)}
                    </span>
                  </span>
                  {editable && clientRemarkOnly && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Editable
                    </span>
                  )}
                </label>

                {editable && isTasksTab(tab.id) && col.key === 'screen_code' ? (
                  <RegisteredCodePicker
                    value={value}
                    onChange={(v) => setFormData((prev) => ({ ...prev, [col.key]: v }))}
                    options={screenCodeOptions}
                    disabled={savePending}
                    language={language}
                    hintEmptyKey="No screens registered yet"
                  />
                ) : editable && isTasksTab(tab.id) && col.key === 'function_code' ? (
                  <RegisteredCodePicker
                    value={value}
                    onChange={(v) => setFormData((prev) => ({ ...prev, [col.key]: v }))}
                    options={functionCodeOptions}
                    disabled={savePending}
                    language={language}
                    hintEmptyKey="No functions registered yet"
                  />
                ) : editable && col.type === 'assignee' ? (
                  <select
                    value={value}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, [col.key]: e.target.value }))
                    }
                    disabled={savePending}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    <option value="">{translate('Unassigned', language)}</option>
                    {getProjectAssignableProfiles(project).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : editable && (col.type === 'status' || col.type === 'select') && col.options ? (
                  <select
                    value={value}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, [col.key]: e.target.value }))
                    }
                    disabled={savePending}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    {col.options.map(o => (
                      <option key={o} value={o}>
                        {translate(o, language)}
                      </option>
                    ))}
                  </select>
                ) : editable && col.type === 'longtext' ? (
                  <textarea
                    value={value}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, [col.key]: e.target.value }))
                    }
                    rows={4}
                    disabled={savePending}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
                  />
                ) : editable && col.type === 'code' ? (
                  <input
                    type="text"
                    value={value}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, [col.key]: e.target.value }))
                    }
                    readOnly={isTasksTab(tab.id) && col.key === 'task_code'}
                    disabled={savePending}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 font-mono text-sm text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40 read-only:opacity-90"
                  />
                ) : editable && col.type !== 'code' ? (
                  <input
                    type={
                      col.type === 'number'
                        ? 'number'
                        : col.type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    value={value}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, [col.key]: e.target.value }))
                    }
                    disabled={savePending}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                ) : lockedVisual && col.type === 'longtext' ? (
                  <textarea
                    disabled
                    readOnly
                    value={readonlyDisplay}
                    rows={4}
                    className={`w-full rounded-lg px-3 py-2 text-sm resize-none border ${readOnlyControlClass}`}
                  />
                ) : lockedVisual &&
                  (col.type === 'assignee' ||
                    col.type === 'status' ||
                    col.type === 'select') ? (
                  <select
                    disabled
                    value={value}
                    className={`w-full rounded-lg px-3 py-2 text-sm border ${readOnlyControlClass}`}
                  >
                    <option value={value}>
                      {col.type === 'assignee'
                        ? displayValue || translate('Unassigned', language)
                        : readonlyDisplay || '—'}
                    </option>
                  </select>
                ) : lockedVisual && col.type !== 'code' ? (
                  <input
                    disabled
                    readOnly
                    type={
                      col.type === 'number'
                        ? 'number'
                        : col.type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    value={readonlyDisplay}
                    className={`w-full rounded-lg px-3 py-2 text-sm border ${readOnlyControlClass}`}
                  />
                ) : (
                  <p className="text-sm text-gray-300 bg-surface-850 rounded-lg px-3 py-2 border border-surface-800 whitespace-pre-wrap min-h-[36px] font-mono">
                    {col.type === 'status' || col.type === 'select' ? (
                      translate(value, language) || (
                        <span className="text-gray-600 italic">—</span>
                      )
                    ) : displayValue ? (
                      displayValue
                    ) : (
                      <span className="text-gray-600 italic">—</span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-surface-700 bg-surface-900 flex items-center gap-3 shrink-0">
          {showSave ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={savePending}
                className="flex-1 px-4 py-2 rounded-lg border border-surface-700 text-gray-300 hover:text-white hover:bg-surface-800 transition-all font-medium text-xs disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savePending}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 text-xs"
              >
                {savePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {savePending ? translate('Saving…', language) : translate('Save Changes', language)}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2 rounded-lg border border-surface-700 text-gray-200 hover:text-white hover:bg-surface-800 transition-all font-medium text-xs"
            >
              Close
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
