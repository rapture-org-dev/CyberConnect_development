import { useState, useEffect, useMemo } from 'react';
import type { Project, SheetRow, UserProfile } from '@/types';
import {
  FolderOpen,
  CheckCircle,
  Clock,
  Pause,
  Users,
  ListChecks,
  AlertTriangle,
  X,
  ChevronDown,
  BarChart3,
  Sparkles,
  Loader,
  Info,
  Pencil,
  ArrowRight,
} from 'lucide-react';
import { getUserName, translate, type Language, userCanEditTeamProjectContent } from '@/lib/data';
import { useWorkspace } from '@/components/WorkspaceProvider';
import type { GlobalTaskStats } from '@/lib/dal/stats';

import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { EditProjectModal } from '@/components/EditProjectModal';

interface Props {
  /** URL slug for permission helpers. */
  teamSlug: string;
  projects: Project[];
  getSheetData: (projectId: string, sheetId: string) => SheetRow[];
  /** Navigate into the project workspace (sheets). */
  onSelectProject: (projectId: string) => void;
  onUpdateProject: (projectId: string, updates: Partial<Project>) => void;
  onAssignMember: (projectId: string, profileId: string, role: string) => Promise<void>;
  onRemoveMember: (projectId: string, profileId: string) => Promise<void>;
  onAddProject: (project: Partial<Project>) => Promise<void>;
  onDeleteProject?: (projectId: string) => void;
  serverStats: GlobalTaskStats;
  /** Company admin or billing owner — may assign PM/Dev and invite by policy. */
  canAssignProjectRoles?: boolean;
  /** Whether the current user may delete this project (admin/owner or assigned PM). */
  canDeleteProject?: (project: Project) => boolean;
}

const PROJECT_COLORS = [
  'from-brand-500 to-brand-700',
  'from-emerald-500 to-emerald-700',
  'from-rose-500 to-rose-700',
  'from-amber-500 to-amber-700',
  'from-violet-500 to-violet-700',
  'from-cyan-500 to-cyan-700',
];

