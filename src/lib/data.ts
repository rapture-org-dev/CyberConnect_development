import type { SheetTab, SheetColumn, SheetRow, Project, UserProfile, UserRole, TeamMembership } from '@/types';

/** Project-scoped role for sheet read/write rules (distinct from URL/workspace routing). */
export type ProjectSheetRole = 'pm' | 'dev' | 'client';

export type ProjectSheetRoleOptions = {
  /** Company admin or billing owner for this team — full PM-level access on every team project. */
  isTeamAdminOrOwner?: boolean;
  /** `profiles.role` — platform administrators retain full PM-level access. */
  profileRole?: UserRole;
};

/** Whether the user may manage company-level settings for the given team slug. */
export function isTeamAdminOrOwner(
  userId: string | undefined,
  teamSlug: string | undefined,
  teamMemberships: TeamMembership[]
): boolean {
  if (!userId || !teamSlug) return false;
  const m = teamMemberships.find(x => x.team?.slug === teamSlug);
  if (!m?.team) return false;
  if (m.role === 'admin') return true;
  return m.team.owner_id === userId;
}

/** Team project: user may edit sheets / PM workflow if admin/owner or assigned PM or Dev on this project. */
export function userCanEditTeamProjectContent(
  userId: string | undefined,
  project: Project,
  teamSlug: string | undefined,
  teamMemberships: TeamMembership[]
): boolean {
  if (!userId) return false;
  if (isTeamAdminOrOwner(userId, teamSlug, teamMemberships)) return true;
  return userSeesProjectAsPm(userId, project) || userSeesProjectAsDev(userId, project);
}

/**
 * Resolves sheet UI rules for the current user on a project.
 * Team workspaces: edit rights come only from project assignment (PM/Dev), client stakeholder rows,
 * or company Admin/Owner / platform admin — never from a self-selected global workspace role.
 */
export function getCurrentUserProjectSheetRole(
  userId: string | undefined,
  project: Project | null,
  _legacyPlatformRole: UserRole,
  options?: ProjectSheetRoleOptions
): ProjectSheetRole {
  if (!userId || !project) return 'client';
  if (project.workspace_type === 'personal') return 'pm';

  if (options?.profileRole === 'admin') return 'pm';
  if (options?.isTeamAdminOrOwner) return 'pm';

  const mine = project.projectMemberEntries?.find(m => m.profile_id === userId);
  const isProjectDeveloper =
    (project.assignedDevIds ?? []).includes(userId) || mine?.workspace_role === 'dev';

  if (project.pm_id === userId) return 'pm';

  if (mine?.workspace_role === 'pm') return 'pm';
  if (mine?.workspace_role === 'dev') return 'dev';
  if (mine?.workspace_role === 'client') return 'client';

  if (project.client_id === userId) return 'client';
  if (isProjectDeveloper) return 'dev';

  return 'client';
}

/** DB column keys clients may edit (English + Japanese remark fields) per sheet; matches Supabase columns. */
export function getClientRemarkColumnKeys(tabId: string): string[] {
  switch (tabId) {
    case 'tasks':
      return ['remark'];
    case 'screen_list':
    case 'function_list':
    case 'test_case':
    case 'app_list':
      return ['remarks', 'remarks_ja'];
    default:
      return [];
  }
}

export function isTasksTab(tabId: string): boolean {
  return tabId === 'tasks';
}

function col(key: string, label: string, labelJa: string, width: number, type: SheetColumn['type'] = 'text', editable = true, options?: string[]): SheetColumn {
  return { key, label, labelJa, width, type, editable, options };
}

// ── User Profiles ─────────────────────────────────────────

let cachedProfiles: UserProfile[] = [];

export function setCachedProfiles(profiles: UserProfile[]) {
  cachedProfiles = profiles;
}

export function getUserName(userId: string): string {
  if (!userId) return 'None';
  const profile = cachedProfiles.find(u => u.id === userId);
  if (profile) return profile.name || profile.email || 'Unknown';
  return 'Unknown';
}

export function getProfilesByRole(role: UserProfile['role']): UserProfile[] {
  return cachedProfiles.filter(u => u.role === role);
}

