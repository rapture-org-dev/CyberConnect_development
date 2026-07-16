'use client';

import { useState, useEffect } from 'react';
import type { Project } from '@/types';
import { X, Loader } from 'lucide-react';
import { updateTeamProjectCoreDetailsAction } from '@/lib/api/client';
import { formatGitHubOwnerRepo, parseGitHubReposList } from '@/lib/githubRepo';
import { ProjectGitHubReposEditor } from '@/components/ProjectGitHubReposEditor';

interface Props {
  project: Project;
  onClose: () => void;
  /** Applied after a successful server save (no second API write). */
  onSaved: (updates: Partial<Project>) => void;
  onNotify: (message: string) => void;
}

function reposFromProject(project: Project): string[] {
  try {
    const fromList = parseGitHubReposList(project.github_repos);
    if (fromList.length > 0) {
      return fromList.map((r) => formatGitHubOwnerRepo(r.owner, r.repo));
    }
  } catch {
    /* ignore */
  }
  const one = formatGitHubOwnerRepo(project.github_owner, project.github_repo);
  return one ? [one] : [''];
}

export function EditProjectModal({ project, onClose, onSaved, onNotify }: Props) {
  const [name, setName] = useState(project.name || '');
  const [nameJa, setNameJa] = useState(project.name_ja || project.nameJa || '');
  const [client, setClient] = useState(project.client || '');
  const [desc, setDesc] = useState(project.description || '');
  const [githubRepos, setGithubRepos] = useState(() => reposFromProject(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(project.name || '');
    setNameJa(project.name_ja || project.nameJa || '');
    setClient(project.client || '');
    setDesc(project.description || '');
    setGithubRepos(reposFromProject(project));
    setError('');
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Project name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const repos = githubRepos.map((r) => r.trim()).filter(Boolean);
      const res = await updateTeamProjectCoreDetailsAction(project.id, {
        name: trimmed,
        name_ja: nameJa.trim(),
        client: client.trim(),
        description: desc.trim(),
        github_repos: repos,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to save');
      }
      onSaved(res.data as Partial<Project>);
      onNotify('Project updated successfully');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-lg p-6 animate-fade-in shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 id="edit-project-title" className="text-lg font-semibold text-white">
              Edit project
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Update name, client, description, and GitHub repos
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Project Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Portfolio"
                disabled={saving}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Name (JA)</label>
              <input
                value={nameJa}
                onChange={(e) => setNameJa(e.target.value)}
                placeholder="プロジェクト名"
                disabled={saving}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Client Name</label>
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Client company name"
              disabled={saving}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Brief project description"
              rows={3}
              disabled={saving}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none disabled:opacity-50"
            />
          </div>

          <ProjectGitHubReposEditor
            values={githubRepos}
            onChange={setGithubRepos}
            disabled={saving}
          />

          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-surface-700 text-gray-300 hover:text-white hover:bg-surface-800 text-sm disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium disabled:opacity-50 min-w-[100px]"
            >
              {saving ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
