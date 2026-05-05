import type { Project, SheetRow, UserProfile } from '@/types';
import { Code, CheckCircle, Clock, AlertTriangle, FileCode } from 'lucide-react';
import { getLocalizedProjectName, getTaskAssigneeProfileIdForProject, translate, type Language } from '@/lib/data';
import { DashboardLanguageToggle } from '@/components/dashboard/DashboardLanguageToggle';

interface Props {
  projects: Project[];
  sheetData: Record<string, Record<string, SheetRow[]>>;
  onSelectProject: (projectId: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  user: UserProfile;
}

function moreTechLabel(n: number, language: Language) {
  if (language === 'ja') return `他${n}件`;
  return `+${n} more`;
}

export function DevView({ projects, sheetData, onSelectProject, language, onLanguageChange, user }: Props) {
  if (projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-950/20">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 bg-surface-900 rounded-3xl border border-surface-800 flex items-center justify-center mx-auto mb-6 shadow-xl">
            <Code className="w-10 h-10 text-gray-700" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{translate('No developer assignments', language)}</h2>
          <p className="text-gray-500 max-w-sm mx-auto">
            {translate('You are not currently assigned to any team projects as a Developer.', language)}
          </p>
        </div>
      </div>
    );
  }

  const myAssignedTasks: any[] = projects.flatMap(p => {
    const tasks = (sheetData[p.id]?.['tasks'] || []) as SheetRow[];
    // Filter tasks assigned to the current user
    return tasks
      .filter(t => getTaskAssigneeProfileIdForProject(t, p) === user.id)
      .map(t => ({ ...t, projectName: p.name, projectId: p.id }));
  });

  const stats = {
    total: myAssignedTasks.length,
    done: myAssignedTasks.filter(t => t.status === 'Done' || t.status === '完了').length,
    inProgress: myAssignedTasks.filter(
      t =>
        t.status === 'In progress' ||
        t.status === '進行中' ||
        t.status === 'In review' ||
        t.status === 'レビュー中'
    ).length,
    blocked: myAssignedTasks.filter(t => t.status === 'Blocked' || t.status === 'ブロック').length,
  };

  return (
    <div className="flex-1 overflow-auto p-10 bg-surface-950/20">
      <div className="max-w-6xl mx-auto animate-fade-in">
        <div className="mb-10 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{translate('Developer Portal', language)}</h1>
            <p className="text-gray-500 mt-1.5 flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {translate('Engineering — Task oversight and assigned system components', language)}
            </p>
          </div>
          <DashboardLanguageToggle language={language} onLanguageChange={onLanguageChange} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          <StatMini label="Assigned Tasks" value={stats.total} icon={FileCode} color="text-brand-400" language={language} />
          <StatMini label="In Progress" value={stats.inProgress} icon={Clock} color="text-amber-400" language={language} />
          <StatMini label="Completed" value={stats.done} icon={CheckCircle} color="text-emerald-400" language={language} />
          <StatMini label="Blocked" value={stats.blocked} icon={AlertTriangle} color="text-rose-400" language={language} />
        </div>

        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6">{translate('Assigned Projects', language)}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {projects.map(project => (
            <div key={project.id} onClick={() => onSelectProject(project.id)} className="group relative cursor-pointer">
              <div className="bg-surface-900/40 border border-surface-800/60 rounded-2xl p-6 hover:bg-surface-900/60 transition-all shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${project.color} flex items-center justify-center shadow-lg transition-transform group-hover:scale-105`}>
                    <Code className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold group-hover:text-brand-300 transition-colors leading-tight">{getLocalizedProjectName(project, language)}</h3>
                    <p className="text-gray-500 text-xs font-medium mt-0.5">{project.client}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">{translate('Primary Tech Stack', language)}</div>
                    <div className="flex flex-wrap gap-2">
                      {(sheetData[project.id]?.['tech_stack'] || []).slice(0, 4).map((tech, idx) => (
                        <span key={idx} className="text-[10px] px-2 py-1 rounded bg-surface-800 border border-surface-700 text-gray-400">
                          {String(tech.tech_name || tech.category || 'Tool')}
                        </span>
                      ))}
                      {(sheetData[project.id]?.['tech_stack'] || []).length > 4 && (
                        <span className="text-[10px] text-gray-600">{moreTechLabel((sheetData[project.id]?.['tech_stack'] || []).length - 4, language)}</span>
                      )}
                      {(sheetData[project.id]?.['tech_stack'] || []).length === 0 && (
                        <span className="text-[10px] text-gray-600 italic">{translate('No stack defined yet', language)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 rounded-2xl ring-2 ring-brand-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, value, icon: Icon, color, language }: { label: string; value: number; icon: typeof FileCode; color: string; language: Language }) {
  return (
    <div className="bg-surface-900/60 border border-surface-800/60 rounded-2xl p-5 flex items-center gap-4">
      <div className={`p-2.5 rounded-xl bg-surface-950/40 border border-surface-800/60 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{translate(label, language)}</div>
        <div className="text-xl font-bold text-white leading-tight mt-0.5">{value}</div>
      </div>
    </div>
  );
}