/** All PM + developer accounts (unique). Any of these can be assigned as project PM or as a developer, including both on the same project. */
export function getAssignableTeamProfiles(): UserProfile[] {
  const seen = new Set<string>();
  const out: UserProfile[] = [];
  for (const role of ['pm', 'dev'] as const) {
    for (const u of getProfilesByRole(role)) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        out.push(u);
      }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Profile IDs listed as developers on the project (team: `project_members.workspace_role = dev`). */
export function getProjectDeveloperIds(project: Project | null): string[] {
  return project?.assignedDevIds ?? [];
}

/** Only profiles assigned as developers to the specific project. */
export function getProjectDevelopers(project: Project | null): UserProfile[] {
  const ids = getProjectDeveloperIds(project);
  if (!project || ids.length === 0) return [];
  const devs = cachedProfiles.filter(u => ids.includes(u.id));
  devs.sort((a, b) => a.name.localeCompare(b.name));
  return devs;
}

/** PM, client, devs, and any project_members row — anyone who may appear as task assignee. */
export function getProjectAssignableProfileIds(project: Project | null): string[] {
  if (!project) return [];
  const ids = new Set<string>();
  if (project.pm_id) ids.add(project.pm_id);
  if (project.client_id) ids.add(project.client_id);
  for (const id of project.assignedDevIds ?? []) ids.add(id);
  for (const m of project.projectMemberEntries ?? []) ids.add(m.profile_id);
  return [...ids];
}

export function getProjectAssignableProfiles(project: Project | null): UserProfile[] {
  const ids = getProjectAssignableProfileIds(project);
  if (ids.length === 0) return [];
  const profs = cachedProfiles.filter((u) => ids.includes(u.id));
  profs.sort((a, b) => a.name.localeCompare(b.name));
  return profs;
}

/**
 * Resolves task assignee to a profile id when that person is on the project (PM / client / dev / member).
 * Personal projects: any stored UUID is kept.
 */
export function getTaskAssigneeProfileIdForProject(row: SheetRow, project: Project | null): string | null {
  const r = row as Record<string, unknown>;
  const raw =
    (typeof r.assignee === 'string' && r.assignee ? r.assignee : null) ??
    (typeof r.assignee_id === 'string' && r.assignee_id ? r.assignee_id : null);
  if (!raw) return null;
  if (!project || project.workspace_type !== 'team') return raw;
  const allowed = getProjectAssignableProfileIds(project);
  return allowed.includes(raw) ? raw : null;
}

/** Primary PM on `projects.pm_id` or `project_members` row with workspace_role pm. */
export function userSeesProjectAsPm(userId: string, project: Project): boolean {
  if (project.pm_id === userId) return true;
  return project.projectMemberEntries?.some(m => m.profile_id === userId && m.workspace_role === 'pm') ?? false;
}

/** Listed developer (`assignedDevIds` / project_members dev). */
export function userSeesProjectAsDev(userId: string, project: Project): boolean {
  if ((project.assignedDevIds ?? []).includes(userId)) return true;
  return project.projectMemberEntries?.some(m => m.profile_id === userId && m.workspace_role === 'dev') ?? false;
}

/** Client stakeholder on `projects.client_id` or project_members client. */
export function userSeesProjectAsClient(userId: string, project: Project): boolean {
  if (project.client_id === userId) return true;
  return project.projectMemberEntries?.some(m => m.profile_id === userId && m.workspace_role === 'client') ?? false;
}

/** PM or developer access (not client-only). */
export function userSeesProjectAsTeamMember(userId: string, project: Project): boolean {
  return userSeesProjectAsPm(userId, project) || userSeesProjectAsDev(userId, project);
}

export function getProjectCountForUser(userId: string, role: UserProfile['role'], projectList: Project[]): number {
  if (role === 'pm') return projectList.filter(p => userSeesProjectAsPm(userId, p)).length;
  if (role === 'dev') return projectList.filter(p => userSeesProjectAsDev(userId, p)).length;
  if (role === 'client') return projectList.filter(p => userSeesProjectAsClient(userId, p)).length;
  return projectList.length;
}

export type Language = 'en' | 'ja';

export function getLocalizedTabName(tab: SheetTab, lang: Language): string {
  return lang === 'ja' ? tab.nameJa : tab.name;
}

export function getLocalizedColumnLabel(col: SheetColumn, lang: Language): string {
  return lang === 'ja' ? col.labelJa : col.label;
}

export function getLocalizedProjectName(project: Project, lang: Language): string {
  if (lang === 'ja') {
    return project.name_ja || project.nameJa || project.name;
  }
  return project.name;
}

const bilingualRowFieldMap: Record<string, Record<string, string>> = {
  purpose: {
    major_item: 'major_item_ja',
    content: 'content_ja',
    details: 'details_ja',
  },
  tech_stack: {
    major_item: 'major_item_ja',
    medium_item: 'medium_item_ja',
    content: 'content_ja',
  },
  non_func: {
    major_item: 'major_item_ja',
    medium_item: 'medium_item_ja',
    content: 'content_ja',
  },
  screen_list: {
    user_category: 'user_category_ja',
    major_item: 'major_item_ja',
    medium_item: 'medium_item_ja',
    screen_name: 'screen_name_ja',
    path: 'path_ja',
    overview: 'overview_ja',
    remarks: 'remarks_ja',
  },
  function_list: {
    phase: 'phase_ja',
    user_category: 'user_category_ja',
    main_category: 'main_category_ja',
    subcategory: 'subcategory_ja',
    screen_name: 'screen_name_ja',
    function_name: 'function_name_ja',
    function_details: 'function_details_ja',
    effort: 'effort_ja',
    remarks: 'remarks_ja',
  },
  tasks: {
    epic: 'epic_ja',
    medium_item: 'medium_item_ja',
    phase: 'phase_ja',
    sprint: 'sprint_ja',
    screen_name: 'screen_name_ja',
    function_name: 'function_name_ja',
    task: 'task_ja',
    remark: 'remark_ja',
  },
  test_case: {
    category: 'category_ja',
    scenario_name: 'scenario_name_ja',
    test_type: 'test_type_ja',
    summary: 'summary_ja',
    test_steps: 'test_steps_ja',
    expected_results: 'expected_results_ja',
    remarks: 'remarks_ja',
  },
  app_list: {
    category: 'category_ja',
    service_name: 'service_name_ja',
    api_name: 'api_name_ja',
    auth_method: 'auth_method_ja',
    data_handling: 'data_handling_ja',
    remarks: 'remarks_ja',
  },
  backlog: {
    epic: 'epic_ja',
    story: 'story_ja',
    task: 'task_ja',
  },
  process_chart: {
    category: 'category_ja',
    task: 'task_ja',
    sprint: 'sprint_ja',
  },
};

export function getBilingualRowFieldKey(tabId: string, key: string): string | null {
  return bilingualRowFieldMap[tabId]?.[key] ?? null;
}

/** Sheet fields available in batch-import column mapping (EN keys + `*_ja` from bilingualRowFieldMap). */
export function getImportMappingTargetsForTab(tab: SheetTab): { key: string; label: string }[] {
  const jaMap = bilingualRowFieldMap[tab.id] ?? {};
  const keysSeen = new Set<string>();
  const out: { key: string; label: string }[] = [];

  for (const c of tab.columns) {
    if (!keysSeen.has(c.key)) {
      keysSeen.add(c.key);
      out.push({ key: c.key, label: c.label });
    }
    const jaKey = jaMap[c.key];
    if (jaKey && !keysSeen.has(jaKey)) {
      keysSeen.add(jaKey);
      out.push({ key: jaKey, label: `${c.label} (JA)` });
    }
  }

  return out;
}

/**
 * Japanese (and common JP export) column headers → sheet `key` for batch-import auto-suggest.
 * Use when `labelJa` in the column definition does not match the file (vendor-specific wording).
 */
const IMPORT_HEADER_SYNONYMS: Record<string, Record<string, string>> = {
  function_list: {
    コード: 'function_code',
    コード番号: 'function_code',
    機能ＩＤ: 'function_code',
    機能id: 'function_code',
    ユーザー区分: 'user_category_ja',
    大カテゴリ: 'main_category_ja',
    中カテゴリ: 'subcategory_ja',
    画面コード: 'screen_code',
    画面ＩＤ: 'screen_code',
    機能詳細: 'function_details_ja',
    工数見積り: 'effort',
    工数見積もり: 'effort',
  },
  screen_list: {
    コード: 'screen_code',
    画面コード: 'screen_code',
    画面ＩＤ: 'screen_code',
    画面名: 'screen_name_ja',
    ユーザー区分: 'user_category_ja',
    大項目: 'major_item_ja',
    中項目: 'medium_item_ja',
    概要: 'overview_ja',
  },
  tasks: {
    コード: 'task_code',
    タスクコード: 'task_code',
    タスクＩＤ: 'task_code',
    タスクid: 'task_code',
    大項目: 'epic_ja',
    中項目: 'medium_item_ja',
    画面コード: 'screen_code',
    画面名: 'screen_name_ja',
    機能コード: 'function_code',
    機能名: 'function_name_ja',
    スプリント: 'sprint_ja',
    フェーズ: 'phase_ja',
    タスク名: 'task_ja',
    備考: 'remark_ja',
  },
};

function normalizeImportHeader(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a single spreadsheet column header to a sheet field key using Japanese labels,
 * synonyms, and bilingual `_ja` preference when the header matches `labelJa`.
 */
export function matchJapaneseImportHeaderToKey(tab: SheetTab, excelColumnHeader: string): string | null {
  const raw = normalizeImportHeader(excelColumnHeader);
  if (!raw) return null;
  const rawLower = raw.toLowerCase();

  const synonyms = IMPORT_HEADER_SYNONYMS[tab.id];
  if (synonyms) {
    for (const [jpHeader, key] of Object.entries(synonyms)) {
      const n = normalizeImportHeader(jpHeader);
      if (raw === n || rawLower === n.toLowerCase()) {
        return key;
      }
    }
  }

  for (const c of tab.columns) {
    const lja = c.labelJa ? normalizeImportHeader(c.labelJa) : '';
    if (!lja) continue;
    if (raw === lja || rawLower === lja.toLowerCase()) {
      const jaKey = getBilingualRowFieldKey(tab.id, c.key);
      return jaKey ?? c.key;
    }
  }

  return null;
}

/** Columns included in CSV/PDF export (sheet columns plus virtual `*_ja` fields not listed as their own column). */
export function getExportColumnsForTab(tab: SheetTab): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const c of tab.columns) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ key: c.key, label: c.label });
    const jaKey = getBilingualRowFieldKey(tab.id, c.key);
    if (jaKey && !seen.has(jaKey) && !tab.columns.some((col) => col.key === jaKey)) {
      seen.add(jaKey);
      out.push({ key: jaKey, label: `${c.label} (JA)` });
    }
  }
  return out;
}

