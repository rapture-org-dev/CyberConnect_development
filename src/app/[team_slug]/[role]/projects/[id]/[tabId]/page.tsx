'use client';

import { useParams, useRouter } from 'next/navigation';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { Header } from '@/components/Header';
import { GenericSheet } from '@/components/GenericSheet';
import { SheetRowDetail } from '@/components/SheetRowDetail';
import { AddRowDrawer } from '@/components/AddRowDrawer';
import { ExportModal } from '@/components/ExportModal';
import {
  sheetTabs,
  getCurrentUserProjectSheetRole,
  getLocalizedProjectName,
  isTeamAdminOrOwner,
  isSheetBundleComplete,
} from '@/lib/data';
import { mergeTabWithLayout } from '@/lib/sheetColumnLayout';
import { ScheduleChartView } from '@/components/ScheduleChartView';
import { useMemo, useEffect, useState } from 'react';
import type { SheetRow } from '@/types';

export default function ProjectTabPage() {
  const params = useParams();
  const router = useRouter();
  const { 
    projects, 
    sheetData, 
    loggedInUser, 
    language,
    setLanguage,
    sheetLoadingProjects,
    refreshSheetData,
    getProjectById,
    refreshProject,
    updateSheetRow,
    updateSheetRowData,
    addSheetRow,
    deleteSheetRow,
    deleteSheetRows,
    teamMemberships,
    sheetColumnLayouts,
  } = useWorkspace();

  const projectId = params.id as string;
  const tabId = params.tabId as string;
  const resolvedTabId = tabId === 'master_schedule' ? 'schedule' : tabId;

  const [selectedRow, setSelectedRow] = useState<SheetRow | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [isFetchingProject, setIsFetchingProject] = useState(false);

  useEffect(() => {
    if (projectId) {
      const p = getProjectById(projectId);
      if (!p) {
        setIsFetchingProject(true);
        refreshProject(projectId).finally(() => setIsFetchingProject(false));
      }
      const needsFullSync =
        !isSheetBundleComplete(sheetData[projectId]) && !sheetLoadingProjects[projectId];
      if (needsFullSync) {
        void refreshSheetData(projectId);
      }
    }
  }, [projectId, sheetData, sheetLoadingProjects, refreshSheetData, getProjectById, refreshProject]);

  useEffect(() => {
    if (tabId !== 'master_schedule') return;
    const slug = params.team_slug as string;
    const role = params.role as string;
    if (!slug || !role || !projectId) return;
    router.replace(`/${slug}/${role}/projects/${projectId}/schedule`);
  }, [tabId, params.team_slug, params.role, projectId, router]);

  const activeProject = useMemo(() => getProjectById(projectId), [getProjectById, projectId]);
  const activeTab = useMemo(() => sheetTabs.find(t => t.id === resolvedTabId), [resolvedTabId]);
  const effectiveTab = useMemo(() => {
    if (!activeTab) return undefined;
    return mergeTabWithLayout(activeTab, sheetColumnLayouts[projectId]?.[resolvedTabId]);
  }, [activeTab, sheetColumnLayouts, projectId, resolvedTabId]);

  const teamSlug = params.team_slug as string | undefined;

  const teamAdminOrOwner = useMemo(
    () => isTeamAdminOrOwner(loggedInUser?.id, teamSlug, teamMemberships),
    [loggedInUser?.id, teamSlug, teamMemberships]
  );

  const projectSheetRole = useMemo(
    () =>
      getCurrentUserProjectSheetRole(loggedInUser?.id, activeProject, 'client', {
        isTeamAdminOrOwner: teamAdminOrOwner,
        profileRole: loggedInUser?.role,
      }),
    [loggedInUser?.id, activeProject, teamAdminOrOwner, loggedInUser?.role]
  );

  const taskRows = useMemo(
    () => sheetData[projectId]?.tasks ?? [],
    [sheetData, projectId]
  );

  const currentRows = useMemo(() => {
    return sheetData[projectId]?.[resolvedTabId] ?? [];
  }, [sheetData, projectId, resolvedTabId]);

  const registeredScreenCodes = useMemo(() => {
    const rows = sheetData[projectId]?.screen_list ?? [];
    return [...new Set(rows.map((r) => String(r.screen_code ?? '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [sheetData, projectId]);

  const registeredFunctionCodes = useMemo(() => {
    const rows = sheetData[projectId]?.function_list ?? [];
    return [...new Set(rows.map((r) => String(r.function_code ?? '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [sheetData, projectId]);

  const selectedRowSynced = useMemo(() => {
    if (!selectedRow) return null;
    return currentRows.find(r => r.id === selectedRow.id) ?? selectedRow;
  }, [selectedRow, currentRows]);

  const isSheetLoading =
    sheetLoadingProjects[projectId] || !isSheetBundleComplete(sheetData[projectId]);

  if (isFetchingProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-950">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!activeProject || !activeTab || !effectiveTab || !loggedInUser) return null;

  if (isSheetLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-950">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const headerRowCount =
    effectiveTab.isSpecialView && effectiveTab.id === 'schedule' ? taskRows.length : currentRows.length;

  return (
    <>
      <Header
        projectSheetRole={projectSheetRole}
        tab={effectiveTab}
        totalRows={headerRowCount}
        projectName={getLocalizedProjectName(activeProject, language)}
        language={language}
        onLanguageChange={setLanguage}
        onExport={() => setShowExport(true)}
        showExport={!effectiveTab.isSpecialView}
      />
      <div className="flex-1 flex flex-row overflow-hidden relative">
        <div className="flex-1 overflow-hidden relative">
          {effectiveTab.isSpecialView && effectiveTab.id === 'schedule' ? (
            <ScheduleChartView tasks={taskRows} language={language} />
          ) : (
            <GenericSheet
              tab={effectiveTab}
              rows={currentRows}
              project={activeProject}
              projectSheetRole={projectSheetRole}
              language={language}
              onSelectRow={(row) => {
                setShowAddRow(false);
                setSelectedRow(row);
              }}
              onUpdateRow={(rowId, key, value) =>
                updateSheetRow(projectId, resolvedTabId, rowId, key, value)
              }
              onDeleteRow={(rowId) => deleteSheetRow(projectId, resolvedTabId, rowId)}
              onDeleteRows={(ids) => deleteSheetRows(projectId, resolvedTabId, ids)}
              onAddRow={() => {
                setSelectedRow(null);
                setShowAddRow(true);
              }}
              selectedRowId={selectedRow?.id ?? null}
              canManageSheetColumns={projectSheetRole === 'pm' || teamAdminOrOwner}
              teamAdminOrOwner={teamAdminOrOwner}
              isPlatformAdmin={loggedInUser?.role === 'admin'}
            />
          )}
        </div>

        {selectedRowSynced && !effectiveTab.isSpecialView && (
          <SheetRowDetail
            tab={effectiveTab}
            row={selectedRowSynced}
            project={activeProject}
            projectSheetRole={projectSheetRole}
            language={language}
            screenCodeOptions={registeredScreenCodes}
            functionCodeOptions={registeredFunctionCodes}
            onClose={() => setSelectedRow(null)}
            teamAdminOrOwner={teamAdminOrOwner}
            isPlatformAdmin={loggedInUser?.role === 'admin'}
            onUpdate={async (updatedRow) => {
              await updateSheetRowData(projectId, resolvedTabId, updatedRow as SheetRow);
              setSelectedRow(null);
            }}
          />
        )}

        {showAddRow && !effectiveTab.isSpecialView && (
          <AddRowDrawer
            tab={effectiveTab}
            projectId={projectId}
            project={activeProject}
            projectSheetRole={projectSheetRole}
            language={language}
            screenCodeOptions={registeredScreenCodes}
            functionCodeOptions={registeredFunctionCodes}
            onClose={() => setShowAddRow(false)}
            onSave={async (newRow) => {
              await addSheetRow(projectId, resolvedTabId, newRow);
              setShowAddRow(false);
            }}
          />
        )}
      </div>

      {showExport && !effectiveTab.isSpecialView && (
        <ExportModal tab={effectiveTab} rows={currentRows} onClose={() => setShowExport(false)} />
      )}
    </>
  );
}
