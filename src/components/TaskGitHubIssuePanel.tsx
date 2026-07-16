'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Github, Link2, Loader2, RefreshCw, Unlink, Upload } from 'lucide-react';
import type { SheetRow } from '@/types';
import {
  listProjectGitHubIssuesAction,
  taskGitHubIssueAction,
  type ProjectGitHubIssueOption,
} from '@/lib/api/client';
import { readTaskGitHubIssue } from '@/lib/githubTaskLink';
import { formatGitHubOwnerRepo, parseGitHubOwnerRepo } from '@/lib/githubRepo';
import type { Language } from '@/lib/data';

export type GitHubComposeIntent = 'none' | 'create' | 'link';

interface Props {
  projectId: string;
  language: Language;
  canLink: boolean;
  /** Shown as summary label for project repos. */
  repoLabel?: string;
  /** Project-bound repos as owner/repo (from Edit Project). Used for the selector before API loads. */
  boundRepos?: string[];
  row?: SheetRow;
  onRowUpdated?: (row: SheetRow) => void;
  compose?: boolean;
  composeIntent?: GitHubComposeIntent;
  onComposeIntentChange?: (intent: GitHubComposeIntent) => void;
  composeIssueInput?: string;
  onComposeIssueInputChange?: (value: string) => void;
  /** Selected repo for Create (and Link filter). owner/repo */
  composeCreateRepo?: string;
  onComposeCreateRepoChange?: (value: string) => void;
}

