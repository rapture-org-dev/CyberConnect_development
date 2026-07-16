'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Github, Link2, Loader2, RefreshCw, Unlink, Upload } from 'lucide-react';
import type { SheetRow } from '@/types';
import {
  listProjectGitHubIssuesAction,
  taskGitHubIssueAction,
  type ProjectGitHubIssueOption,
} from '@/lib/api/client';
import { readTaskGitHubIssue } from '@/lib/githubTaskLink';
import type { Language } from '@/lib/data';

export type GitHubComposeIntent = 'none' | 'create' | 'link';

interface Props {
  projectId: string;
  language: Language;
  canLink: boolean;
  /** Shown as owner/repo target for this project. */
  repoLabel?: string;
  /** Existing saved row: live create/link/unlink. Omit in Add New compose mode. */
  row?: SheetRow;
  onRowUpdated?: (row: SheetRow) => void;
  /** Add New: choose what to do after Save Row. */
  compose?: boolean;
  composeIntent?: GitHubComposeIntent;
  onComposeIntentChange?: (intent: GitHubComposeIntent) => void;
  composeIssueInput?: string;
  onComposeIssueInputChange?: (value: string) => void;
}

function truncateTitle(title: string, max = 72) {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function useProjectIssueOptions(projectId: string, enabled: boolean) {
  const [issues, setIssues] = useState<ProjectGitHubIssueOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [repoPath, setRepoPath] = useState('');

  const reload = useCallback(async () => {
    if (!enabled || !projectId) return;
    setLoading(true);
    setListError('');
    try {
      const result = await listProjectGitHubIssuesAction(projectId, 'open');
      setIssues(result.issues);
      setRepoPath(`${result.repo.owner}/${result.repo.repo}`);
    } catch (e) {
      setIssues([]);
      setRepoPath('');
      setListError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { issues, loading, listError, repoPath, reload };
}

function IssueLinkPicker({
  language,
  projectId,
  enabled,
  value,
  onChange,
  disabled,
  onEnter,
}: {
  language: Language;
  projectId: string;
  enabled: boolean;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onEnter?: () => void;
}) {
  const t = (en: string, ja: string) => (language === 'ja' ? ja : en);
  const { issues, loading, listError, repoPath, reload } = useProjectIssueOptions(
    projectId,
    enabled
  );

  const selectedFromList = issues.find((i) => i.htmlUrl === value || `#${i.number}` === value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={selectedFromList?.htmlUrl ?? ''}
          disabled={disabled || loading || issues.length === 0}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-white disabled:opacity-50"
        >
          <option value="">
            {loading
              ? t('Loading issues…', 'Issue を読み込み中…')
              : issues.length === 0
                ? t('No open issues in project repo', 'プロジェクトのリポジトリに open Issue がありません')
                : t('Select an open issue…', 'open Issue を選択…')}
          </option>
          {issues.map((issue) => (
            <option key={issue.number} value={issue.htmlUrl}>
              {`#${issue.number} ${truncateTitle(issue.title)}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => void reload()}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-surface-600 p-1.5 text-gray-300 hover:bg-surface-800 disabled:opacity-50"
          title={t('Reload issue list', 'Issue 一覧を再読込')}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {repoPath ? (
        <p className="text-[10px] font-mono text-gray-600">
          {t('From', '対象')}: {repoPath}
        </p>
      ) : null}
      {listError ? (
        <p className="text-[11px] text-amber-400/90">
          {t(
            'Could not load dropdown (set project repo + PAT). You can still paste a URL below.',
            'ドロップダウンを読み込めません（プロジェクトの repo と PAT を確認）。下に URL を貼れます。'
          )}{' '}
          <span className="text-gray-500">({listError})</span>
        </p>
      ) : null}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
          }
        }}
        placeholder={t(
          'Or paste full issue URL (any repo) / #123',
          'または Issue URL（任意リポジトリ）/ #123 を貼付'
        )}
        disabled={disabled}
        className="w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-white placeholder:text-gray-600 disabled:opacity-50"
      />
    </div>
  );
}

export function TaskGitHubIssuePanel({
  projectId,
  row,
  language,
  canLink,
  repoLabel,
  onRowUpdated,
  compose = false,
  composeIntent = 'none',
  onComposeIntentChange,
  composeIssueInput = '',
  onComposeIssueInputChange,
}: Props) {
  const linked = row ? readTaskGitHubIssue(row as Record<string, unknown>) : null;
  const hasLink = Boolean(linked?.github_issue_url);
  const [issueInput, setIssueInput] = useState('');
  const [pending, setPending] = useState<
    'create' | 'link' | 'unlink' | 'refresh' | 'push-status' | null
  >(null);
  const [error, setError] = useState('');

  const t = (en: string, ja: string) => (language === 'ja' ? ja : en);

  const run = async (action: 'create' | 'link' | 'unlink' | 'refresh' | 'push-status') => {
    if (!canLink || pending || !row?.id || !onRowUpdated) return;
    setError('');
    setPending(action);
    try {
      const result = await taskGitHubIssueAction(
        projectId,
        row.id,
        action,
        action === 'link' ? issueInput : undefined
      );
      onRowUpdated(result.row);
      if (action === 'link') setIssueInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Request failed', 'リクエストに失敗しました'));
    } finally {
      setPending(null);
    }
  };

  if (compose) {
    if (!canLink) {
      return (
        <div className="rounded-xl border border-surface-700 bg-surface-950/40 p-3">
          <p className="text-xs text-gray-500">
            {t(
              'GitHub linking is available to PM and developers after the task is saved.',
              'GitHub 連携は保存後、PM / 開発者が利用できます。'
            )}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-surface-700 bg-surface-950/40 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-300">
          <Github className="h-3.5 w-3.5 text-brand-400" />
          {t('GitHub Issue (after save)', 'GitHub Issue（保存後）')}
        </div>
        {repoLabel ? (
          <p className="text-[11px] font-mono text-gray-500">{repoLabel}</p>
        ) : (
          <p className="text-[11px] text-amber-400/90">
            {t(
              'No project repo set — using app default (env) if configured.',
              'プロジェクトのリポジトリ未設定 — 設定済みならアプリ既定（env）を使用します。'
            )}
          </p>
        )}
        <div className="space-y-2 text-xs text-gray-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="github-compose"
              checked={composeIntent === 'none'}
              onChange={() => onComposeIntentChange?.('none')}
              className="accent-brand-500"
            />
            {t('Do not create or link', '作成・リンクしない')}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="github-compose"
              checked={composeIntent === 'create'}
              onChange={() => onComposeIntentChange?.('create')}
              className="accent-brand-500"
            />
            {t('Create GitHub Issue after save', '保存後に GitHub Issue を作成')}
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="github-compose"
              checked={composeIntent === 'link'}
              onChange={() => onComposeIntentChange?.('link')}
              className="mt-0.5 accent-brand-500"
            />
            <span className="flex-1 space-y-2">
              <span className="block">
                {t('Link existing issue after save', '保存後に既存 Issue をリンク')}
              </span>
              {composeIntent === 'link' ? (
                <IssueLinkPicker
                  language={language}
                  projectId={projectId}
                  enabled={composeIntent === 'link'}
                  value={composeIssueInput}
                  onChange={(v) => onComposeIssueInputChange?.(v)}
                />
              ) : null}
            </span>
          </label>
        </div>
        <p className="text-[11px] text-gray-500">
          {t(
            'Dropdown lists open issues from this project’s default repo. Paste a URL for any other repo. Runs after save.',
            'ドロップダウンはこのプロジェクト既定リポジトリの open Issue です。他リポジトリは URL を貼付。保存後に実行されます。'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-700 bg-surface-950/40 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-300">
        <Github className="h-3.5 w-3.5 text-brand-400" />
        {t('GitHub Issue', 'GitHub Issue')}
      </div>
      {repoLabel ? (
        <p className="text-[11px] font-mono text-gray-500">{repoLabel}</p>
      ) : null}

      {hasLink && linked ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a
              href={linked.github_issue_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-300 hover:text-brand-200"
            >
              {linked.github_issue_owner && linked.github_issue_repo
                ? `${linked.github_issue_owner}/${linked.github_issue_repo}#${linked.github_issue_number || '—'}`
                : `#${linked.github_issue_number || '—'}`}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {linked.github_issue_state ? (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${
                  linked.github_issue_state === 'closed'
                    ? 'border-purple-500/40 text-purple-300 bg-purple-500/10'
                    : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                }`}
              >
                {linked.github_issue_state}
              </span>
            ) : null}
          </div>
          {canLink ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void run('refresh')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-600 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-surface-800 disabled:opacity-50"
                title={t(
                  'Pull open/closed from GitHub (closed → Done)',
                  'GitHub の open/closed を取り込み（closed → Done）'
                )}
              >
                {pending === 'refresh' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t('Refresh', '更新')}
              </button>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void run('push-status')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-600 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-surface-800 disabled:opacity-50"
                title={t(
                  'Push task status: Done closes the issue; other statuses reopen it',
                  'タスク状態を送信: Done で Issue を close、それ以外で reopen'
                )}
              >
                {pending === 'push-status' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {t('Push status', '状態を送信')}
              </button>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void run('unlink')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-600 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-surface-800 disabled:opacity-50"
              >
                {pending === 'unlink' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unlink className="h-3.5 w-3.5" />
                )}
                {t('Unlink', 'リンク解除')}
              </button>
            </div>
          ) : null}
          <p className="text-[11px] text-gray-500">
            {t(
              'Webhook auto-syncs when the issue is closed/reopened on GitHub. Refresh pulls; Push status sends Done↔closed.',
              'GitHub で close/reopen すると Webhook で自動同期します。更新=取込、状態を送信=Done↔closed。'
            )}
          </p>
        </div>
      ) : canLink ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void run('create')}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {pending === 'create' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Github className="h-3.5 w-3.5" />
            )}
            {t('Create GitHub Issue', 'GitHub Issue を作成')}
          </button>
          <IssueLinkPicker
            language={language}
            projectId={projectId}
            enabled={!hasLink && canLink}
            value={issueInput}
            onChange={setIssueInput}
            disabled={pending !== null}
            onEnter={() => {
              if (issueInput.trim() && pending === null) void run('link');
            }}
          />
          <button
            type="button"
            disabled={pending !== null || !issueInput.trim()}
            onClick={() => void run('link')}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-surface-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-surface-800 disabled:opacity-50"
          >
            {pending === 'link' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            {t('Link selected / pasted issue', '選択／貼付した Issue をリンク')}
          </button>
          <p className="text-[11px] text-gray-500">
            {t(
              'Pick from the dropdown or paste a URL, then click Link. Save Changes does not apply the GitHub URL.',
              'ドロップダウンで選ぶか URL を貼り、「リンク」をクリック。「変更を保存」では反映されません。'
            )}
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          {t('No GitHub issue linked.', 'GitHub Issue は未リンクです。')}
        </p>
      )}

      {error ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-2 py-1.5">
          {error}
        </p>
      ) : null}
    </div>
  );
}
