'use client';

import { useWorkspace } from '@/components/WorkspaceProvider';
import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AdminView } from './views/AdminView';
import { PMView } from './views/PMView';
import { DevView } from './views/DevView';
import { ClientView } from './views/ClientView';
import { PersonalView } from './views/PersonalView';
import { useRouter } from 'next/navigation';
import type { GlobalTaskStats } from '@/lib/dal/stats';

interface Props {
  activeRole: string;
  serverStats: GlobalTaskStats;
}

export default function DashboardDispatcher({ activeRole, serverStats }: Props) {
  const router = useRouter();
  const params = useParams();
  const { 
    projects, 
    visibleProjects,
    sheetData, 
    handleUpdateProject, 
    handleAssignMember,
    handleRemoveMember,
    handleAddProject, 
    handleDeleteProject, 
    loggedInUser,
    language,
    setLanguage,
  } = useWorkspace();

  const teamSlug =
    typeof params?.team_slug === 'string' ? params.team_slug : activeRole;

  const handleSelectProject = useCallback((projectId: string) => {
    router.push(`/${activeRole}/project/${projectId}`);
  }, [router, activeRole]);

  const getSheetData = useCallback((projectId: string, sheetId: string) => {
    return sheetData[projectId]?.[sheetId] ?? [];
  }, [sheetData]);

  const getTaskStats = useCallback((projectId: string) => {
    const tasks = sheetData[projectId]?.[ 'tasks' ] ?? [];
    return {
      total: tasks.length,
      done: tasks.filter(t => t.status === 'Done' || t.status === '完了').length,
      inProgress: tasks.filter(
        t =>
          t.status === 'In progress' ||
          t.status === '進行中' ||
          t.status === 'In review' ||
          t.status === 'レビュー中'
      ).length,
      notStarted: tasks.filter(t => t.status === 'Not started' || t.status === '未着手').length
    };
  }, [sheetData]);

  // If the user somehow gets here without being logged in
  if (!loggedInUser) return null;

  // Dispatch based on activeRole
  switch (activeRole) {
    case 'administrator':
      return (
        <AdminView
          teamSlug={teamSlug}
          projects={projects}
          getSheetData={getSheetData}
          onSelectProject={handleSelectProject}
          onUpdateProject={handleUpdateProject}
          onAssignMember={handleAssignMember}
          onRemoveMember={handleRemoveMember}
          onAddProject={handleAddProject}
          onDeleteProject={handleDeleteProject}
          serverStats={serverStats}
        />
      );
    case 'pm':
      return (
        <PMView
          projects={visibleProjects}
          getTaskStats={getTaskStats}
          onSelectProject={handleSelectProject}
          language={language}
          onLanguageChange={setLanguage}
        />
      );
    case 'developer':
      return (
        <DevView
          projects={visibleProjects}
          sheetData={sheetData}
          onSelectProject={handleSelectProject}
          language={language}
          onLanguageChange={setLanguage}
          user={loggedInUser}
        />
      );
    case 'client':
      return (
        <ClientView
          projects={visibleProjects}
          getTaskStats={getTaskStats}
          sheetData={sheetData}
          onSelectProject={handleSelectProject}
          language={language}
          onLanguageChange={setLanguage}
        />
      );
    case 'personal':
      return (
        <PersonalView
          projects={visibleProjects}
          getTaskStats={getTaskStats}
          onSelectProject={handleSelectProject}
          onAddProject={handleAddProject}
          language={language}
          onLanguageChange={setLanguage}
        />
      );
    default:
      return (
        <div className="flex-1 flex items-center justify-center bg-surface-950">
          <p className="text-gray-500">Invalid role selected. Please re-login.</p>
        </div>
      );
  }
}
