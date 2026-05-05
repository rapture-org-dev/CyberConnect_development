'use client';

import { useWorkspace } from '@/components/WorkspaceProvider';
import { PersonalView } from '@/components/dashboard/views/PersonalView';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isTeamOwnerAction } from '@/actions/teams';

export default function PersonalDashboardPage() {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState<boolean>(true); // Default hide to avoid flicker
  const { 
    visibleProjects, 
    sheetData, 
    handleAddProject,
    handleDeleteProject,
    isLoading,
    language,
    setLanguage,
  } = useWorkspace();

  useEffect(() => {
    isTeamOwnerAction().then(setIsOwner);
  }, []);

  const handleSelectProject = useCallback((projectId: string) => {
    router.push(`/personal/projects/${projectId}/tasks`);
  }, [router]);

  const getTaskStats = useCallback((projectId: string) => {
    const tasks = sheetData[projectId]?.['tasks'] ?? [];
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

  if (isLoading) return null;

  return (
    <PersonalView
      projects={visibleProjects}
      getTaskStats={getTaskStats}
      onSelectProject={handleSelectProject}
      onAddProject={handleAddProject}
      onDeleteProject={handleDeleteProject}
      showPurchaseButton={!isOwner}
      language={language}
      onLanguageChange={setLanguage}
    />
  );
}
