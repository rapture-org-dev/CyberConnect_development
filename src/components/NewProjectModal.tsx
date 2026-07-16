import { useState } from 'react';
import type { Project } from '@/types';
import { X, Plus, Loader } from 'lucide-react';

interface Props {
  onClose: () => void;
  onAdd: (project: Partial<Project>) => Promise<void>;
  workspaceType?: 'team' | 'personal';
}

export function NewProjectModal({ onClose, onAdd, workspaceType = 'team' }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameJa, setNameJa] = useState('');
  const [client, setClient] = useState('');
  const [desc, setDesc] = useState('');
  const [githubFull, setGithubFull] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsCreating(true);
    try {
      await onAdd({
        name: name.trim(),
        name_ja: nameJa.trim() || name.trim(),
        client: client.trim() || (workspaceType === 'personal' ? 'Personal' : 'TBD'),
        description: desc.trim(),
        workspace_type: workspaceType,
        github_full: githubFull.trim(),
      } as Partial<Project> & { github_full?: string });
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create project.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-lg p-6 animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {workspaceType === 'personal' ? 'New Personal Project' : 'New Team Project'}
            </h2>
            <p className="text-xs text-gray-500">
              {workspaceType === 'personal' ? '個人プロジェクトの作成' : '新規プロジェクト作成'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Project Name</label>
              <input 
                autoFocus
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
                placeholder="e.g. Portfolio"
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40" 
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Name (JA)</label>
              <input value={nameJa} onChange={e => setNameJa(e.target.value)} placeholder="プロジェクト名"
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
          </div>

          {workspaceType === 'team' && (
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Client Name</label>
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client company name"
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Description</label>
            <textarea 
              value={desc} 
              onChange={e => setDesc(e.target.value)} 
              placeholder="Brief project description"
              rows={3}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none" 
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">GitHub repository (optional)</label>
            <input
              value={githubFull}
              onChange={(e) => setGithubFull(e.target.value)}
              placeholder="owner/repo e.g. rapture-org-dev/MyApp"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Used for Tasks ↔ GitHub Issues. Leave empty to use the app default repo from env.
            </p>
          </div>

          <button type="submit" disabled={!name.trim() || isCreating}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 ${workspaceType === 'personal' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' : 'bg-brand-600 hover:bg-brand-500 shadow-brand-600/20'} disabled:opacity-50 text-white rounded-xl font-medium text-sm transition-all shadow-lg`}>
            {isCreating ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Project
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