/** True when this column and `${key}_ja` are both real columns (do not virtual-split or locale-fallback in the grid). */
export function columnUsesExplicitJaPair(tab: SheetTab, key: string): boolean {
  if (key.endsWith('_ja')) {
    const base = key.replace(/_ja$/, '');
    return tab.columns.some((c) => c.key === base);
  }
  return tab.columns.some((c) => c.key === `${key}_ja`);
}

/**
 * True when `col.key` maps to a JA field that is NOT a separate tab column (e.g. task/task_ja — use one EN/JA block in forms).
 */
export function shouldRenderMergedBilingualBlock(tab: SheetTab, colKey: string): boolean {
  const jaKey = getBilingualRowFieldKey(tab.id, colKey);
  if (!jaKey) return false;
  return !tab.columns.some((c) => c.key === jaKey);
}

/** Tab ids backed by DB sheet tables (excludes UI-only tabs like master_schedule). */
export function getDataSheetTabIds(): string[] {
  return sheetTabs.filter((t) => !t.isSpecialView).map((t) => t.id);
}

/**
 * True when every data tab has been fetched for this project (arrays may be empty).
 * Used so we do not skip a full sync just because dashboard bootstrap loaded tasks/tech_stack only.
 */
export function isSheetBundleComplete(
  bundle: Record<string, unknown> | undefined
): boolean {
  if (!bundle) return false;
  for (const id of getDataSheetTabIds()) {
    const rows = bundle[id];
    if (!Array.isArray(rows)) return false;
  }
  return true;
}