export function AdminView({
  teamSlug,
  projects,
  getSheetData,
  onSelectProject,
  onUpdateProject,
  onAssignMember,
  onRemoveMember,
  onAddProject,
  onDeleteProject,
  serverStats,
  canAssignProjectRoles = true,
  canDeleteProject = () => true,
}: Props) {
  const {
    loggedInUser,
    teamPool,
    language,
    patchProjectLocal,
    teamMemberships,
    selectedAdminProjectId,
    setSelectedAdminProjectId,
  } = useWorkspace();
  const [editingPm, setEditingPm] = useState<string | null>(null);
  const [editingDevs, setEditingDevs] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<{ projectId: string; role: 'pm' | 'developer' | 'client' } | null>(null);
  const [showDeleteConfirmFor, setShowDeleteConfirmFor] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedAdminProjectId(null);
      return;
    }
    if (!selectedAdminProjectId || !projects.some(p => p.id === selectedAdminProjectId)) {
      setSelectedAdminProjectId(projects[0].id);
    }
  }, [projects, selectedAdminProjectId, setSelectedAdminProjectId]);

  const selectedProject =
    projects.find(p => p.id === selectedAdminProjectId) ?? null;

  // Step 3: Force Render in ProjectCard (UI Level)
  // Ensure that even if context pool is 0, the currently logged-in user is visible.
  const finalTeamPool = useMemo(() => {
    let pool = [...teamPool];
    if (loggedInUser) {
      const exists = pool.find(u => u.id === loggedInUser.id);
      if (!exists) {
        pool.push({
          ...loggedInUser,
          name: loggedInUser.name || 'You (Admin)'
        } as UserProfile);
      }
    }
    return pool;
  }, [teamPool, loggedInUser]);

  // Seat Calculation
  const occupiedSeats = useMemo(() => {
    const staffIds = new Set<string>();
    finalTeamPool.forEach(u => {
      if (u.team_role === 'admin' || u.team_role === 'member') staffIds.add(u.id);
    });
    return staffIds.size;
  }, [finalTeamPool]);

  const remainingSeats = 20 - occupiedSeats;

  const getTaskStats = (projectId: string) => {
    const tasks = getSheetData(projectId, 'tasks');
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'Done').length;
    const inProgress = tasks.filter(
      t => t.status === 'In progress' || t.status === 'In review'
    ).length;
    const blocked = tasks.filter(t => t.status === 'Blocked').length;
    const notStarted = tasks.filter(t => t.status === 'Not started').length;
    return { total, done, inProgress, blocked, notStarted };
  };

  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  
  const { 
    total: totalTasks, 
    done: completedTasks, 
    inProgress: inProgressTasks, 
    blocked: blockedTasks, 
    notStarted: notStartedTasks 
  } = serverStats;

  const totalProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-surface-950/20">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="animate-fade-in mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-center gap-4 mb-10">
          <p className="text-gray-500 flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {translate('Global monitor', language)}
          </p>
          <div className="h-4 w-px bg-surface-800 hidden sm:block" aria-hidden />
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface-900 border border-surface-800">
            <Users className="w-3.5 h-3.5 text-brand-400" />
            <span className={`text-[11px] font-bold ${remainingSeats <= 2 ? 'text-rose-400' : 'text-gray-300'}`}>
              {translate('Staff Seats', language)}: {occupiedSeats}/20
            </span>
            {remainingSeats <= 2 && (
              <span className="text-[10px] text-rose-500 font-medium animate-pulse">({translate('Near Limit', language)})</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={FolderOpen} label="Total Projects" labelJa="プロジェクト総数" value={totalProjects} color="text-brand-400" language={language} />
            <StatCard icon={CheckCircle} label="Active" labelJa="アクティブ" value={activeProjects} color="text-emerald-400" language={language} />
            <StatCard icon={ListChecks} label="Tasks Completed" labelJa="完了タスク" value={completedTasks} total={totalTasks} color="text-brand-400" language={language} />
            <StatCard icon={AlertTriangle} label="Blocked Items" labelJa="ブロック中" value={blockedTasks} color={blockedTasks > 0 ? 'text-rose-400' : 'text-gray-600'} language={language} />
          </div>
          <div className="bg-surface-900/60 backdrop-blur-sm border border-surface-800/60 rounded-2xl p-6 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{translate('Global Progress', language)}</span>
              <span className="text-lg font-bold text-white">{totalProgress}%</span>
            </div>
            <div className="relative h-20 flex items-center justify-center">
              <svg className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="36" fill="transparent" stroke="currentColor" strokeWidth="6" className="text-surface-800" />
                <circle cx="40" cy="40" r="36" fill="transparent" stroke="currentColor" strokeWidth="6" strokeDasharray={2 * Math.PI * 36} strokeDashoffset={2 * Math.PI * 36 * (1 - totalProgress / 100)} className="text-brand-500 transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-brand-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          <div className="xl:col-span-2 bg-surface-900/40 border border-surface-800/60 rounded-2xl p-8">
            <h3 className="text-white font-bold mb-8 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-400" />
              {translate('Global Task Distribution', language)}
            </h3>
            <div className="flex flex-col gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-brand-500" />
                    {translate('Completed', language)}
                  </span>
                  <span className="text-white font-medium">{completedTasks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    {translate('In progress', language)}
                  </span>
                  <span className="text-white font-medium">{inProgressTasks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500" />
                    {translate('Blocked', language)}
                  </span>
                  <span className="text-white font-medium">{blockedTasks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-surface-700" />
                    {translate('Not Started', language)}
                  </span>
                  <span className="text-white font-medium">{notStartedTasks}</span>
                </div>
              </div>
              
              <div className="h-4 w-full bg-surface-800 rounded-full flex overflow-hidden">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${(completedTasks/totalTasks)*100}%` }} title="Completed" />
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${(inProgressTasks/totalTasks)*100}%` }} title="In Progress" />
                <div className="h-full bg-rose-500 transition-all" style={{ width: `${(blockedTasks/totalTasks)*100}%` }} title="Blocked" />
                <div className="h-full bg-surface-700 transition-all" style={{ width: `${(notStartedTasks/totalTasks)*100}%` }} title="Not Started" />
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-brand-600/10 to-indigo-600/10 border border-brand-500/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-brand-400" />
            </div>
            <h3 className="text-white font-bold mb-2">{translate('Platform Status', language)}</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              All project systems are running optimally. Total data synced across projects.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="bg-surface-900/60 p-3 rounded-xl border border-surface-800/60">
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Health</div>
                <div className="text-emerald-400 font-bold">100%</div>
              </div>
              <div className="bg-surface-900/60 p-3 rounded-xl border border-surface-800/60">
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Latency</div>
                <div className="text-brand-300 font-bold">12ms</div>
              </div>
            </div>
          </div>
        </div>

        {selectedProject ? (
          <div className="mb-12">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{translate('Project overview', language)}</h2>
                <p className="text-xs text-gray-500 mt-1">{selectedProject.client || 'TBD'}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelectProject(selectedProject.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-brand-500/35 bg-brand-600/10 px-4 py-2 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-600/20"
              >
                {language === 'ja' ? 'ワークスペースを開く' : 'Open workspace'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="max-w-3xl">
              {(() => {
                const project = selectedProject;
                const stats = getTaskStats(project.id);
                const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
                const StatusIcon = project.status === 'active' ? CheckCircle : project.status === 'on_hold' ? Pause : Clock;
                const statusColor = project.status === 'active' ? 'text-emerald-400' : project.status === 'on_hold' ? 'text-amber-400' : 'text-brand-400';

                return (
                  <div key={project.id} className="group relative">
                    <div className="h-full bg-surface-900/40 hover:bg-surface-900/60 backdrop-blur-sm border border-surface-800/60 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-brand-500/5 hover:-translate-y-1">
                      <div className="flex items-start justify-between mb-5 cursor-pointer" onClick={() => onSelectProject(project.id)}>
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${project.color} flex items-center justify-center shadow-lg transition-transform group-hover:scale-105`}>
                            <FolderOpen className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h3 className="text-white font-bold group-hover:text-brand-300 transition-colors leading-tight">
                              {project.name || 'Untitled Project'}
                            </h3>
                            <p className="text-gray-500 text-xs font-medium mt-0.5">{project.client || 'TBD'}</p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-surface-950/40 ${statusColor}`}>
                          <StatusIcon className="w-2.5 h-2.5" />
                          <span>{project.status.replace('_', ' ')}</span>
                        </div>
                      </div>

                      <div className="mb-5">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-2">
                          <span className="text-gray-500">{translate('Progress', language)}</span>
                          <span className="text-white">{progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-brand-600 to-indigo-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center mb-6">
                        <div className="bg-surface-950/20 p-2 rounded-lg border border-surface-800/40">
                          <div className="text-[9px] text-gray-500 uppercase font-bold">{translate('Done', language)}</div>
                          <div className="text-white font-bold text-xs">{stats.done}</div>
                        </div>
                        <div className="bg-surface-950/20 p-2 rounded-lg border border-surface-800/40">
                          <div className="text-[9px] text-gray-500 uppercase font-bold">{translate('In Dev', language)}</div>
                          <div className="text-amber-400 font-bold text-xs">{stats.inProgress}</div>
                        </div>
                        <div className="bg-surface-950/20 p-2 rounded-lg border border-surface-800/40">
                          <div className="text-[9px] text-gray-500 uppercase font-bold">{translate('Block', language)}</div>
                          <div className="text-rose-400 font-bold text-xs">{stats.blocked}</div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-surface-800/60 space-y-4">
                        <div className="flex items-center justify-between group/pm">
                          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{translate('PM', language)}</span>
                          {!canAssignProjectRoles ? (
                            <span className="text-[11px] text-gray-300 font-medium">
                              {getUserName(project.pm_id || '') || '—'}
                            </span>
                          ) : editingPm === project.id ? (
                            <div className="flex-1 flex justify-end ml-4">
                              <select
                                value={project.pm_id || ''}
                                onChange={async e => {
                                  const sid = e.target.value;
                                  if (!sid) {
                                    if (project.pm_id) {
                                      await onRemoveMember(project.id, project.pm_id);
                                      onUpdateProject(project.id, { pm_id: null });
                                    }
                                    setEditingPm(null);
                                    return;
                                  }

                                  const member = finalTeamPool.find(u => u.id === sid);
                                  const isStaff = member?.team_role === 'admin' || member?.team_role === 'member';

                                  if (!isStaff && remainingSeats <= 0) {
                                    alert('Cannot assign. Team is at 20/20 staff limit.');
                                    return;
                                  }
                                  try {
                                    await onAssignMember(project.id, sid, 'pm');
                                    onUpdateProject(project.id, { pm_id: sid });
                                    setEditingPm(null);
                                  } catch (err: any) {
                                    alert(err.message || 'Failed to assign PM');
                                  }
                                }}
                                onBlur={() => setEditingPm(null)}
                                autoFocus
                                className="bg-surface-800 border border-brand-500 rounded px-2 py-1 text-[10px] text-white focus:outline-none w-full max-w-[140px]"
                              >
                                <option value="">Select PM</option>
                                <option value="">-- Unassign --</option>
                                {finalTeamPool.map(u => (
                                  <option key={u.id} value={u.id}>
                                    {u.name || u.email}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingPm(project.id)}
                              className="text-[11px] text-gray-300 font-medium hover:text-brand-300 transition-colors flex items-center gap-1"
                            >
                              {getUserName(project.pm_id || '')} <ChevronDown className="w-3 h-3 text-gray-600" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{translate('Developers', language)}</span>
                            {canAssignProjectRoles &&
                              (!editingDevs || editingDevs !== project.id ? (
                                <button
                                  type="button"
                                  onClick={() => setEditingDevs(project.id)}
                                  className="text-[11px] text-gray-400 font-medium hover:text-brand-300 transition-colors flex items-center gap-1"
                                >
                                  {(project.assignedDevIds || []).length > 0
                                    ? `${(project.assignedDevIds || []).length} Assigned`
                                    : 'Assign'}
                                  <ChevronDown className="w-3 h-3 text-gray-600" />
                                </button>
                              ) : (
                                <button type="button" onClick={() => setEditingDevs(null)} className="text-[10px] text-brand-400 font-bold hover:underline">
                                  Done
                                </button>
                              ))}
                          </div>

                          {canAssignProjectRoles && editingDevs === project.id && (
                            <div className="flex flex-wrap gap-1.5 p-2 bg-surface-950/40 rounded-lg border border-surface-800/60 animate-fade-in">
                              {finalTeamPool.length === 0 && <p className="text-[10px] text-gray-600 italic">No team members available</p>}
                              {finalTeamPool.map(member => {
                                const isAssigned = (project.assignedDevIds || []).includes(member.id);
                                return (
                                  <button
                                    key={member.id}
                                    title={member.email}
                                    type="button"
                                    onClick={async () => {
                                      if (isAssigned) {
                                        try {
                                          await onRemoveMember(project.id, member.id);
                                          const newDevs = (project.assignedDevIds || []).filter(id => id !== member.id);
                                          onUpdateProject(project.id, { assignedDevIds: newDevs });
                                        } catch (err: any) {
                                          alert(err.message || 'Failed to remove Developer');
                                        }
                                        return;
                                      }

                                      if (remainingSeats <= 0 && member.team_role !== 'admin' && member.team_role !== 'member') {
                                        alert('Cannot assign. Team is at 20/20 limit.');
                                        return;
                                      }
                                      try {
                                        await onAssignMember(project.id, member.id, 'dev');
                                        const newDevs = [...(project.assignedDevIds || []), member.id];
                                        onUpdateProject(project.id, { assignedDevIds: newDevs });
                                      } catch (err: any) {
                                        alert(err.message || 'Failed to assign Developer');
                                      }
                                    }}
                                    className={`text-[9px] px-2 py-0.5 rounded border transition-all ${
                                      isAssigned
                                        ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                                        : 'bg-surface-800 border-surface-700 text-gray-500 hover:text-gray-300'
                                    }`}
                                  >
                                    {member.name || member.email.split('@')[0]}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {!canAssignProjectRoles && (
                            <div className="flex flex-wrap gap-1.5">
                              {(project.assignedDevIds || []).length === 0 ? (
                                <span className="text-[10px] text-gray-600">—</span>
                              ) : (
                                (project.assignedDevIds || []).map(id => (
                                  <span
                                    key={id}
                                    className="text-[9px] px-2 py-0.5 rounded border border-surface-700 text-gray-400"
                                  >
                                    {getUserName(id)}
                                  </span>
                                ))
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
                          {canAssignProjectRoles && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditProject(project)}
                                className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-brand-400 hover:text-brand-300 transition-colors"
                              >
                                <Pencil className="w-3 h-3" aria-hidden />
                                Edit
                              </button>
                              <span className="w-1 h-1 rounded-full bg-surface-700 shrink-0" aria-hidden />
                              <button
                                type="button"
                                onClick={() => setInviteFor({ projectId: project.id, role: 'pm' })}
                                className="text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                              >
                                {translate('Invite', language)}
                              </button>
                              {canDeleteProject(project) && (
                                <span className="w-1 h-1 rounded-full bg-surface-700 shrink-0" aria-hidden />
                              )}
                            </>
                          )}
                          {canDeleteProject(project) && (
                            <button
                              type="button"
                              onClick={() => setShowDeleteConfirmFor(project.id)}
                              className="text-[9px] font-bold uppercase tracking-widest text-rose-500/80 hover:text-rose-400 transition-colors"
                            >
                              {translate('Delete', language)}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="mb-12 rounded-2xl border border-dashed border-surface-700 p-12 text-center text-sm text-gray-500">
            {language === 'ja' ? 'サイドバーのリストからプロジェクトを選択してください' : 'Select a project from the sidebar list'}
          </div>
        )}

        {inviteFor && (
          <InviteModal
            initialRole={inviteFor.role}
            remainingSeats={remainingSeats}
            onClose={() => setInviteFor(null)}
            onInvite={(emails, role) => {
              setInviteFor(null);
            }}
          />
        )}
        {showDeleteConfirmFor && (
          <DeleteConfirmModal
            project={projects.find(p => p.id === showDeleteConfirmFor)!}
            onClose={() => setShowDeleteConfirmFor(null)}
            onConfirm={(id) => {
              if (typeof onDeleteProject === 'function') {
                onDeleteProject(id);
              } else {
                const ev = new CustomEvent('admin:deleteProject', { detail: id });
                window.dispatchEvent(ev);
              }
              setShowDeleteConfirmFor(null);
            }}
          />
        )}

        {editProject && (
          <EditProjectModal
            project={editProject}
            onClose={() => setEditProject(null)}
            onSaved={updates => patchProjectLocal(editProject.id, updates)}
            onNotify={msg => setToast(msg)}
          />
        )}

        {toast && (
          <div
            className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm shadow-lg border border-emerald-500/30"
            role="status"
          >
            {toast}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, labelJa, value, total, color, language }: {
  icon: typeof FolderOpen; label: string; labelJa: string; value: string | number; total?: number; color: string;
  language: Language;
}) {
  const primary = language === 'ja' ? labelJa : label;
  const secondary = language === 'ja' ? label : labelJa;
  return (
    <div className="bg-surface-900/60 backdrop-blur-sm border border-surface-800/60 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-xl bg-surface-950/40 border border-surface-800/60 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{secondary}</div>
      </div>
      <div className="flex items-end gap-2">
        <p className={`text-3xl font-bold text-white`}>{value}</p>
        {total !== undefined && <p className="text-gray-600 text-sm mb-1">/ {total}</p>}
      </div>
      <p className="text-xs text-gray-500 mt-1 font-medium">{primary}</p>
    </div>
  );
}

function InviteModal({ initialRole, remainingSeats, onClose, onInvite }: { 
  initialRole?: 'pm' | 'developer' | 'client'; 
  remainingSeats: number;
  onClose: () => void; 
  onInvite: (emails: string, role: 'pm' | 'developer' | 'client') => void 
}) {
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<'pm' | 'developer' | 'client'>(initialRole || 'developer');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'client' && remainingSeats <= 0) {
      alert('Team is at its 20/20 staff limit. Only Client roles can be invited right now.');
      return;
    }
    onInvite(emails, role);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-md p-6 animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">Invite to project</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
        </div>
        
        <div className="flex items-start gap-3 bg-brand-500/10 border border-brand-500/20 p-4 rounded-xl mb-6">
          <Info className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
          <p className="text-xs text-brand-300 leading-relaxed">
            <strong>Team Pool Notice:</strong> Users must be invited to the overall Team before they can be assigned to specific Project roles.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Emails</label>
            <input value={emails} onChange={e => setEmails(e.target.value)} placeholder="colleague@company.com"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Project Role</label>
            <select value={role} onChange={e => setRole(e.target.value as 'pm' | 'developer' | 'client')} className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200">
              <option value="developer">Developer (Staff Seat)</option>
              <option value="pm">Project Manager (Staff Seat)</option>
              <option value="client">Client (No Seat Required)</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-surface-800 border border-surface-700 text-gray-300">Cancel</button>
            <button type="submit" className="text-sm px-4 py-2 rounded-lg bg-brand-600 text-white font-bold hover:bg-brand-500 transition-all">Invite</button>
          </div>
        </form>
      </div>
    </div>
  );
}

