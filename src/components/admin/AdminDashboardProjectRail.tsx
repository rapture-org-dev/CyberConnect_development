'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  CheckCircle,
  Clock,
  Pause,
  Plus,
  Lock,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { translate, userCanEditTeamProjectContent } from '@/lib/data';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { DashboardLanguageToggle } from '@/components/dashboard/DashboardLanguageToggle';
import { NewProjectModal } from '@/components/NewProjectModal';

interface Props {
  teamSlug: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function AdminDashboardProjectRail({ teamSlug, collapsed, onCollapsedChange }: Props) {
  const {
    loggedInUser,
    language,
    setLanguage,
    teamMemberships,
    selectedAdminProjectId,
    setSelectedAdminProjectId,
    sheetData,
    handleAddProject,
    visibleProjects,
    projects,
  } = useWorkspace();

  const displayProjects = visibleProjects?.length ? visibleProjects : projects;

  const [sidebarQuery, setSidebarQuery] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    if (displayProjects.length === 0) {
      setSelectedAdminProjectId(null);
      return;
    }
    if (!selectedAdminProjectId || !displayProjects.some(p => p.id === selectedAdminProjectId)) {
      setSelectedAdminProjectId(displayProjects[0].id);
    }
  }, [displayProjects, selectedAdminProjectId, setSelectedAdminProjectId]);

  const filteredSidebarProjects = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    const sorted = [...displayProjects].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
    if (!q) return sorted;
    return sorted.filter(p => {
      const name = (p.name || '').toLowerCase();
      const client = (p.client || '').toLowerCase();
      return name.includes(q) || client.includes(q);
    });
  }, [displayProjects, sidebarQuery]);

  const getTaskStats = (projectId: string) => {
    const tasks = sheetData[projectId]?.['tasks'] ?? [];
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'Done').length;
    const inProgress = tasks.filter(
      t => t.status === 'In progress' || t.status === 'In review'
    ).length;
    const blocked = tasks.filter(t => t.status === 'Blocked').length;
    const notStarted = tasks.filter(t => t.status === 'Not started').length;
    return { total, done, inProgress, blocked, notStarted };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={`shrink-0 space-y-3 border-b border-surface-700 transition-[padding] duration-300 ${
          collapsed ? 'p-2' : 'px-2 pb-3 pt-2'
        }`}
      >
        <div className={`flex gap-2 ${collapsed ? 'flex-col items-stretch' : 'flex-row items-center'}`}>
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className={`flex shrink-0 items-center justify-center rounded-xl border border-surface-700 bg-surface-800/80 text-gray-400 transition-all duration-200 hover:border-surface-600 hover:bg-surface-800 hover:text-white ${
              collapsed ? 'h-10 w-full' : 'h-10 w-10'
            }`}
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? language === 'ja'
                  ? 'サイドバーを展開'
                  : 'Expand sidebar'
                : language === 'ja'
                  ? 'サイドバーを折りたたむ'
                  : 'Collapse sidebar'
            }
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setShowNewProject(true)}
            className={`flex items-center justify-center gap-2 rounded-xl bg-brand-600 font-bold text-white shadow-lg shadow-brand-600/25 transition-all duration-200 hover:bg-brand-500 active:scale-[0.98] ${
              collapsed ? 'h-10 w-full px-0 py-0 text-sm' : 'min-w-0 flex-1 px-4 py-2.5 text-sm'
            }`}
            title={translate('New Project', language)}
          >
            <Plus className={`shrink-0 ${collapsed ? 'h-5 w-5' : 'h-4 w-4'}`} />
            {!collapsed && <span>{translate('New Project', language)}</span>}
          </button>
        </div>
        {!collapsed && (
          <div className="relative overflow-hidden transition-opacity duration-200">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" aria-hidden />
            <input
              type="search"
              value={sidebarQuery}
              onChange={e => setSidebarQuery(e.target.value)}
              placeholder={language === 'ja' ? 'プロジェクトを検索' : 'Search projects'}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 py-2 pl-9 pr-3 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/35"
              aria-label="Search projects"
            />
          </div>
        )}
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3 transition-[padding] duration-300 ${
          collapsed ? 'px-1' : 'px-1.5'
        }`}
      >
        {filteredSidebarProjects.length === 0 ? (
          <p
            className={`text-center text-xs text-gray-500 ${collapsed ? 'px-0 leading-tight' : 'px-1'}`}
            title={language === 'ja' ? '該当するプロジェクトがありません' : 'No matching projects'}
          >
            {collapsed ? '—' : language === 'ja' ? '該当するプロジェクトがありません' : 'No matching projects'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredSidebarProjects.map(project => {
              const stats = getTaskStats(project.id);
              const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
              const StatusIcon = project.status === 'active' ? CheckCircle : project.status === 'on_hold' ? Pause : Clock;
              const statusColor =
                project.status === 'active'
                  ? 'text-emerald-400'
                  : project.status === 'on_hold'
                    ? 'text-amber-400'
                    : 'text-gray-400';
              const editable = userCanEditTeamProjectContent(loggedInUser?.id, project, teamSlug, teamMemberships);
              const selected = selectedAdminProjectId === project.id;
              const label = project.name || 'Untitled';
              const initials = (() => {
                const t = label.trim();
                const parts = t.split(/\s+/).filter(Boolean);
                if (parts.length >= 2) {
                  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase().slice(0, 2) || '?';
                }
                const one = parts[0] ?? '';
                if (one.length >= 2) return one.slice(0, 2).toUpperCase();
                return one[0]?.toUpperCase() ?? '?';
              })();

              return (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedAdminProjectId(project.id)}
                    title={`${label} · ${project.status.replace('_', ' ')}${!editable ? ' · view-only' : ''}`}
                    className={`flex w-full rounded-xl border text-left transition-all duration-200 ${
                      collapsed ? 'flex-col items-center gap-1.5 px-1 py-2' : 'flex-col px-3 py-2.5'
                    } ${
                      selected
                        ? 'border-brand-500/45 bg-brand-600/15 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]'
                        : 'border-transparent hover:border-surface-700 hover:bg-surface-800/90'
                    } ${!editable ? 'opacity-60' : ''}`}
                  >
                    {collapsed ? (
                      <>
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-inner ${project.color || 'from-brand-500 to-brand-700'}`}
                          >
                            {initials}
                          </div>
                          {!editable && (
                            <Lock
                              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-surface-900 p-0.5 text-amber-500/90 ring-1 ring-surface-700"
                              aria-hidden
                            />
                          )}
                          {selected && (
                            <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-400 shadow-[0_0_6px_rgba(59,130,246,0.9)]" />
                          )}
                        </div>
                        <StatusIcon className={`h-3 w-3 shrink-0 ${statusColor}`} aria-hidden />
                        <div className="h-0.5 w-8 overflow-hidden rounded-full bg-surface-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-indigo-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-medium text-white">{label}</span>
                          {!editable && (
                            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/90" aria-label="View only" />
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <StatusIcon className={`h-3 w-3 shrink-0 ${statusColor}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${statusColor}`}>
                            {project.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-indigo-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className={`mt-auto shrink-0 border-t border-surface-700 transition-[padding] duration-300 ${
          collapsed ? 'p-2' : 'px-2 py-3'
        }`}
      >
        <DashboardLanguageToggle
          language={language}
          onLanguageChange={setLanguage}
          compact={collapsed}
          className="w-full justify-center"
        />
      </div>

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onAdd={handleAddProject} />}
    </div>
  );
}
