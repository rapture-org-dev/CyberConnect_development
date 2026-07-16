import { useMemo, useState, useEffect } from 'react';
import type { SheetTab, SheetRow, Project } from '@/types';
import { X, Save, Loader2 } from 'lucide-react';
import {
  getProjectAssignableProfiles,
  generateCode,
  getBilingualRowFieldKey,
  getLocalizedColumnLabel,
  getLocalizedTabName,
  translate,
  type Language,
  type ProjectSheetRole,
  isTasksTab,
} from '@/lib/data';
import { getNextTaskCodeAction } from '@/lib/api/client';
import { RegisteredCodePicker } from '@/components/RegisteredCodePicker';
import {
  formatSelectCellDisplayValue,
  isMirroredBilingualField,
} from '@/lib/bilingualFields';
import { BilingualFieldPairEditor } from '@/components/BilingualFieldPairEditor';
import {
  TaskGitHubIssuePanel,
  type GitHubComposeIntent,
} from '@/components/TaskGitHubIssuePanel';
import { shouldRenderMergedBilingualBlock } from '@/lib/data';
import { taskGitHubIssueAction } from '@/lib/api/client';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { formatGitHubOwnerRepo } from '@/lib/githubRepo';

interface Props {
  tab: SheetTab;
  projectId: string;
  project: Project | null;
  projectSheetRole: ProjectSheetRole;
  language: Language;
  /** Registered screen IDs (`screen_list.screen_code`) for task pickers */
  screenCodeOptions?: string[];
  /** Registered function IDs (`function_list.function_code`) for task pickers */
  functionCodeOptions?: string[];
  onClose: () => void;
  /** Must return the saved row so GitHub create/link can run after insert. */
  onSave: (row: SheetRow) => void | Promise<void | SheetRow>;
}

