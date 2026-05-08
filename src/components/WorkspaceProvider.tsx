'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession, logoutAction } from '@/actions/auth';
import { getProfiles, upgradeToAdminAction, getTeamMembersAction, getMyTeamMembershipsAction, getMyProfileAction, updateMyProfileAction } from '@/actions/profiles';
import { getProjectsAction, createProjectAction, updateProjectAction, deleteProjectAction, getTeamIdBySlugAction } from '@/actions/projects';
import {
  getSheetRowsAction,
  upsertSheetRowAction,
  upsertSheetRowsBatchAction,
  deleteSheetRowAction,
  deleteSheetRowsBatchAction,
} from '@/actions/rows';
import {
  setCachedProfiles,
  sheetTabs,
  type Language,
} from '@/lib/data';
import type { UserProfile, Project, SheetRow, SheetColumn, UserRole, TeamMembership } from '@/types';
import { regenerateTeamInviteCodeAction, updateTeamAction } from '@/actions/teams';
import { clearLoginSessionStorage } from '@/lib/loginSession';

interface WorkspaceContextType {
  loggedInUser: UserProfile | null;
  workspaceScope: 'team' | 'personal';
  setWorkspaceScope: (scope: 'team' | 'personal') => void;
  projects: Project[];
  visibleProjects: Project[];
  teamPool: UserProfile[];
  teamMemberships: TeamMembership[];
  isLoading: boolean;
  sheetData: Record<string, Record<string, SheetRow[]>>;
  sheetLoadingProjects: Record<string, boolean>;
  language: Language;
  setLanguage: (lang: Language) => void;
  handleLogout: () => Promise<void>;
  handleUpdateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  /** Merge project fields in client state only (no server call). Use after a dedicated server action succeeded. */
  patchProjectLocal: (id: string, updates: Partial<Project>) => void;
  handleAssignMember: (projectId: string, profileId: string, role: string) => Promise<void>;
  handleRemoveMember: (projectId: string, profileId: string) => Promise<void>;
  handleDeleteProject: (id: string) => Promise<void>;
  handleAddProject: (project: Partial<Project>) => Promise<void>;
  handleUpgrade: (teamName: string) => Promise<void>;
  updateMyProfile: (updates: Partial<Pick<UserProfile, 'name' | 'department' | 'avatar_url'>>) => Promise<void>;
  updateCurrentTeam: (updates: { name?: string }) => Promise<void>;
  regenerateCurrentTeamInviteCode: () => Promise<string>;
  refreshSheetData: (projectId: string) => Promise<void>;
  /** Reload one tab only — does not toggle full-project sheet loading (use after batch import). */
  refreshSheetTab: (projectId: string, tabId: string) => Promise<void>;
  getProjectById: (id: string) => Project | null;
  refreshProject: (id: string) => Promise<Project | null>;
  updateSheetRow: (projectId: string, tabId: string, rowId: string, key: string, value: string) => Promise<void>;
  updateSheetRowData: (projectId: string, tabId: string, updatedRow: SheetRow) => Promise<void>;
  addSheetRow: (projectId: string, tabId: string, newRow: SheetRow) => Promise<SheetRow>;
  deleteSheetRow: (projectId: string, tabId: string, rowId: string) => Promise<void>;
  deleteSheetRows: (projectId: string, tabId: string, rowIds: string[]) => Promise<void>;
  /** Saved column layouts per tab (merged in the UI with defaults from `sheetTabs`). */
  sheetColumnLayouts: Record<string, Partial<Record<string, SheetColumn[]>>>;
  refreshSheetColumnLayouts: (projectId: string) => Promise<void>;
  refreshTeamMemberships: () => Promise<void>;
  /** Admin dashboard: which project is selected in the main workspace panel. */
  selectedAdminProjectId: string | null;
  setSelectedAdminProjectId: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children, initialProjects }: { children: React.ReactNode, initialProjects?: Project[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [loggedInUser, setLoggedInUser] = useState<UserProfile | null>(null);
  const [workspaceScope, setWorkspaceScope] = useState<'team' | 'personal'>('team');
  const [isLoading, setIsLoading] = useState(!initialProjects);
  const [projects, setProjects] = useState<Project[]>(initialProjects || []);
  const [teamPool, setTeamPool] = useState<UserProfile[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  /** Used for Realtime: team_id of the URL-scoped team (invite joins insert into this team). */
  const [realtimeTeamId, setRealtimeTeamId] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<Record<string, Record<string, SheetRow[]>>>({});
  const [sheetColumnLayouts, setSheetColumnLayouts] = useState<
    Record<string, Partial<Record<string, SheetColumn[]>>>
  >({});
  const [sheetLoadingProjects, setSheetLoadingProjects] = useState<Record<string, boolean>>({});
  const [language, setLanguage] = useState<Language>('en');
  const [selectedAdminProjectId, setSelectedAdminProjectId] = useState<string | null>(null);

  /** Queued cell edits before batched upsert (write-behind). Key: `${projectId}:${tabId}:${rowId}` */
  const pendingSheetWritesRef = useRef(
    new Map<string, { projectId: string; tabId: string; row: SheetRow }>()
  );
  const sheetFlushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Skip task_rows realtime refetch briefly after our own batched saves (avoid double-fetch). */
  const ownTaskWriteTimestampsRef = useRef(new Map<string, number>());
  const pathnameFlushSkipRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('cyberconnect-language');
      if (stored === 'en' || stored === 'ja') {
        setLanguage(stored);
      }
    } catch {
      // Ignore storage access issues in restricted environments.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('cyberconnect-language', language);
    } catch {
      // Ignore storage access issues in restricted environments.
    }
  }, [language]);

  // Sync Workspace Scope with URL
  useEffect(() => {
    const scope = pathname.startsWith('/personal') ? 'personal' : 'team';
    if (workspaceScope !== scope) {
      setWorkspaceScope(scope);
    }
  }, [pathname, workspaceScope]);

  useEffect(() => {
    const init = async () => {
      try {
        const session = await getSession();
        if (!session) {
          setIsLoading(false);
          router.push('/login');
          return;
        }

        const data = await getMyProfileAction();
        if (data) {
          const effectiveAccountKind = data.role === 'admin' ? 'team' : (session.accountKind || 'personal');
          setLoggedInUser({ 
            ...data, 
            accountKind: effectiveAccountKind,
            activeWorkspaceRole: session.activeWorkspaceRole,
            activeTeamSlug: session.activeTeamSlug || (data.role === 'admin' ? 'my-team' : undefined)
          } as UserProfile);
          setWorkspaceScope(effectiveAccountKind === 'personal' ? 'personal' : 'team');
        } else {
          setIsLoading(false);
          router.push('/login');
        }
      } catch (err) {
        console.error('Error in WorkspaceProvider init:', err);
        setIsLoading(false);
        router.push('/login');
      }
    };
    init();
  }, [router]);

  useEffect(() => {
    if (loggedInUser) {
      getMyTeamMembershipsAction().then(res => {
        console.log('Fetched memberships:', res);
        setTeamMemberships(res);
      });
      getProfiles().then(profiles => {
        setCachedProfiles(profiles);
        
        // Context-Aware project fetching
        const scope = pathname.startsWith('/personal') ? 'personal' : 'team';
        const segments = pathname.split('/').filter(Boolean);
        const teamSlug = scope === 'team' ? (params.team_slug as string || segments[0]) : undefined;
        getProjectsAction(scope, undefined, teamSlug).then(async res => {
          setProjects(res);
          setIsLoading(false);

          if (scope === 'team') {
            let teamId = res.find(p => p.team_id)?.team_id;
            if (!teamId && teamSlug) {
              teamId = (await getTeamIdBySlugAction(teamSlug)) ?? undefined;
            }
            if (!teamId) {
              setTeamPool([]);
              setRealtimeTeamId(null);
              return;
            }
            setRealtimeTeamId(teamId);
            const members = await getTeamMembersAction(teamId);
            setTeamPool(members);
          } else {
            setTeamPool([]);
            setRealtimeTeamId(null);
          }

          // Automatically fetch essential sheet data for the dashboard (tasks and tech_stack)
          // this ensures the dashboard stats are synced as requested by the user.
          res.forEach(project => {
            void getSheetRowsAction(project.id, 'tasks').then(rows => {
              setSheetData(prev => ({
                ...prev,
                [project.id]: { ...(prev[project.id] || {}), tasks: rows }
              }));
            });
            void getSheetRowsAction(project.id, 'tech_stack').then(rows => {
              setSheetData(prev => ({
                ...prev,
                [project.id]: { ...(prev[project.id] || {}), tech_stack: rows }
              }));
            });
          });
        });
      });
    }
  }, [loggedInUser, workspaceScope, pathname, params.team_slug]);

  /** Refetch team roster, projects, and profile cache; refresh RSC data on admin dashboard. */
  const syncTeamWorkspaceData = useCallback(async () => {
    if (pathname.startsWith('/personal')) return;
    const segments = pathname.split('/').filter(Boolean);
    const teamSlug = (params.team_slug as string | undefined) || segments[0];
    if (!teamSlug) return;

    try {
      const [memRes, profilesList] = await Promise.all([
        getMyTeamMembershipsAction(),
        getProfiles(),
      ]);
      setTeamMemberships(memRes);
      setCachedProfiles(profilesList);

      const projs = await getProjectsAction('team', undefined, teamSlug);
      setProjects(projs);

      let teamId = projs.find(p => p.team_id)?.team_id;
      if (!teamId) teamId = (await getTeamIdBySlugAction(teamSlug)) ?? undefined;
      if (teamId) {
        setRealtimeTeamId(teamId);
        const members = await getTeamMembersAction(teamId);
        setTeamPool(members);
      } else {
        setRealtimeTeamId(null);
        setTeamPool([]);
      }

      if (pathname.includes('/admin/dashboard')) {
        router.refresh();
      }
    } catch (e) {
      console.error('syncTeamWorkspaceData:', e);
    }
  }, [pathname, params.team_slug, router]);

  // When someone joins via invite code (or any team_members row changes), keep admin/team UIs in sync.
  useEffect(() => {
    if (!loggedInUser || !realtimeTeamId || pathname.startsWith('/personal')) return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void syncTeamWorkspaceData();
      }, 280);
    };

    const channel = supabase
      .channel(`team-members:${realtimeTeamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members',
          filter: `team_id=eq.${realtimeTeamId}`,
        },
        scheduleSync
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('team_members realtime:', status, err);
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [loggedInUser?.id, realtimeTeamId, pathname, syncTeamWorkspaceData]);

  const projectIdsKey = useMemo(
    () => [...projects].map(p => p.id).sort((a, b) => a.localeCompare(b)).join(','),
    [projects]
  );

  // Refetch tasks when task_rows change (other tabs, other roles, or collaborators).
  useEffect(() => {
    if (!loggedInUser?.id || !projectIdsKey) return;

    const pendingProjectIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      debounceTimer = undefined;
      const ids = [...pendingProjectIds];
      pendingProjectIds.clear();
      if (ids.length === 0) return;
      void Promise.all(
        ids.map(pid =>
          getSheetRowsAction(pid, 'tasks').then(rows => ({ pid, rows }))
        )
      ).then(results => {
        setSheetData(prev => {
          let next = prev;
          for (const { pid, rows } of results) {
            next = { ...next, [pid]: { ...(next[pid] || {}), tasks: rows } };
          }
          return next;
        });
      });
    };

    const scheduleRefetch = (projectId: string) => {
      pendingProjectIds.add(projectId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, 220);
    };

    const projectIds = projectIdsKey.split(',').filter(Boolean);
    const channelName = `task-rows:${loggedInUser.id}`;
    let channel = supabase.channel(channelName);
    for (const pid of projectIds) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_rows',
          filter: `project_id=eq.${pid}`,
        },
        (payload) => {
          const pidFromRow =
            (payload.new as { project_id?: string } | null)?.project_id ??
            (payload.old as { project_id?: string } | null)?.project_id;
          const pidRes = pidFromRow || pid;
          const rid =
            (payload.new as { id?: string } | null)?.id ??
            (payload.old as { id?: string } | null)?.id;
          if (rid) {
            const t = ownTaskWriteTimestampsRef.current.get(`${pidRes}:${rid}`);
            if (t !== undefined && Date.now() - t < 2800) {
              return;
            }
          }
          scheduleRefetch(pidRes);
        }
      );
    }

    channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('task_rows realtime:', status, err);
      }
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      pendingProjectIds.clear();
      void supabase.removeChannel(channel);
    };
  }, [loggedInUser?.id, projectIdsKey]);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      await logoutAction();
      clearLoginSessionStorage();
      setLoggedInUser(null);
      setProjects([]);
      setSheetData({});
      setSheetColumnLayouts({});
      setTeamPool([]);
      setTeamMemberships([]);
      setRealtimeTeamId(null);
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [router]);

  const handleUpdateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    await updateProjectAction(id, updates);
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  const patchProjectLocal = useCallback((id: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  const resolveTeamSlugForRefresh = useCallback(() => {
    if (pathname.startsWith('/personal')) return undefined;
    const segments = pathname.split('/').filter(Boolean);
    return (params.team_slug as string | undefined) || segments[0];
  }, [pathname, params.team_slug]);

  const handleAssignMember = useCallback(async (projectId: string, profileId: string, role: string) => {
    const { assignProjectMemberAction } = await import('@/actions/projects');
    await assignProjectMemberAction(projectId, profileId, role);
    const slug = resolveTeamSlugForRefresh();
    if (pathname.startsWith('/personal')) {
      getProjectsAction('personal').then(res => setProjects(res));
    } else {
      getProjectsAction('team', undefined, slug).then(res => setProjects(res));
    }
  }, [pathname, resolveTeamSlugForRefresh]);

  const handleRemoveMember = useCallback(async (projectId: string, profileId: string) => {
    const { removeProjectMemberAction } = await import('@/actions/projects');
    await removeProjectMemberAction(projectId, profileId);
    const slug = resolveTeamSlugForRefresh();
    if (pathname.startsWith('/personal')) {
      getProjectsAction('personal').then(res => setProjects(res));
    } else {
      getProjectsAction('team', undefined, slug).then(res => setProjects(res));
    }
  }, [pathname, resolveTeamSlugForRefresh]);

  const handleDeleteProject = useCallback(async (id: string) => {
    await deleteProjectAction(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleAddProject = useCallback(async (project: Partial<Project>) => {
    const scope = pathname.startsWith('/personal') ? 'personal' : 'team';
    const enriched: Partial<Project> = { ...project };
    if (scope === 'personal') {
      enriched.workspace_type = 'personal';
    } else {
      enriched.workspace_type = enriched.workspace_type ?? 'team';
      const segments = pathname.split('/').filter(Boolean);
      const slug = (params.team_slug as string | undefined) || segments[0];
      if (slug) {
        const tid = await getTeamIdBySlugAction(slug);
        if (tid) enriched.team_id = tid;
      }
    }
    const res = await createProjectAction(enriched);
    if (res.success && res.data) {
      setProjects(prev => [...prev, res.data!]);
    } else if (res.error) {
      throw new Error(res.error);
    }
  }, [pathname, params.team_slug]);

  const updateMyProfile = useCallback(async (updates: Partial<Pick<UserProfile, 'name' | 'department' | 'avatar_url'>>) => {
    const updated = await updateMyProfileAction(updates);
    setLoggedInUser(prev => prev ? { ...prev, ...updated } : updated);
  }, []);

  const updateCurrentTeam = useCallback(async (updates: { name?: string }) => {
    const team = teamMemberships.find(m => m.team?.slug === loggedInUser?.activeTeamSlug)?.team;
    if (!team?.id) throw new Error('Current team not found');
    await updateTeamAction(team.id, updates);
    const refreshed = await getMyTeamMembershipsAction();
    setTeamMemberships(refreshed);
  }, [loggedInUser?.activeTeamSlug, teamMemberships]);

  const regenerateCurrentTeamInviteCode = useCallback(async () => {
    const team = teamMemberships.find(m => m.team?.slug === loggedInUser?.activeTeamSlug)?.team;
    if (!team?.id) throw new Error('Current team not found');
    const code = await regenerateTeamInviteCodeAction(team.id);
    const refreshed = await getMyTeamMembershipsAction();
    setTeamMemberships(refreshed);
    return code;
  }, [loggedInUser?.activeTeamSlug, teamMemberships]);

  const handleUpgrade = useCallback(async (teamName: string) => {
    if (!loggedInUser) return;
    const { loginAction } = await import('@/actions/auth');
    await upgradeToAdminAction();
    const activeTeamSlug = 'my-team';
    const updatedUser = { 
      ...loggedInUser, 
      role: 'admin' as UserRole, 
      accountKind: 'team' as const,
      activeTeamSlug
    };
    
    await loginAction(updatedUser.email, updatedUser.role, updatedUser.accountKind, 'admin', activeTeamSlug);
    
    setLoggedInUser(updatedUser);
    setWorkspaceScope('team');
    router.push(`/${activeTeamSlug}/admin/dashboard`);
  }, [loggedInUser, router]);

  const refreshSheetColumnLayouts = useCallback(async (projectId: string) => {
    try {
      const { getProjectSheetColumnLayoutsAction } = await import('@/actions/sheetColumnLayout');
      const map = await getProjectSheetColumnLayoutsAction(projectId);
      setSheetColumnLayouts((prev) => ({ ...prev, [projectId]: map }));
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSheetData = useCallback(async (projectId: string) => {
    setSheetLoadingProjects(prev => ({ ...prev, [projectId]: true }));
    const dataTabs = sheetTabs.filter(t => !t.isSpecialView);
    try {
      const { getProjectSheetColumnLayoutsAction } = await import('@/actions/sheetColumnLayout');
      const [results, layoutMap] = await Promise.all([
        Promise.all(
          dataTabs.map((tab) =>
            getSheetRowsAction(projectId, tab.id).then((rows) => ({ tabId: tab.id, rows }))
          )
        ),
        getProjectSheetColumnLayoutsAction(projectId).catch(() => ({} as Partial<Record<string, SheetColumn[]>>)),
      ]);
      const newData: Record<string, SheetRow[]> = {};
      results.forEach((res) => {
        newData[res.tabId] = res.rows;
      });
      setSheetData((prev) => ({ ...prev, [projectId]: newData }));
      setSheetColumnLayouts((prev) => ({ ...prev, [projectId]: layoutMap }));
    } finally {
      setSheetLoadingProjects((prev) => ({ ...prev, [projectId]: false }));
    }
  }, []);

  const refreshSheetTab = useCallback(async (projectId: string, tabId: string) => {
    const rows = await getSheetRowsAction(projectId, tabId);
    setSheetData((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] ?? {}),
        [tabId]: rows,
      },
    }));
  }, []);

  const flushPendingSheetWrites = useCallback(async () => {
    if (sheetFlushTimerRef.current) {
      clearTimeout(sheetFlushTimerRef.current);
      sheetFlushTimerRef.current = undefined;
    }

    const snap = new Map(pendingSheetWritesRef.current);
    pendingSheetWritesRef.current.clear();
    if (snap.size === 0) return;

    const groups = new Map<string, { projectId: string; tabId: string; rows: SheetRow[] }>();
    for (const [, v] of snap) {
      const gk = `${v.projectId}:${v.tabId}`;
      const existing = groups.get(gk);
      if (!existing) {
        groups.set(gk, { projectId: v.projectId, tabId: v.tabId, rows: [v.row] });
      } else {
        const i = existing.rows.findIndex((r) => r.id === v.row.id);
        if (i >= 0) existing.rows[i] = v.row;
        else existing.rows.push(v.row);
      }
    }

    for (const { projectId, tabId, rows } of groups.values()) {
      if (tabId === 'tasks') {
        const cutoff = Date.now() - 120_000;
        for (const [k, t] of ownTaskWriteTimestampsRef.current) {
          if (t < cutoff) ownTaskWriteTimestampsRef.current.delete(k);
        }
        for (const r of rows) {
          ownTaskWriteTimestampsRef.current.set(`${projectId}:${r.id}`, Date.now());
        }
      }

      try {
        const saved = await upsertSheetRowsBatchAction(tabId, projectId, rows);
        setSheetData((prev) => {
          const tabRows = prev[projectId]?.[tabId] ?? [];
          const order = tabRows.map((r) => r.id);
          const byId = new Map(tabRows.map((r) => [r.id, r] as const));
          for (const s of saved) {
            byId.set(s.id, s);
          }
          const nextList: SheetRow[] = [];
          for (const id of order) {
            const r = byId.get(id);
            if (r) nextList.push(r);
          }
          for (const s of saved) {
            if (!order.includes(s.id)) nextList.push(s);
          }
          return {
            ...prev,
            [projectId]: {
              ...prev[projectId],
              [tabId]: nextList,
            },
          };
        });
      } catch (e) {
        console.error('flushPendingSheetWrites:', e);
        try {
          await refreshSheetTab(projectId, tabId);
        } catch {
          // ignore
        }
      }
    }
  }, [refreshSheetTab]);

  const scheduleSheetFlush = useCallback(() => {
    if (sheetFlushTimerRef.current) clearTimeout(sheetFlushTimerRef.current);
    sheetFlushTimerRef.current = setTimeout(() => {
      sheetFlushTimerRef.current = undefined;
      void flushPendingSheetWrites();
    }, 2500);
  }, [flushPendingSheetWrites]);

  useEffect(() => {
    if (pathnameFlushSkipRef.current === null) {
      pathnameFlushSkipRef.current = pathname;
      return;
    }
    if (pathnameFlushSkipRef.current !== pathname) {
      pathnameFlushSkipRef.current = pathname;
      void flushPendingSheetWrites();
    }
  }, [pathname, flushPendingSheetWrites]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingSheetWrites();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [flushPendingSheetWrites]);

  const getProjectById = useCallback((id: string) => {
    return projects.find(p => p.id === id) || null;
  }, [projects]);

  const refreshProject = useCallback(async (id: string) => {
    const { getProjectByIdAction } = await import('@/actions/projects');
    const p = await getProjectByIdAction(id);
    if (p) {
      setProjects(prev => {
        const exists = prev.find(item => item.id === id);
        if (exists) return prev.map(item => item.id === id ? p : item);
        return [...prev, p];
      });
    }
    return p;
  }, []);

  const updateSheetRow = useCallback(async (projectId: string, tabId: string, rowId: string, key: string, value: string) => {
    setSheetData((prev) => {
      const rows = prev[projectId]?.[tabId] ?? [];
      const row = rows.find((r) => r.id === rowId);
      if (!row) return prev;
      const merged = { ...row, [key]: value } as SheetRow;
      pendingSheetWritesRef.current.set(`${projectId}:${tabId}:${rowId}`, {
        projectId,
        tabId,
        row: merged,
      });
      queueMicrotask(() => {
        scheduleSheetFlush();
      });
      return {
        ...prev,
        [projectId]: {
          ...prev[projectId],
          [tabId]: rows.map((r) => (r.id === rowId ? merged : r)),
        },
      };
    });
  }, [scheduleSheetFlush]);

  const updateSheetRowData = useCallback(async (projectId: string, tabId: string, updatedRow: SheetRow) => {
    await flushPendingSheetWrites();
    const saved = await upsertSheetRowAction(tabId, { ...updatedRow, project_id: projectId });
    setSheetData((prev) => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        [tabId]: (prev[projectId]?.[tabId] ?? []).map((r) => (r.id === saved.id ? saved : r)),
      },
    }));
  }, [flushPendingSheetWrites]);

  const addSheetRow = useCallback(async (projectId: string, tabId: string, newRow: SheetRow) => {
    await flushPendingSheetWrites();
    const created = await upsertSheetRowAction(tabId, { ...newRow, project_id: projectId });
    setSheetData((prev) => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        [tabId]: [...(prev[projectId]?.[tabId] ?? []), created],
      },
    }));
    return created;
  }, [flushPendingSheetWrites]);

  const deleteSheetRow = useCallback(async (projectId: string, tabId: string, rowId: string) => {
    await flushPendingSheetWrites();
    await deleteSheetRowAction(tabId, projectId, rowId);
    setSheetData((prev) => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        [tabId]: (prev[projectId]?.[tabId] ?? []).filter((r) => r.id !== rowId),
      },
    }));
  }, [flushPendingSheetWrites]);

  const deleteSheetRows = useCallback(async (projectId: string, tabId: string, rowIds: string[]) => {
    if (rowIds.length === 0) return
    await flushPendingSheetWrites();
    await deleteSheetRowsBatchAction(tabId, projectId, rowIds)
    const idSet = new Set(rowIds)
    setSheetData(prev => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        [tabId]: (prev[projectId]?.[tabId] ?? []).filter(r => !idSet.has(r.id)),
      },
    }))
  }, [flushPendingSheetWrites])

  const visibleProjects = useMemo(() => {
    if (!loggedInUser) return [];
    if (workspaceScope === 'team') {
      return projects.filter(p => p.workspace_type === 'team');
    }
    return projects.filter(p => p.workspace_type === 'personal');
  }, [loggedInUser, projects, workspaceScope]);

  const handleSetWorkspaceScope = useCallback(async (scope: 'team' | 'personal') => {
    const { updateActiveRoleAction } = await import('@/actions/auth');
    setProjects([]);
    setSheetData({});
    setSheetColumnLayouts({});

    if (scope === 'personal') {
      await updateActiveRoleAction('personal');
      setLoggedInUser(prev => prev ? { 
        ...prev, 
        activeWorkspaceRole: 'personal',
        activeTeamSlug: undefined 
      } : null);
      setWorkspaceScope('personal');
      setSheetColumnLayouts({});
      router.push('/personal/dashboard');
    } else {
      const slug = loggedInUser?.activeTeamSlug || 'my-team';
      await updateActiveRoleAction('admin', slug);
      setLoggedInUser(prev =>
        prev ? { ...prev, activeWorkspaceRole: 'admin', activeTeamSlug: slug } : null
      );
      setWorkspaceScope('team');
      setSheetColumnLayouts({});
      router.push(`/${slug}/admin/dashboard`);
    }
    router.refresh();
  }, [loggedInUser, router]);

  const refreshTeamMemberships = useCallback(async () => {
    await syncTeamWorkspaceData();
  }, [syncTeamWorkspaceData]);

  const value = {
    loggedInUser,
    workspaceScope,
    setWorkspaceScope: handleSetWorkspaceScope,
    projects,
    visibleProjects,
    teamPool,
    teamMemberships,
    isLoading,
    sheetData,
    sheetLoadingProjects,
    language,
    setLanguage,
    handleLogout,
    handleUpdateProject,
    patchProjectLocal,
    handleAssignMember,
    handleRemoveMember,
    handleDeleteProject,
    handleAddProject,
    handleUpgrade,
    updateMyProfile,
    updateCurrentTeam,
    regenerateCurrentTeamInviteCode,
    refreshSheetData,
    refreshSheetTab,
    getProjectById,
    refreshProject,
    updateSheetRow,
    updateSheetRowData,
    addSheetRow,
    deleteSheetRow,
    deleteSheetRows,
    sheetColumnLayouts,
    refreshSheetColumnLayouts,
    refreshTeamMemberships,
    selectedAdminProjectId,
    setSelectedAdminProjectId,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