function truncateTitle(title: string, max = 64) {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function normalizeBoundRepos(boundRepos?: string[]): { owner: string; repo: string }[] {
  const out: { owner: string; repo: string }[] = [];
  for (const raw of boundRepos ?? []) {
    const parsed = parseGitHubOwnerRepo(raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

function useProjectIssueOptions(
  projectId: string,
  enabled: boolean,
  displayLang: Language
) {
  const [issues, setIssues] = useState<ProjectGitHubIssueOption[]>([]);
  const [repos, setRepos] = useState<{ owner: string; repo: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');

  const reload = useCallback(async () => {
    if (!enabled || !projectId) return;
    setLoading(true);
    setListError('');
    try {
      const result = await listProjectGitHubIssuesAction(
        projectId,
        'open',
        displayLang === 'ja' ? 'ja' : 'en'
      );
      setIssues(result.issues);
      setRepos(result.repos);
    } catch (e) {
      setIssues([]);
      setRepos([]);
      setListError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId, displayLang]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { issues, repos, loading, listError, reload };
}

function RepoSelect({
  language,
  repos,
  value,
  onChange,
  disabled,
  labelEn,
  labelJa,
}: {
  language: Language;
  repos: { owner: string; repo: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  labelEn: string;
  labelJa: string;
}) {
  const t = (en: string, ja: string) => (language === 'ja' ? ja : en);
  if (repos.length === 0) return null;

  const primary = formatGitHubOwnerRepo(repos[0]?.owner, repos[0]?.repo);
  const current = value || primary;

  if (repos.length === 1) {
    return (
      <div className="space-y-1">
        <label className="text-[11px] text-gray-500">{t(labelEn, labelJa)}</label>
        <p className="rounded-lg border border-surface-700 bg-surface-800/60 px-2 py-1.5 text-xs font-mono text-gray-300">
          {primary}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-[11px] text-gray-500">{t(labelEn, labelJa)}</label>
      <select
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {repos.map((r, i) => {
          const full = formatGitHubOwnerRepo(r.owner, r.repo);
          return (
            <option key={full} value={full}>
              {full}
              {i === 0 ? t(' (primary)', '（プライマリ）') : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function IssueLinkPicker({
  language,
  projectId,
  enabled,
  value,
  onChange,
  disabled,
  onEnter,
  repoFilter,
}: {
  language: Language;
  projectId: string;
  enabled: boolean;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onEnter?: () => void;
  /** owner/repo — only show issues from this repo */
  repoFilter?: string;
}) {
  const t = (en: string, ja: string) => (language === 'ja' ? ja : en);
  const { issues, loading, listError, reload } = useProjectIssueOptions(
    projectId,
    enabled,
    language
  );

  const filtered = useMemo(() => {
    if (!repoFilter) return issues;
    const parsed = parseGitHubOwnerRepo(repoFilter);
    if (!parsed) return issues;
    return issues.filter(
      (i) =>
        i.owner.toLowerCase() === parsed.owner.toLowerCase() &&
        i.repo.toLowerCase() === parsed.repo.toLowerCase()
    );
  }, [issues, repoFilter]);

  const selectedFromList = filtered.find((i) => i.htmlUrl === value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={selectedFromList?.htmlUrl ?? ''}
          disabled={disabled || loading || filtered.length === 0}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-white disabled:opacity-50"
        >
          <option value="">
            {loading
              ? t('Loading issues…', 'Issue を読み込み中…')
              : filtered.length === 0
                ? t('No open issues in this repository', 'このリポジトリに open Issue がありません')
                : t('Select an open issue…', 'open Issue を選択…')}
          </option>
          {filtered.map((issue) => (
            <option
              key={`${issue.owner}/${issue.repo}#${issue.number}`}
              value={issue.htmlUrl}
              title={issue.titleOriginal || issue.title}
            >
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
      {listError ? (
        <p className="text-[11px] text-amber-400/90">
          {t(
            'Could not load dropdown. You can still paste a URL below.',
            'ドロップダウンを読み込めません。下に URL を貼れます。'
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
  boundRepos = [],
  onRowUpdated,
  compose = false,
  composeIntent = 'none',
  onComposeIntentChange,
  composeIssueInput = '',
  onComposeIssueInputChange,
  composeCreateRepo = '',
  onComposeCreateRepoChange,
}: Props) {
  const linked = row ? readTaskGitHubIssue(row as Record<string, unknown>) : null;
  const hasLink = Boolean(linked?.github_issue_url);
  const [issueInput, setIssueInput] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [pending, setPending] = useState<
    'create' | 'link' | 'unlink' | 'refresh' | 'push-status' | null
  >(null);
  const [error, setError] = useState('');

  const needsIssueList =
    canLink && (compose ? composeIntent === 'create' || composeIntent === 'link' : !hasLink);
  const { repos: apiRepos } = useProjectIssueOptions(
    projectId,
    Boolean(needsIssueList),
    language
  );

  const repos = useMemo(() => {
    const fromBound = normalizeBoundRepos(boundRepos);
    if (apiRepos.length > 0) return apiRepos;
    return fromBound;
  }, [apiRepos, boundRepos]);

  const t = (en: string, ja: string) => (language === 'ja' ? ja : en);

  const effectiveRepo =
    (compose ? composeCreateRepo : selectedRepo) ||
    (repos[0] ? formatGitHubOwnerRepo(repos[0].owner, repos[0].repo) : '');

  const setEffectiveRepo = (v: string) => {
    if (compose) {
      onComposeCreateRepoChange?.(v);
      // Clear issue pick when switching repo so user doesn't link the wrong one
      onComposeIssueInputChange?.('');
    } else {
      setSelectedRepo(v);
      setIssueInput('');
    }
  };

  // Default selected repo once options are known
  useEffect(() => {
    if (!effectiveRepo && repos[0]) {
      const primary = formatGitHubOwnerRepo(repos[0].owner, repos[0].repo);
      if (compose) onComposeCreateRepoChange?.(primary);
      else setSelectedRepo(primary);
    }
  }, [compose, effectiveRepo, repos, onComposeCreateRepoChange]);

  const run = async (action: 'create' | 'link' | 'unlink' | 'refresh' | 'push-status') => {
    if (!canLink || pending || !row?.id || !onRowUpdated) return;
    setError('');
    setPending(action);
    try {
      const result = await taskGitHubIssueAction(
        projectId,
        row.id,
        action,
        action === 'link' ? issueInput : undefined,
        action === 'create' ? effectiveRepo || undefined : undefined
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
              'No project repos set — using app default (env) if configured.',
              'プロジェクトのリポジトリ未設定 — 設定済みならアプリ既定（env）を使用します。'
            )}
          </p>
        )}

        {(composeIntent === 'create' || composeIntent === 'link') && repos.length > 0 ? (
          <RepoSelect
            language={language}
            repos={repos}
            value={effectiveRepo}
            onChange={setEffectiveRepo}
            labelEn="Repository for this issue"
            labelJa="この Issue のリポジトリ"
          />
        ) : null}

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
                  repoFilter={effectiveRepo}
                />
              ) : null}
            </span>
          </label>
        </div>
        <p className="text-[11px] text-gray-500">
          {t(
            'Choose the repository first. Create opens a new issue there; Link lists open issues from that repo only.',
            '先にリポジトリを選んでください。作成はそのリポジトリに Issue を作り、リンクはそのリポジトリの open Issue のみ表示します。'
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
        </div>
      ) : canLink ? (
        <div className="space-y-2">
          {repos.length > 0 ? (
            <RepoSelect
              language={language}
              repos={repos}
              value={effectiveRepo}
              onChange={setEffectiveRepo}
              disabled={pending !== null}
              labelEn="Repository for this issue"
              labelJa="この Issue のリポジトリ"
            />
          ) : null}
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
            repoFilter={effectiveRepo}
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
              'Select the repository first, then Create or pick an issue from that repo.',
              '先にリポジトリを選び、作成するか、そのリポジトリの Issue を選んでリンクします。'
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
