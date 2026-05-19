import { useState } from 'react';
import type { Project } from '@/types';
import { UserRound, Plus, Circle, Pause, CheckCircle, Sparkles, Building2, Loader, X, Trash2, ArrowRight } from 'lucide-react';
import { joinTeamByInviteCodeAction, purchaseTeamPlanAction } from '@/lib/api/client';
import { updateActiveRoleAction } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { NewProjectModal } from '@/components/NewProjectModal';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { getLocalizedProjectName, translate, type Language } from '@/lib/data';
import { DashboardLanguageToggle } from '@/components/dashboard/DashboardLanguageToggle';

interface Props {
  projects: Project[];
  getTaskStats: (projectId: string) => { total: number; done: number; inProgress: number; notStarted: number };
  onSelectProject: (projectId: string) => void;
  onAddProject: (project: Partial<Project>) => Promise<void>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  showPurchaseButton?: boolean;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

const statusMeta: Record<Project['status'], { icon: typeof Circle; color: string; labelKey: string }> = {
  active: { icon: Circle, color: 'text-emerald-400', labelKey: 'Active' },
  completed: { icon: CheckCircle, color: 'text-brand-400', labelKey: 'Completed' },
  on_hold: { icon: Pause, color: 'text-amber-400', labelKey: 'On Hold' },
};

export function PersonalView({ projects, getTaskStats, onSelectProject, onAddProject, onDeleteProject, showPurchaseButton, language, onLanguageChange }: Props) {
  const router = useRouter();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showDeleteConfirmFor, setShowDeleteConfirmFor] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName || !teamSlug) return;
    
    setIsPurchasing(true);
    setError('');
    
    const res = await purchaseTeamPlanAction(teamName, teamSlug);
    if (res.success) {
      setShowPurchaseModal(false);
      // Hard redirect to the new company dashboard
      router.push(`/${teamSlug}/admin/dashboard`);
    } else {
      setError(res.error || 'Failed to create team');
      setIsPurchasing(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setIsJoining(true);
    setJoinError('');

    const res = await joinTeamByInviteCodeAction(joinCode);
    if (!res.success || !res.teamSlug) {
      setJoinError(res.error || 'Failed to join team');
      setIsJoining(false);
      return;
    }

    await updateActiveRoleAction('admin', res.teamSlug);
    setShowJoinModal(false);
    setJoinCode('');
    router.push(`/${res.teamSlug}/admin/dashboard`);
    router.refresh();
  };

  return (
    <div className="flex-1 overflow-auto p-10 bg-surface-950/20">
      <div className="max-w-5xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-10 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{translate('Your Workspace', language)}</h1>
            <p className="text-gray-500 mt-1.5 flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              {translate('Private — Manage your individual projects and roadmaps', language)}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <DashboardLanguageToggle language={language} onLanguageChange={onLanguageChange} />
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-900 border border-surface-700 text-gray-300 hover:text-white hover:border-brand-500/40 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              {translate('Join Team', language)}
            </button>
            {showPurchaseButton && (
              <button
                onClick={() => setShowPurchaseModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/20 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                <Building2 className="w-3.5 h-3.5" />
                {translate('Create Your Team', language)}
              </button>
            )}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-widest">
              <Sparkles className="w-3 h-3" />
              {translate('Personal Free Plan', language)}
            </div>
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {translate('New Project', language)}
            </button>
          </div>
        </div>

        {/* New Project Modal */}
        {showNewProjectModal && (
          <NewProjectModal 
            workspaceType="personal"
            onClose={() => setShowNewProjectModal(false)}
            onAdd={onAddProject}
          />
        )}

        {/* Delete Confirm Modal */}
        {showDeleteConfirmFor && (
          <DeleteConfirmModal
            project={projects.find(p => p.id === showDeleteConfirmFor)!}
            onClose={() => setShowDeleteConfirmFor(null)}
            onConfirm={async (id) => {
              if (onDeleteProject) {
                await onDeleteProject(id);
              }
              setShowDeleteConfirmFor(null);
            }}
          />
        )}

        {/* Purchase Modal */}
        {showPurchaseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-surface-900 border border-surface-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <button onClick={() => setShowPurchaseModal(false)} className="text-gray-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <h2 className="text-2xl font-bold text-white mb-2">{translate('Upgrade to Team', language)}</h2>
                <p className="text-gray-500 text-sm mb-8">
                  {translate('Create a professional workspace to collaborate with your team and manage multiple projects.', language)}
                </p>

                <form onSubmit={handlePurchase} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{translate('Company Name', language)}</label>
                    <input
                      autoFocus
                      required
                      type="text"
                      placeholder="e.g. Acme Corp"
                      value={teamName}
                      onChange={(e) => {
                        setTeamName(e.target.value);
                        if (!teamSlug) setTeamSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                      }}
                      className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{translate('Company Slug (URL)', language)}</label>
                    <div className="relative">
                      <input
                        required
                        type="text"
                        placeholder="acme-corp"
                        value={teamSlug}
                        onChange={(e) => setTeamSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                        className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 pl-12 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 text-sm font-medium">/</div>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                      {error}
                    </div>
                  )}

                  <button
                    disabled={isPurchasing || !teamName || !teamSlug}
                    className="w-full mt-6 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3"
                  >
                    {isPurchasing ? <Loader className="w-5 h-5 animate-spin" /> : translate('Confirm & Purchase', language)}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {showJoinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-surface-900 border border-surface-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">{translate('Join Team by Code', language)}</h2>
                    <p className="text-gray-500 text-sm mt-1">{translate('Enter the invite code from your team admin.', language)}</p>
                  </div>
                  <button onClick={() => setShowJoinModal(false)} className="text-gray-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleJoinTeam} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{translate('Invite Code', language)}</label>
                    <input
                      autoFocus
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value)}
                      placeholder="TEAM-XXXXXX"
                      className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors font-mono uppercase tracking-widest"
                    />
                  </div>

                  {joinError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                      {joinError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isJoining || !joinCode.trim()}
                    className="w-full py-4 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:hover:bg-brand-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-brand-600/20 flex items-center justify-center gap-3"
                  >
                    {isJoining ? <Loader className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    {translate('Join Team', language)}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="bg-surface-900/40 border-2 border-dashed border-surface-800 rounded-3xl p-16 text-center">
            <div className="w-20 h-20 bg-surface-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <UserRound className="w-10 h-10 text-gray-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{translate('Build something amazing', language)}</h2>
            <p className="text-gray-500 max-w-xs mx-auto mb-8">
              {translate('Start your first personal project to organize your bilingual requirements and tasks.', language)}
            </p>
            <button 
              onClick={() => setShowNewProjectModal(true)}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              {translate('Create Your First Project', language)}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map(project => {
              const st = statusMeta[project.status];
              const StIcon = st.icon;
              const stats = getTaskStats(project.id);
              const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

              return (
                <div key={project.id} className="group relative">
                  <div 
                    onClick={() => onSelectProject(project.id)}
                    className="h-full bg-surface-900/40 hover:bg-surface-900/60 backdrop-blur-sm border border-surface-800/60 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-brand-500/5 hover:-translate-y-1 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${project.color} flex items-center justify-center shadow-lg transition-transform group-hover:scale-105`}>
                          <UserRound className="w-7 h-7 text-white" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg group-hover:text-brand-300 transition-colors leading-tight">{getLocalizedProjectName(project, language)}</h3>
                          <p className="text-gray-500 text-xs font-medium mt-0.5">{translate('Created', language)} {new Date(project.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-surface-950/40 ${st.color} border border-surface-800/60`}>
                        <StIcon className="w-2.5 h-2.5" />
                        <span>{translate(st.labelKey, language)}</span>
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-2">
                        <span className="text-gray-500">{translate('Progress', language)}</span>
                        <span className="text-white">{progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-600 to-brand-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-surface-800/60">
                      <div className="flex gap-4">
                        <div className="text-center">
                          <div className="text-[9px] text-gray-600 uppercase font-bold mb-0.5">{translate('Tasks', language)}</div>
                          <div className="text-white font-bold text-sm">{stats.total}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[9px] text-gray-600 uppercase font-bold mb-0.5">{translate('Completed', language)}</div>
                          <div className="text-emerald-400 font-bold text-sm">{stats.done}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirmFor(project.id);
                          }}
                          className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-colors"
                          title={translate('Delete Project', language)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                          {translate('Open Workspace', language)} →
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