export function AddRowDrawer({
  tab,
  projectId,
  project,
  projectSheetRole,
  language,
  screenCodeOptions = [],
  functionCodeOptions = [],
  onClose,
  onSave,
}: Props) {
  const { applySheetRowLocal } = useWorkspace();
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    tab.columns.forEach((c) => {
      if (c.type === 'code') {
        if (c.key === 'task_code' && tab.id === 'tasks') {
          initial[c.key] = '';
        } else {
          const prefix =
            c.key === 'task_code'
              ? 'TSK'
              : c.key === 'screen_code'
                ? 'SCR'
                : c.key === 'function_code'
                  ? 'FNC'
                  : 'ITM';
          initial[c.key] = generateCode(prefix, projectId);
        }
      } else if (c.type === 'status' && c.options?.length) {
        initial[c.key] = c.options[0];
      } else if (c.type === 'select' && c.options?.length) {
        initial[c.key] = c.options[0];
      } else {
        initial[c.key] = '';
      }

      const jaKey = getBilingualRowFieldKey(tab.id, c.key);
      if (jaKey) {
        initial[jaKey] = '';
      }
    });
    return initial;
  });

  const [taskCodeLoading, setTaskCodeLoading] = useState(() => isTasksTab(tab.id));
  const [taskCodeError, setTaskCodeError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [githubIntent, setGithubIntent] = useState<GitHubComposeIntent>('none');
  const [githubIssueInput, setGithubIssueInput] = useState('');

  const canLinkGitHub =
    isTasksTab(tab.id) && (projectSheetRole === 'pm' || projectSheetRole === 'dev');

  useEffect(() => {
    if (!isTasksTab(tab.id)) return;
    let cancelled = false;
    setTaskCodeLoading(true);
    setTaskCodeError(null);
    getNextTaskCodeAction(projectId)
      .then((code) => {
        if (cancelled) return;
        setFormData((prev) => ({ ...prev, task_code: code }));
      })
      .catch(() => {
        if (cancelled) return;
        setTaskCodeError(translate('Save failed', language));
      })
      .finally(() => {
        if (!cancelled) setTaskCodeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab.id, projectId, language]);

  const fieldSpecs = useMemo(() => {
    return tab.columns.map((col) => ({
      col,
      jaKey: getBilingualRowFieldKey(tab.id, col.key),
    }));
  }, [tab]);

  const canEditField = (colKey: string) => {
    if (projectSheetRole === 'pm') return true;
    if (projectSheetRole === 'dev' && isTasksTab(tab.id)) {
      const c = tab.columns.find((c) => c.key === colKey);
      return c?.editable ?? false;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savePending) return;
    if (isTasksTab(tab.id) && taskCodeLoading) return;
    if (githubIntent === 'link' && !githubIssueInput.trim()) {
      setSaveError(
        language === 'ja'
          ? 'Issue をリンクする場合は URL または番号を入力してください。'
          : 'Enter an issue URL or number to link after save.'
      );
      return;
    }
    setSaveError(null);
    setSavePending(true);
    const newRow = {
      ...formData,
      id: crypto.randomUUID(),
      project_id: projectId,
      created_at: new Date().toISOString(),
    } as SheetRow;
    try {
      const saved = (await onSave(newRow)) as SheetRow | void;
      const savedRow = saved && typeof saved === 'object' && 'id' in saved ? saved : newRow;

      if (canLinkGitHub && githubIntent !== 'none' && savedRow.id) {
        try {
          const result = await taskGitHubIssueAction(
            projectId,
            savedRow.id,
            githubIntent === 'create' ? 'create' : 'link',
            githubIntent === 'link' ? githubIssueInput : undefined
          );
          applySheetRowLocal(projectId, tab.id, result.row);
        } catch (ghErr) {
          const ghMsg = ghErr instanceof Error ? ghErr.message : '';
          setSaveError(
            language === 'ja'
              ? `タスクは保存されましたが、GitHub 連携に失敗しました: ${ghMsg || '不明なエラー'}`
              : `Task saved, but GitHub link failed: ${ghMsg || 'Unknown error'}`
          );
          setSavePending(false);
          return;
        }
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'duplicate_task_code') {
        setSaveError(translate('duplicate_task_code', language))
      } else if (msg.includes('Server Components render')) {
        setSaveError(
          language === 'ja'
            ? '保存に失敗しました。タスクIDの重複、権限、またはデータベース設定を確認してください。'
            : 'Save failed. Check for a duplicate task ID, your permissions, or ask an admin to verify database access.'
        )
      } else if (msg) {
        setSaveError(msg)
      } else {
        setSaveError(translate('Save failed', language))
      }
    } finally {
      setSavePending(false);
    }
  };

  const renderFieldControl = (col: SheetTab['columns'][number], value: string) => {
    const setValue = (nextValue: string) => {
      setFormData((prev) => ({ ...prev, [col.key]: nextValue }));
    };

    const editable = canEditField(col.key);

    if (col.type === 'assignee') {
      return (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!editable || savePending}
          className={`w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${!editable ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">{translate('Unassigned', language)}</option>
          {getProjectAssignableProfiles(project).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      );
    }

    if (isTasksTab(tab.id) && col.key === 'screen_code') {
      return (
        <RegisteredCodePicker
          value={value}
          onChange={setValue}
          options={screenCodeOptions}
          disabled={!editable || savePending}
          language={language}
          hintEmptyKey="No screens registered yet"
        />
      );
    }

    if (isTasksTab(tab.id) && col.key === 'function_code') {
      return (
        <RegisteredCodePicker
          value={value}
          onChange={setValue}
          options={functionCodeOptions}
          disabled={!editable || savePending}
          language={language}
          hintEmptyKey="No functions registered yet"
        />
      );
    }

    if (col.type === 'status' || col.type === 'select') {
      return (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!editable || savePending}
          className={`w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${!editable ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {(col.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {formatSelectCellDisplayValue(tab.id, col.key, opt, language)}
            </option>
          ))}
        </select>
      );
    }

    if (col.type === 'longtext') {
      return (
        <textarea
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!editable || savePending}
          className={`w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none min-h-[100px] ${!editable ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      );
    }

    if (col.type === 'code' && col.key === 'task_code' && isTasksTab(tab.id)) {
      return (
        <div className="relative">
          <input
            type="text"
            value={value}
            readOnly
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 pr-10 text-sm text-white font-mono border-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          {taskCodeLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400 animate-spin" />
          )}
        </div>
      );
    }

    return (
      <input
        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={col.type === 'code' || !editable}
        disabled={savePending}
        className={`w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${col.type === 'code' ? 'font-mono border-brand-500/30' : ''} ${!editable && col.type !== 'code' ? 'opacity-50 cursor-not-allowed' : ''}`}
      />
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
      onClick={() => !savePending && onClose()}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 bg-surface-850/50">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 truncate">
            <span className="w-1.5 h-4 bg-brand-500 rounded-full shrink-0" />
            {translate('Add New', language)} {getLocalizedTabName(tab, language)}
          </h2>
          <button
            type="button"
            onClick={() => !savePending && onClose()}
            disabled={savePending}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800 shrink-0 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(90vh-64px)] overflow-hidden">
          {(taskCodeError || saveError) && (
            <div className="px-5 pt-4">
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
                {taskCodeError ?? saveError}
              </p>
            </div>
          )}
          <div className="overflow-y-auto p-5 custom-scrollbar space-y-4">
            {isTasksTab(tab.id) ? (
              <TaskGitHubIssuePanel
                projectId={projectId}
                language={language}
                canLink={canLinkGitHub}
                repoLabel={formatGitHubOwnerRepo(project?.github_owner, project?.github_repo) || undefined}
                compose
                composeIntent={githubIntent}
                onComposeIntentChange={setGithubIntent}
                composeIssueInput={githubIssueInput}
                onComposeIssueInputChange={setGithubIssueInput}
              />
            ) : null}
            {fieldSpecs.map(({ col, jaKey }) => {
              const showDual =
                jaKey &&
                shouldRenderMergedBilingualBlock(tab, col.key) &&
                !isMirroredBilingualField(tab.id, col.key);

              if (showDual && jaKey) {
                return (
                  <div key={col.key} className="bg-surface-900 border border-surface-800 rounded-xl p-4">
                    <div className="mb-3">
                      <div className="text-sm font-medium text-gray-200">
                        {getLocalizedColumnLabel(col, language)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-gray-600 font-mono">{col.key}</div>
                    </div>
                    <BilingualFieldPairEditor
                      tabId={tab.id}
                      col={col}
                      enKey={col.key}
                      jaKey={jaKey}
                      enValue={String(formData[col.key] ?? '')}
                      jaValue={String(formData[jaKey] ?? '')}
                      editable={canEditField(col.key)}
                      disabled={savePending}
                      language={language}
                      onChange={(_enKey, _jaKey, en, ja) =>
                        setFormData((prev) => ({
                          ...prev,
                          [col.key]: en,
                          [jaKey]: ja,
                        }))
                      }
                    />
                  </div>
                );
              }

              const value = String(formData[col.key] ?? '');

              return (
                <div key={col.key} className="bg-surface-900 border border-surface-800 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-sm font-medium text-gray-200">
                        {getLocalizedColumnLabel(col, language)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-gray-600 font-mono">{col.key}</div>
                    </div>
                  </div>

                  {renderFieldControl(col, value)}
                </div>
              );
            })}
          </div>

          <div className="p-5 border-t border-surface-700 bg-surface-900 flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => !savePending && onClose()}
              disabled={savePending}
              className="flex-1 px-4 py-2 rounded-lg border border-surface-700 text-gray-300 hover:text-white hover:bg-surface-800 transition-all font-medium text-xs disabled:opacity-50"
            >
              {translate('Cancel', language)}
            </button>
            <button
              type="submit"
              disabled={savePending || (isTasksTab(tab.id) && (taskCodeLoading || !!taskCodeError || !formData.task_code))}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 text-xs"
            >
              {savePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {savePending ? translate('Saving…', language) : translate('Save Row', language)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