export const sheetTabs: SheetTab[] = [
  {
    id: 'purpose',
    name: 'Purpose',
    nameJa: '概要',
    icon: 'FileText',
    visibleTo: ['admin', 'pm', 'client'],
    columns: [
      col('major_item', 'Major Item', '大項目', 160, 'text', true),
      col('content', 'Purpose / Goal', '目的・ゴール', 300, 'longtext', true),
      col('details', 'Details', '詳細', 400, 'longtext', true),
    ],
    guestEditableColumns: [],
    pmCanAddRows: true,
  },
  {
    id: 'tech_stack',
    name: 'Technical Stack',
    nameJa: '技術スタック',
    icon: 'Server',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('major_item', 'Major Items', '大項目', 160, 'text', true),
      col('medium_item', 'Medium Item', '中項目', 160, 'text', true),
      col('content', 'Content', '内容', 500, 'longtext', true),
    ],
    guestEditableColumns: [],
    pmCanAddRows: true,
  },
  {
    id: 'non_func',
    name: 'Non-Functional',
    nameJa: '非機能要件',
    icon: 'ShieldCheck',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('major_item', 'Major Item', '大項目', 120, 'text', true),
      col('medium_item', 'Medium Item', '中項目', 160, 'text', true),
      col('content', 'Content', '内容', 500, 'longtext', true),
    ],
    guestEditableColumns: [],
    pmCanAddRows: true,
  },
  {
    id: 'screen_list',
    name: 'Screens',
    nameJa: '画面一覧',
    icon: 'Monitor',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('screen_code', 'Code', '画面ID', 120, 'code', false),
      col('user_category', 'User', 'ユーザー', 120, 'text', true),
      col('major_item', 'Major', '大項目', 120, 'text', true),
      col('medium_item', 'Medium', '中項目', 120, 'text', true),
      col('screen_name', 'Name', '画面名', 180, 'text', true),
      col('path', 'Path', 'パス', 160, 'text', true),
      col('overview', 'Overview', '概要', 250, 'longtext', true),
      col('status', 'Status', 'ステータス', 130, 'status', true, ['Not started', 'In progress', 'Completed', 'Need to be checked']),
      col('completion_dev', 'Dev', '開発完了', 80, 'status', true, ['', 'Done']),
      col('completion_client', 'Client', 'クライアント完了', 80, 'status', true, ['', 'Done']),
      col('remarks', 'Remarks', '備考', 250, 'longtext', true),
    ],
    guestEditableColumns: ['remarks'],
    pmCanAddRows: true,
  },
  {
    id: 'function_list',
    name: 'Functions',
    nameJa: '機能一覧',
    icon: 'Puzzle',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('function_code', 'Code', '機能ID', 120, 'code', false),
      col('phase', 'Phase', 'フェーズ', 100, 'select', true, ['MVP', 'v2', 'v3', 'actual_performance']),
      col('user_category', 'User', 'ユーザー', 120, 'text', true),
      col('main_category', 'Main', '大項目', 140, 'text', true),
      col('subcategory', 'Sub', '中項目', 140, 'text', true),
      col('screen_code', 'Screen', '画面ID', 100, 'text', true),
      col('screen_name', 'Screen Name', '画面名', 160, 'text', true),
      col('function_name', 'Function', '機能名', 180, 'text', true),
      col('function_details', 'Details', '詳細', 300, 'longtext', true),
      col('effort', 'Effort', '工数', 80, 'text', true),
      col('status', 'Status', 'ステータス', 130, 'status', true, ['Not started', 'In progress', 'Completed', 'Need to be checked']),
      col('completion_dev', 'Dev', '開発完了', 80, 'status', true, ['', 'Done']),
      col('completion_client', 'Client', 'クライアント完了', 80, 'status', true, ['', 'Done']),
      col('remarks', 'Remarks', '備考', 250, 'longtext', true),
    ],
    guestEditableColumns: ['remarks'],
    pmCanAddRows: true,
  },
  {
    id: 'tasks',
    name: 'Tasks',
    nameJa: 'タスク',
    icon: 'CheckSquare',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('task_code', 'Code', 'タスクID', 120, 'code', true),
      col('phase', 'Phase', 'フェーズ', 100, 'select', true, ['MVP', 'v2', 'v3', 'actual_performance']),
      col('sprint', 'Sprint', 'スプリント', 100, 'text', true),
      col('epic', 'Epic', 'エピック', 140, 'text', true),
      col('medium_item', 'Medium', '中項目', 160, 'text', true),
      col('screen_code', 'Screen', '画面ID', 100, 'text', true),
      col('screen_name', 'Screen name', '画面名', 180, 'text', true),
      col('function_code', 'Function', '機能ID', 100, 'text', true),
      col('function_name', 'Function name', '機能名', 180, 'text', true),
      col('task', 'Task', 'タスク', 250, 'text', true),
      col('person_day', 'P/Day', '工数', 80, 'number', true),
      col('assignee', 'Assignee', '担当者', 140, 'assignee', true),
      col('status', 'Status', 'ステータス', 130, 'status', true, [
        'Not started',
        'In progress',
        'In review',
        'Done',
        'Blocked',
        'Need to be checked',
      ]),
      col('deadline', 'Deadline', '期限', 120, 'date', true),
      col('completed_date', 'Done At', '完了日', 120, 'date', true),
      col('completion_pm', 'PM Check', 'PM確認', 100, 'select', true, ['', 'Check']),
      col('remark', 'Remark', '備考', 250, 'longtext', true),
    ],
    guestEditableColumns: ['remark'],
    pmCanAddRows: true,
  },
  {
    id: 'test_case',
    name: 'Test Cases',
    nameJa: 'テストケース',
    icon: 'FlaskConical',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('category', 'Category', 'カテゴリ', 150, 'text', true),
      col('scenario_name', 'Scenario', 'シナリオ', 150, 'text', true),
      col('test_type', 'Type', '種別', 100, 'text', true),
      col('summary', 'Summary', '概要', 250, 'longtext', true),
      col('test_steps', 'Steps', '手順', 300, 'longtext', true),
      col('expected_results', 'Expected', '期待値', 250, 'longtext', true),
      col('status', 'Status', 'ステータス', 100, 'status', true, ['', 'Pass', 'Fail']),
      col('tester', 'Tester', '実施者', 120, 'text', true),
      col('remarks', 'Remarks', '備考', 200, 'longtext', true),
    ],
    guestEditableColumns: [],
    pmCanAddRows: true,
  },
  {
    id: 'app_list',
    name: 'API List',
    nameJa: 'API一覧',
    icon: 'Plug',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('category', 'Category', 'カテゴリ', 120, 'text', true),
      col('service_name', 'Service', 'サービス', 140, 'text', true),
      col('api_name', 'API Name', 'API名', 160, 'text', true),
      col('auth_method', 'Auth', '認証', 120, 'text', true),
      col('data_handling', 'Data', 'データ', 250, 'longtext', true),
      col('realtime', 'Realtime', 'リアルタイム', 100, 'select', true, ['No', 'Yes', 'Partial']),
      col('mvp_required', 'Required', '必要性', 100, 'select', true, ['MVP', 'v2', 'v3', 'actual_performance']),
      col('status', 'Status', 'ステータス', 130, 'status', true, ['Not started', 'In progress', 'Completed']),
      col('remarks', 'Remarks', '備考', 200, 'longtext', true),
    ],
    guestEditableColumns: [],
    pmCanAddRows: true,
  },
  {
    id: 'backlog',
    name: 'Backlog',
    nameJa: 'バックログ',
    icon: 'ListTodo',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('epic', 'Epic', 'エピック', 140, 'text', true),
      col('story', 'Story', 'ストーリー', 180, 'text', true),
      col('task', 'Task', 'タスク', 300, 'longtext', true),
      col('owner', 'Owner', 'オーナー', 120, 'text', true),
      col('sprint', 'Sprint', 'スプリント', 100, 'text', true),
    ],
    guestEditableColumns: [],
    pmCanAddRows: true,
  },
  {
    id: 'process_chart',
    name: 'Process Chart',
    nameJa: '工程表',
    icon: 'GanttChart',
    visibleTo: ['admin', 'pm', 'dev', 'client'],
    columns: [
      col('code', 'Code', 'ID', 100, 'text', true),
      col('category', 'Category', 'カテゴリ', 120, 'text', true),
      col('task', 'Task', 'タスク', 300, 'text', true),
      col('sprint', 'Sprint', 'スプリント', 120, 'text', true),
      col('person_days', 'P/Days', '工数', 100, 'text', true),
      col('status', 'Status', 'ステータス', 130, 'status', true, ['Planned', 'In progress', 'Completed', 'Deprecated']),
    ],
    guestEditableColumns: [],
    pmCanAddRows: true,
  },
  {
    id: 'master_schedule',
    name: 'Master Schedule',
    nameJa: 'マスタースケジュール',
    icon: 'Calendar',
    visibleTo: ['admin', 'pm', 'client'],
    columns: [],
    guestEditableColumns: [],
    pmCanAddRows: false,
    isSpecialView: true,
  },
];

