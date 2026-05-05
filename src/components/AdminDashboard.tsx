import { useState } from 'react';
import type { Project, SheetRow } from '@/types';
import { FolderOpen, CheckCircle, Clock, Pause, Users, ListChecks, AlertTriangle, Plus, X, ChevronDown, BarChart3, Sparkles } from 'lucide-react';
import { getUserName, getProfilesByRole, getAssignableTeamProfiles } from '@/lib/data';

interface Props {
  projects: Project[];
  getSheetData: (projectId: string, sheetId: string) => SheetRow[];
  onSelectProject: (projectId: string) => void;
  onUpdateProject: (projectId: string, updates: Partial<Project>) => void;
  onAddProject: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
}

const PROJECT_COLORS = [
  'from-brand-500 to-brand-700',
  'from-emerald-500 to-emerald-700',
  'from-rose-500 to-rose-700',
  'from-amber-500 to-amber-700',
  'from-violet-500 to-violet-700',
  'from-cyan-500 to-cyan-700',
];

export function AdminDashboard({ projects, getSheetData, onSelectProject, onUpdateProject, onAddProject, onDeleteProject }: Props) {
  // Note: onDeleteProject is forwarded via window event or can be passed in Props in future
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingPm, setEditingPm] = useState<string | null>(null);
  const [editingDevs, setEditingDevs] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<{ projectId: string; role: 'pm' | 'developer' | 'client' } | null>(null);
  const [showDeleteConfirmFor, setShowDeleteConfirmFor] = useState<string | null>(null);

  const assignableTeam = getAssignableTeamProfiles();

  const pmGroups = new Map<string, Project[]>();
  for (const p of projects) {
    const pmName = getUserName(p.pm_id || '');
    const list = pmGroups.get(pmName) ?? [];
    list.push(p);
    pmGroups.set(pmName, list);
  }

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
  const allTasks = projects.flatMap(p => getSheetData(p.id, 'tasks'));
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.status === 'Done').length;
  const inProgressTasks = allTasks.filter(
    t => t.status === 'In progress' || t.status === 'In review'
  ).length;
  const blockedTasks = allTasks.filter(t => t.status === 'Blocked').length;
  const notStartedTasks = allTasks.filter(t => t.status === 'Not started').length;

  const totalProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex-1 overflow-auto p-10 bg-surface-950/20">
      <div className="max-w-7xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Executive Dashboard</h1>
            <p className="text-gray-500 mt-1.5 flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Global monitor — Management overview for administrators
            </p>
          </div>
          <button
            onClick={() => setShowNewProject(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-brand-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={FolderOpen} label="Total Projects" labelJa="プロジェクト総数" value={totalProjects} color="text-brand-400" />
            <StatCard icon={CheckCircle} label="Active" labelJa="アクティブ" value={activeProjects} color="text-emerald-400" />
            <StatCard icon={ListChecks} label="Tasks Completed" labelJa="完了タスク" value={completedTasks} total={totalTasks} color="text-brand-400" />
            <StatCard icon={AlertTriangle} label="Blocked Items" labelJa="ブロック中" value={blockedTasks} color={blockedTasks > 0 ? 'text-rose-400' : 'text-gray-600'} />
          </div>
          <div className="bg-surface-900/60 backdrop-blur-sm border border-surface-800/60 rounded-2xl p-6 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Global Progress</span>
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
              Global Task Distribution
            </h3>
            <div className="flex flex-col gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-brand-500" />
                    Completed
                  </span>
                  <span className="text-white font-medium">{completedTasks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    In Progress
                  </span>
                  <span className="text-white font-medium">{inProgressTasks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500" />
                    Blocked
                  </span>
                  <span className="text-white font-medium">{blockedTasks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-surface-700" />
                    Not Started
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
            <h3 className="text-white font-bold mb-2">Platform Status</h3>
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

        {Array.from(pmGroups.entries()).map(([pmName, pmProjects]) => (
          <div key={pmName} className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-surface-900 border border-surface-800 flex items-center justify-center shadow-sm">
                <Users className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{pmName}</h2>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">{pmProjects.length} Managed Projects</p>
              </div>
              <div className="ml-auto h-px bg-surface-800 flex-1 ml-6 opacity-30" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pmProjects.map(project => {
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
                            <h3 className="text-white font-bold group-hover:text-brand-300 transition-colors leading-tight">{project.name}</h3>
                            <p className="text-gray-500 text-xs font-medium mt-0.5">{project.client}</p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-surface-950/40 ${statusColor}`}>
                          <StatusIcon className="w-2.5 h-2.5" />
                          <span>{project.status.replace('_', ' ')}</span>
                        </div>
                      </div>

                      <div className="mb-5">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-2">
                          <span className="text-gray-500">Progress</span>
                          <span className="text-white">{progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-brand-600 to-indigo-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center mb-6">
                        <div className="bg-surface-950/20 p-2 rounded-lg border border-surface-800/40">
                          <div className="text-[9px] text-gray-500 uppercase font-bold">Done</div>
                          <div className="text-white font-bold text-xs">{stats.done}</div>
                        </div>
                        <div className="bg-surface-950/20 p-2 rounded-lg border border-surface-800/40">
                          <div className="text-[9px] text-gray-500 uppercase font-bold">In Dev</div>
                          <div className="text-amber-400 font-bold text-xs">{stats.inProgress}</div>
                        </div>
                        <div className="bg-surface-950/20 p-2 rounded-lg border border-surface-800/40">
                          <div className="text-[9px] text-gray-500 uppercase font-bold">Block</div>
                          <div className="text-rose-400 font-bold text-xs">{stats.blocked}</div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-surface-800/60 space-y-3">
                        <div className="flex items-center justify-between group/pm">
                          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">PM</span>
                          {editingPm === project.id ? (
                            <select
                              value={project.pm_id || ''}
                              onChange={e => { onUpdateProject(project.id, { pm_id: e.target.value }); setEditingPm(null); }}
                              onBlur={() => setEditingPm(null)}
                              autoFocus
                              className="bg-surface-800 border border-brand-500 rounded px-2 py-1 text-[10px] text-white focus:outline-none"
                            >
                              <option value="">None</option>
                              {assignableTeam.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditingPm(project.id)} className="text-[11px] text-gray-300 font-medium hover:text-brand-300 transition-colors flex items-center gap-1">
                                {getUserName(project.pm_id || '')} <ChevronDown className="w-3 h-3 text-gray-600" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Developers</span>
                          {editingDevs === project.id ? (
                            <div className="flex flex-wrap gap-1 items-center justify-end max-w-[70%]">
                              {assignableTeam.map(member => {
                                const assigned = (project.assignedDevIds || []).includes(member.id);
                                return (
                                  <button
                                    key={member.id}
                                    onClick={() => {
                                      const devIds = project.assignedDevIds || [];
                                      const newIds = assigned ? devIds.filter(id => id !== member.id) : [...devIds, member.id];
                                      onUpdateProject(project.id, { assignedDevIds: newIds });
                                    }}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                                      assigned ? 'bg-brand-500/20 border-brand-500/40 text-brand-300' : 'bg-surface-800 border-surface-700 text-gray-500'
                                    }`}
                                  >
                                    {member.name}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <button onClick={() => setEditingDevs(project.id)} className="text-[11px] text-gray-400 font-medium hover:text-brand-300 transition-colors flex items-center gap-1">
                              {(project.assignedDevIds || []).length > 0 ? `${(project.assignedDevIds || []).length} Assigned` : 'None'}
                              <ChevronDown className="w-3 h-3 text-gray-600" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button onClick={() => setInviteFor({ projectId: project.id, role: 'pm' })} className="text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Invite</button>
                          <div className="w-1 h-1 rounded-full bg-surface-700" />
                          <button onClick={() => setShowDeleteConfirmFor(project.id)} className="text-[9px] font-bold uppercase tracking-widest text-rose-500/80 hover:text-rose-400 transition-colors">Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {showNewProject && (
          <NewProjectModal
            existingCount={projects.length}
            onClose={() => setShowNewProject(false)}
            onAdd={(p) => { onAddProject(p); setShowNewProject(false); }}
          />
        )}
        
        {inviteFor && (
          <InviteModal
            initialRole={inviteFor.role}
            onClose={() => setInviteFor(null)}
            onInvite={(emails, role) => {
              const resolved = emails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
              const updates: Partial<Project> = {};
              const addDevIds: string[] = [];
              const assignable = getAssignableTeamProfiles();
              const clients = getProfilesByRole('client');

              for (const em of resolved) {
                const u = assignable.find(p => p.email.toLowerCase() === em) || 
                          clients.find(p => p.email.toLowerCase() === em);
                if (!u) continue;
                if (role === 'pm') updates.pm_id = u.id;
                else if (role === 'developer') addDevIds.push(u.id);
                else if (role === 'client') updates.client_id = u.id;
              }
              if (addDevIds.length > 0) {
                const proj = projects.find(p => p.id === inviteFor.projectId);
                const merged = Array.from(new Set([...(proj?.assignedDevIds ?? []), ...addDevIds]));
                updates.assignedDevIds = merged;
              }
              onUpdateProject(inviteFor.projectId, updates);
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
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, labelJa, value, total, color }: {
  icon: typeof FolderOpen; label: string; labelJa: string; value: string | number; total?: number; color: string;
}) {
  return (
    <div className="bg-surface-900/60 backdrop-blur-sm border border-surface-800/60 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-xl bg-surface-950/40 border border-surface-800/60 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{labelJa}</div>
      </div>
      <div className="flex items-end gap-2">
        <p className={`text-3xl font-bold text-white`}>{value}</p>
        {total !== undefined && <p className="text-gray-600 text-sm mb-1">/ {total}</p>}
      </div>
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
    </div>
  );
}

function NewProjectModal({ existingCount, onClose, onAdd }: {
  existingCount: number;
  onClose: () => void;
  onAdd: (p: Project) => void;
}) {
  const [name, setName] = useState('');
  const [nameJa, setNameJa] = useState('');
  const [client, setClient] = useState('');
  const [desc, setDesc] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const colorIdx = existingCount % PROJECT_COLORS.length;
    onAdd({
      id: `proj-${Date.now()}`,
      name: name.trim(),
      name_ja: nameJa.trim() || name.trim(),
      client: client.trim() || 'TBD',
      pm_id: '',
      assignedDevIds: [],
      client_id: '',
      description: desc.trim(),
      description_ja: '',
      color: PROJECT_COLORS[colorIdx],
      status: 'active',
      background: '',
      background_ja: '',
      purpose: '',
      purpose_ja: '',
      dev_period: '',
      workspace_type: 'team',
      owner_id: null,
      created_at: new Date().toISOString().split('T')[0],
    } as Project);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-lg p-6 animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">New Project</h2>
            <p className="text-xs text-gray-500">新規プロジェクト作成</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Project Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="My Project"
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Name (JA)</label>
              <input value={nameJa} onChange={e => setNameJa(e.target.value)} placeholder="プロジェクト名"
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Client Name</label>
            <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client company name"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief project description"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>

          {/* Only show name, client free text and description on create (PM/Devs assigned later via Invite). */}

          <button type="submit" disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl font-medium text-sm transition-all">
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </form>
      </div>
    </div>
  );
}

function InviteModal({ initialRole, onClose, onInvite }: { initialRole?: 'pm' | 'developer' | 'client'; onClose: () => void; onInvite: (emails: string, role: 'pm' | 'developer' | 'client') => void }) {
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<'pm' | 'developer' | 'client'>(initialRole || 'developer');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInvite(emails, role);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-md p-6 animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Invite to project</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-gray-400 mb-3">Enter comma-separated emails to invite. For demo emails use @gmail.com addresses.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Emails</label>
            <input value={emails} onChange={e => setEmails(e.target.value)} placeholder="angel@gmail.com, aj@gmail.com"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as 'pm' | 'developer' | 'client')} className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200">
              <option value="developer">Developer</option>
              <option value="pm">Project Manager</option>
              <option value="client">Client</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded bg-surface-800 border border-surface-700 text-gray-300">Cancel</button>
            <button type="submit" className="text-sm px-3 py-2 rounded bg-brand-600 text-white">Invite</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ project, onClose, onConfirm }: { project: Project; onClose: () => void; onConfirm: (id: string) => void }) {
  const [word, setWord] = useState('');
  const [nameConfirm, setNameConfirm] = useState('');
  const canConfirm = word.trim().toLowerCase() === 'delete' && nameConfirm.trim() === project.name;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canConfirm) onConfirm(project.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-md p-6 animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Delete project</h3>
          <p className="text-sm text-gray-400 mt-2">This will permanently delete the project and its data. To confirm, type <span className="font-mono text-sm">delete</span> and the project name <span className="font-medium">{project.name}</span>.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type "delete"</label>
            <input value={word} onChange={e => setWord(e.target.value)} className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Project name</label>
            <input value={nameConfirm} onChange={e => setNameConfirm(e.target.value)} placeholder={project.name} className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-200" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded bg-surface-800 border border-surface-700 text-gray-300">Cancel</button>
            <button type="submit" disabled={!canConfirm} className={`text-sm px-3 py-2 rounded ${canConfirm ? 'bg-rose-500 text-white' : 'bg-surface-800 text-gray-400'}`}>Delete</button>
          </div>
        </form>
      </div>
    </div>
  );
}
