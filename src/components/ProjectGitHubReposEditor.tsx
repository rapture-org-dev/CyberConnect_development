'use client';

import { Plus, Trash2 } from 'lucide-react';

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Hint under the list */
  hint?: string;
}

/** Editable list of GitHub owner/repo (or URL) bindings for a project. */
export function ProjectGitHubReposEditor({ values, onChange, disabled, hint }: Props) {
  const rows = values.length > 0 ? values : [''];

  const setAt = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const addRow = () => onChange([...rows, '']);

  const removeAt = (index: number) => {
    if (rows.length <= 1) {
      onChange(['']);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500 mb-0.5 block">GitHub repositories</label>
      {rows.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setAt(index, e.target.value)}
            placeholder={
              index === 0
                ? 'owner/repo (primary) e.g. rapture-org-dev/App'
                : 'owner/repo (additional)'
            }
            disabled={disabled}
            className="min-w-0 flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => removeAt(index)}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-surface-600 px-2 text-gray-400 hover:text-rose-300 hover:bg-surface-800 disabled:opacity-40"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={addRow}
        className="inline-flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 disabled:opacity-40"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another repository
      </button>
      <p className="text-[11px] text-gray-500">
        {hint ??
          'First repo is primary (Create default). All listed repos appear in the Issues dropdown. Empty = app env default.'}
      </p>
    </div>
  );
}
