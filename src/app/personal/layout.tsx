'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceProvider, useWorkspace } from '@/components/WorkspaceProvider';
import { sheetTabs, isSheetBundleComplete } from '@/lib/data';
import { Suspense, useCallback, useEffect, useTransition } from 'react';
import { translate } from '@/lib/data';
import { updateActiveRoleAction } from '@/lib/api/client';

function PersonalLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  
  const { 
    loggedInUser, 
    language,
    workspaceScope, 
    setWorkspaceScope, 
    isLoading, 
    projects, 
    handleLogout,
    updateMyProfile,
    updateCurrentTeam,
    regenerateCurrentTeamInviteCode,
    sheetData,
    sheetLoadingProjects,
    refreshSheetData,
    teamMemberships
  } = useWorkspace();
  const personalTeamSlug = loggedInUser?.activeTeamSlug || teamMemberships[0]?.team?.slug || 'my-team';
  const [tabNavPending, startTabNavigation] = useTransition();

  const handleSwitchTeam = useCallback(
    async (slug: string) => {
      await updateActiveRoleAction('admin', slug);
      router.push(`/${slug}/admin/dashboard`);
      router.refresh();
    },
    [router]
  );

  const activeProjectId = params.id as string | undefined;
  const activeTabId = params.tabId as string | undefined;
  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  useEffect(() => {
    if (!loggedInUser) return;
    void updateActiveRoleAction('personal');
  }, [loggedInUser?.id]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (sheetLoadingProjects[activeProjectId]) return;
    if (isSheetBundleComplete(sheetData[activeProjectId])) return;
    void refreshSheetData(activeProjectId);
  }, [activeProjectId, sheetData, sheetLoadingProjects, refreshSheetData]);

  const getTabRowCount = useCallback((tabId: string) => {
    if (!activeProjectId) return 0;
    return (sheetData[activeProjectId]?.[tabId] ?? []).length;
  }, [activeProjectId, sheetData]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-950">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!loggedInUser) return null;

  return (
    <div className="flex h-screen bg-surface-950 text-gray-100 overflow-hidden">
      <Sidebar
        role="pm"
        user={loggedInUser}
        activeTabId={activeTabId || (pathname.includes('/dashboard') ? 'dashboard' : '')}
        visibleTabs={sheetTabs.filter(t => t.visibleTo.includes('pm'))}
        onTabChange={(id) => {
          startTabNavigation(() => {
            router.push(`/personal/projects/${activeProjectId}/${id}`);
          });
        }}
        workspaceScope="personal"
        teamMemberships={teamMemberships}
        onSwitchTeam={handleSwitchTeam}
        onWorkspaceScopeChange={async (scope) => {
          if (scope !== 'team') return;
          await updateActiveRoleAction('admin', personalTeamSlug);
          router.push(`/${personalTeamSlug}/admin/dashboard`);
          router.refresh();
        }}
        onLogout={handleLogout}
        activeProject={activeProject}
        onBackToProjects={() => router.push('/personal/dashboard')}
        getTabRowCount={getTabRowCount}
        showAdminDashboard={false}
        language={language}
        onUpdatePersonalProfile={updateMyProfile}
        onUpdateCurrentTeam={updateCurrentTeam}
        onRegenerateCurrentTeamInviteCode={regenerateCurrentTeamInviteCode}
      />
      <main className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        {tabNavPending && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-surface-950/55 backdrop-blur-[1px] pointer-events-auto">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">{translate('Navigating…', language)}</span>
          </div>
        )}
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <PersonalLayoutContent>{children}</PersonalLayoutContent>
    </WorkspaceProvider>
  );
}
