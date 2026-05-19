'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceProvider, useWorkspace } from '@/components/WorkspaceProvider';
import { sheetTabs, isSheetBundleComplete } from '@/lib/data';
import { Suspense, useCallback, useEffect, useTransition } from 'react';
import { translate } from '@/lib/data';
import { updateActiveRoleAction } from '@/lib/api/client';

function TeamRoleLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  
  const teamSlug = params.team_slug as string;
  
  // Extract role from pathname if not in params
  const pathSegments = pathname.split('/').filter(Boolean);
  const role = (params.role as string) || pathSegments[1];
  
  const [tabNavPending, startTabNavigation] = useTransition();

  const { 
    loggedInUser, 
    language,
    workspaceScope, 
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
    if (!activeProjectId) return;
    if (sheetLoadingProjects[activeProjectId]) return;
    if (isSheetBundleComplete(sheetData[activeProjectId])) return;
    void refreshSheetData(activeProjectId);
  }, [activeProjectId, sheetData, sheetLoadingProjects, refreshSheetData]);

  // Keep server actions (cookies) aligned with the team URL so create/list/assign use the same tenant.
  useEffect(() => {
    if (!loggedInUser || !teamSlug) return;
    const segments = pathname.split('/').filter(Boolean);
    const workspaceRole = (params.role as string) || segments[1] || loggedInUser.role;
    if (!workspaceRole) return;
    void updateActiveRoleAction(workspaceRole, teamSlug);
  }, [loggedInUser?.id, teamSlug, pathname, params.role, loggedInUser?.role]);

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

  const showAdminDashboard = pathname.includes('/admin/dashboard');

  return (
    <div className="flex h-screen bg-surface-950 text-gray-100 overflow-hidden">
      <Sidebar
        role={role as any}
        user={loggedInUser}
        activeTabId={activeTabId || (pathname.includes('/dashboard') ? 'dashboard' : '')}
        visibleTabs={sheetTabs.filter(t => t.visibleTo.includes(role as any))}
        onTabChange={(id) => {
          startTabNavigation(() => {
            router.push(`/${teamSlug}/${role}/projects/${activeProjectId}/${id}`);
          });
        }}
        workspaceScope="team"
        teamMemberships={teamMemberships}
        onSwitchTeam={handleSwitchTeam}
        onWorkspaceScopeChange={(scope) => {
          if (scope === 'personal') router.push('/personal/dashboard');
        }}
        onLogout={handleLogout}
        activeProject={activeProject}
        onBackToProjects={() => router.push(`/${teamSlug}/${role}/dashboard`)}
        getTabRowCount={getTabRowCount}
        showAdminDashboard={showAdminDashboard}
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

export default function TeamRoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <TeamRoleLayoutContent>{children}</TeamRoleLayoutContent>
    </WorkspaceProvider>
  );
}