// ── Authentication Helpers ──────────────────────────────────

export function normalizeDemoGateEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isDemoAdminGateEmail(email: string): boolean {
  const n = normalizeDemoGateEmail(email);
  return n === 'admin@gmail.com' || n === 'admin@cyberconnect.io';
}

export function isRecognizedDemoGateEmail(email: string): boolean {
  return email.trim().length > 0;
}

export function getDemoGateEmailForUserId(userId: string): string | null {
  return cachedProfiles.find(u => u.id === userId)?.email ?? null;
}

// ── Counter for new codes ─────────────────────────────────

const counters: Record<string, number> = {};

export function generateCode(prefix: string, projectId: string): string {
  const key = `${projectId}-${prefix}`;
  counters[key] = (counters[key] || 0) + 1;
  // Add a random suffix to prevent collisions across sessions/users
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${String(counters[key]).padStart(2, '0')}-${random}`;
}

export function translate(key: string, lang: Language): string {
  if (lang === 'en') return key;
  return translations[key] ?? key;
}

export function getLocalizedCell(row: SheetRow, key: string, lang: Language): string {
  // If the value is a UUID (assignee_id, owner_id, etc), resolve it to a name
  const val = String(row[key] ?? '');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(val) && (key === 'assignee' || key === 'owner' || key === 'tester' || key === 'assignee_id' || key === 'owner_id' || key === 'tester_id')) {
    return getUserName(val);
  }

  if (lang === 'en') return val;
  const jaKey = `${key}_ja`;
  if (typeof row[jaKey] === 'string' && row[jaKey] !== '') return row[jaKey] as string;
  return val;
}

export const translations: Record<string, string> = {
  'Add New': '新規追加',
  'Add Row': '行を追加',
  'Add First Row': '最初の行を追加',
  'Cancel': 'キャンセル',
  'Save Row': '保存',
  'Save Changes': '変更を保存',
  'Saving…': '保存中…',
  'Importing rows…': 'インポート処理中…',
  'Reading file…': 'ファイルを読み込んでいます…',
  'Validating import on server…': 'サーバーで内容を確認しています…',
  'Merge into existing rows (match by code)': '既存行にマージ（コードで照合）',
  'Use this when uploading a translation or extra columns for rows you already imported. Each row must match an existing code (e.g. FNC-018).':
    '既にインポートした行に対する翻訳や追加列をアップロードする場合に使用します。各行は既存のコード（例: FNC-018）と一致する必要があります。',
  'Rows to update (merge)': '更新予定（マージ）',
  'No matching code in sheet': 'シートに該当コードなし',
  'Merge mode: rows with a green/purple highlight update existing records; grey rows have no matching code and will be skipped.':
    'マージモード: 緑/紫の行は既存レコードを更新します。灰色の行はコードが見つからずスキップされます。',
  'Saving rows to database…': 'データベースに保存しています…',
  'Saving import and updating this sheet…': '保存してシートを更新しています…',
  'Import succeeded': 'インポート成功',
  'Import completed with some errors': 'インポート完了（一部エラー）',
  'Import failed': 'インポート失敗',
  'No rows were written': '行は書き込まれませんでした',
  'This may take a moment for large files.': '大きいファイルの場合、少し時間がかかることがあります。',
  'Import Results': 'インポート結果',
  'Rows in File': 'ファイル内の行',
  'Ready to import': 'インポート対象',
  'Uploaded': 'アップロード済み',
  'Duplicates': '重複',
  'Apply to all conflicts': 'すべての競合に適用',
  'Skip all': 'すべてスキップ',
  'Overwrite all': 'すべて上書き',
  'Use new for all': 'すべて新規を使用',
  'Not Uploaded': '未アップロード',
  'Failed Validation': '検証エラー',
  'Success Rate': '成功率',
  'Got it': '閉じる',
  'Import completed.': 'インポートが完了しました。',
  'Import finished with some rows failed.': 'インポートが完了しましたが、一部の行は失敗しました。',
  'Batch import failed.': 'バッチインポートに失敗しました。',
  'Import failed — no rows were saved.': 'インポートに失敗しました。行は保存されていません。',
  'No rows were imported.': 'インポートされた行はありません。',
  'Deleting…': '削除中…',
  'Navigating…': '移動中…',
  'Save failed': '保存に失敗しました',
  'Delete failed': '削除に失敗しました',
  'Delete selected': '選択した行を削除',
  'duplicate_task_code': 'このタスクIDは既に使用されています',
  'None': 'なし',
  'No screens registered yet': '登録された画面がありません',
  'No functions registered yet': '登録された機能がありません',
  'Field': '項目',
  'Japanese': '日本語',
  'English': '英語',
  'No data in this sheet': 'このシートにはデータがありません',
  'Not started': '未着手',
  'In progress': '進行中',
  'Completed': '完了',
  'Done': '完了',
  'Blocked': 'ブロック',
  'Need to be checked': '要確認',
  'In review': 'レビュー中',
  'Pass': '合格',
  'Fail': '不合格',
  'Planned': '計画',
  'Deprecated': '廃止',
  'MVP': 'MVP（最小版）',
  'v2': 'v2',
  'v3': 'v3',
  'actual_performance': '実運用',
  'Unassigned': '未割当',
  'true': 'はい',
  'false': 'いいえ',
  // Dashboards (role + personal)
  'Executive Dashboard': 'エグゼクティブダッシュボード',
  'Global monitor': '全体モニター',
  'Staff Seats': 'スタッフ席',
  'Near Limit': '上限近し',
  'New Project': '新規プロジェクト',
  'Global Progress': '全体の進捗',
  'Global Task Distribution': 'タスク分布（全体）',
  'Platform Status': 'プラットフォーム状態',
  'Project Management': 'プロジェクト管理',
  'Active Projects — Your assigned management dashboard': '担当プロジェクト — PMダッシュボード',
  'No projects assigned as PM': 'PMとして割り当てられたプロジェクトはありません',
  "You currently don't have any projects where you are assigned as the Project Manager.":
    'プロジェクトマネージャーとして割り当てられたプロジェクトがありません。',
  'Overall Progress': '全体の進捗',
  'In Dev': '開発中',
  'Pending': '未着手',
  'Developer Portal': '開発者ポータル',
  'Engineering — Task oversight and assigned system components': 'エンジニアリング — タスクと担当領域',
  'No developer assignments': '開発者としての割当がありません',
  'You are not currently assigned to any team projects as a Developer.':
    'チームプロジェクトに開発者として割り当てられていません。',
  'Assigned Tasks': '担当タスク',
  'In Progress': '進行中',
  'Assigned Projects': '担当プロジェクト',
  'Primary Tech Stack': '主な技術スタック',
  'more': '件以上',
  'No stack defined yet': '技術スタック未登録',
  'Client Portal': 'クライアントポータル',
  'Project Oversight — Transparency and progress tracking': 'プロジェクトの可視化と進捗の把握',
  'No projects accessible': '参照できるプロジェクトがありません',
  'You are not currently listed as a client for any active projects.':
    'アクティブなプロジェクトのクライアントとして登録されていません。',
  'Primary Stakeholder Dashboard': 'ステークホルダー向けダッシュボード',
  'Status': 'ステータス',
  'Healthy': '順調',
  'Completion': '完了率',
  'Your Workspace': 'マイワークスペース',
  'Private — Manage your individual projects and roadmaps': 'プライベート — 個人プロジェクトとロードマップ',
  'Join Team': 'チームに参加',
  'Create Your Team': 'チームを作成',
  'Personal Free Plan': '個人無料プラン',
  'Management overview': '管理の概要',
  'Select a project': 'プロジェクトを選択',
  'Total Projects': 'プロジェクト総数',
  'Tasks Completed': '完了タスク',
  'Blocked Items': 'ブロック中',
  'Managed Projects': '管理中のプロジェクト',
  'Progress': '進捗',
  'Block': 'ブロック',
  'Invite': '招待',
  'Delete': '削除',
  'Developers': '開発者',
  'Assign': '割当',
  'Active': 'アクティブ',
  'On Hold': '保留',
  'Health': 'ヘルス',
  'Latency': 'レイテンシ',
  'PM': 'PM',
  'Select PM': 'PMを選択',
  'Unassign': '解除',
  'You (Admin)': 'あなた（管理者）',
  'Not Started': '未着手',
  'Development Milestone Progress': '開発マイルストーンの進捗',
  'Recent Stakeholder Feedback & Remarks': '最近のフィードバックと備考',
  'Build something amazing': 'さあ、始めましょう',
  'Start your first personal project to organize your bilingual requirements and tasks.':
    '最初の個人プロジェクトを作成し、日英の要件とタスクを整理しましょう。',
  'Create Your First Project': '最初のプロジェクトを作成',
  'Created': '作成',
  'Open Workspace': 'ワークスペースを開く',
  'Delete Project': 'プロジェクトを削除',
  'Join Team by Code': 'コードでチームに参加',
  'Enter the invite code from your team admin.': '管理者から受け取った招待コードを入力してください。',
  'Invite Code': '招待コード',
  'Upgrade to Team': 'チーム版にアップグレード',
  'Create a professional workspace to collaborate with your team and manage multiple projects.':
    'チームと協業し、複数プロジェクトを管理するプロ用ワークスペースを作成します。',
  'Company Name': '会社名',
  'Company Slug (URL)': '会社スラッグ（URL）',
  'Confirm & Purchase': '確定して購入',
  'Tasks': 'タスク',
};
