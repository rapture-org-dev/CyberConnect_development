'use client';

import { useWorkspace } from '@/components/WorkspaceProvider';
import { ClientView } from '@/components/dashboard/views/ClientView';
import { useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ClientDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const teamSlug = params.team_slug as string;

  const { visibleProjects, sheetData, isLoading, language, setLanguage } = useWorkspace();

  const handleSelectProject = useCallback(
    (projectId: string) => {
      router.push(`/${teamSlug}/client/projects/${projectId}/tasks`);
    },
    [router, teamSlug]
  );

  const getTaskStats = useCallback(
    (projectId: string) => {
      const tasks = sheetData[projectId]?.['tasks'] ?? [];
      return {
        total: tasks.length,
        done: tasks.filter((t) => t.status === 'Done' || t.status === '完了').length,
        inProgress: tasks.filter(
          (t) =>
            t.status === 'In progress' ||
            t.status === '進行中' ||
            t.status === 'In review' ||
            t.status === 'レビュー中'
        ).length,
        notStarted: tasks.filter((t) => t.status === 'Not started' || t.status === '未着手').length,
      };
    },
    [sheetData]
  );

  if (isLoading) return null;

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
}
