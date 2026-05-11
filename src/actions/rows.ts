'use server'

import { createClient } from '@/lib/supabase-server'
import { getSession } from './auth'
import {
  resolveTeamProjectPrivilege,
  canMutateSheetRows,
  type TeamProjectPrivilege,
} from '@/lib/team-project-auth'
import { SheetRow, ImportValidationResult, ImportFinalResult, ImportConflict, ConflictChoice, ImportPreviewRow } from '@/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { computeNextTaskCode } from '@/lib/taskCodes'
import { recoverUtf8MisreadAsLatin1, stripTextNuls } from '@/lib/importSheet'
import { TABLE_NATIVE_KEYS } from '@/lib/tableNativeKeys'
import { mergeExtrasIntoSheetRow } from '@/lib/sheetRows'

/**
 * Server-side actions for managing Sheet Rows across all tables.
 * Centralizes data cleaning and security checks.
 *
 * Sheet row mutations do not call `revalidatePath('/')`: spreadsheet UI keeps authoritative
 * `sheetData` client-side; broad RSC revalidation added latency and workload unrelated to Postgres.
 * Call `router.refresh()` only where an SSR shell must update (e.g. admin dashboard sync).
 */

const TABLE_MAP: Record<string, string> = {
  'purpose': 'purpose_rows',
  'tech_stack': 'tech_stack_rows',
  'screen_list': 'screen_list_rows',
  'function_list': 'function_list_rows',
  'tasks': 'task_rows',
  'test_case': 'test_case_rows',
  'backlog': 'backlog_rows',
  'process_chart': 'process_chart_rows',
  'non_func': 'non_func_rows',
  'app_list': 'api_list_rows'
}

/** Batch size for import finalize — fewer round trips; on failure the chunk is split (bisect) instead of N sequential upserts. */
const IMPORT_UPSERT_CHUNK_SIZE = 100

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(uuid: unknown): uuid is string {
  return typeof uuid === 'string' && uuidRegex.test(uuid);
}

function normalizeComparableValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function buildComparableSignature(row: Record<string, unknown>, keys: string[]) {
  return keys
    .filter(Boolean)
    .sort()
    .map((key) => `${key}:${normalizeComparableValue(row[key])}`)
    .join('|');
}

/** Partial unique index on non-empty business codes for these tables. */
const UNIQUE_BUSINESS_CODE_FIELD: Partial<Record<string, string>> = {
  function_list_rows: 'function_code',
  screen_list_rows: 'screen_code',
  task_rows: 'task_code',
}

function getBusinessCodeField(tableName: string): string | null {
  return UNIQUE_BUSINESS_CODE_FIELD[tableName] ?? null
}

/**
 * When the same code appears again in one import batch (or was reserved earlier in this loop),
 * rewrite to `CODE-2`, `CODE-3`, … so Postgres unique constraints do not silently drop rows.
 */
function rewriteCodeIfClaimed(
  tableName: string,
  data: Record<string, unknown>,
  claimed: Set<string>
): void {
  const field = getBusinessCodeField(tableName)
  if (!field) return
  const code = String(data[field] ?? '').trim()
  if (!code) return
  if (!claimed.has(code)) return

  const base = code
  let n = 2
  let candidate = `${base}-${n}`
  while (claimed.has(candidate)) {
    n += 1
    candidate = `${base}-${n}`
  }
  data[field] = candidate
}

function rememberClaimedCode(tableName: string, data: Record<string, unknown>, claimed: Set<string>): void {
  const field = getBusinessCodeField(tableName)
  if (!field) return
  const code = String(data[field] ?? '').trim()
  if (code) claimed.add(code)
}

function releaseClaimedCode(tableName: string, data: Record<string, unknown>, claimed: Set<string>): void {
  const field = getBusinessCodeField(tableName)
  if (!field) return
  const code = String(data[field] ?? '').trim()
  if (code) claimed.delete(code)
}

/** Allowed labels for public.phase_type (Postgres enum). Import spreadsheets use synonyms. */
const PHASE_TYPE_CANONICAL = new Set(['MVP', 'v2', 'v3', 'actual_performance'])

/**
 * Map spreadsheet / UI text to a valid phase_type enum label.
 * e.g. "The actual performance" -> "actual_performance"
 */
function canonicalPhaseTypeValue(val: unknown): string | null {
  const raw = String(val ?? '').trim()
  if (!raw) return null
  if (PHASE_TYPE_CANONICAL.has(raw)) return raw

  const lower = raw.toLowerCase().replace(/\s+/g, ' ').replace(/^the\s+/i, '').trim()
  const alias: Record<string, string> = {
    mvp: 'MVP',
    v2: 'v2',
    v3: 'v3',
    'actual performance': 'actual_performance',
    actual_performance: 'actual_performance',
  }
  return alias[lower] ?? null
}

/** Valid `function_status` enum labels used by the app / DB. */
const FUNCTION_LIST_STATUS_CANONICAL = new Set([
  'Not started',
  'In progress',
  'In review',
  'Completed',
  'Need to be checked',
])

/**
 * Map spreadsheet status (JP/EN, bilingual cells, mojibake) to `function_status`.
 */
function canonicalFunctionListStatusValue(val: unknown): string {
  let raw = String(val ?? '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
  raw = recoverUtf8MisreadAsLatin1(raw)
  raw = raw
    .replace(/\s*,\s*Fixing\s*$/i, '')
    .replace(/\s+Fixing\s*$/i, '')
    .trim()
  if (!raw) return 'Need to be checked'

  if (FUNCTION_LIST_STATUS_CANONICAL.has(raw)) {
    if (raw === 'Not started') return 'Need to be checked'
    return raw
  }

  const lower = raw.toLowerCase().replace(/\s+/g, ' ').replace(/…/g, '...')

  // Google Sheets dropdown / badge truncation (e.g. grey pill "Need to be c...")
  if (/^need to be c(?:hecked)?/.test(lower) || lower.startsWith('need to be checked')) {
    return 'Need to be checked'
  }

  const enAlias: Record<string, string> = {
    'not started': 'Need to be checked',
    'in progress': 'In progress',
    'in review': 'In review',
    completed: 'Completed',
    'need to be checked': 'Need to be checked',
  }
  if (enAlias[lower]) return enAlias[lower]

  const compact = lower.replace(/[^a-z]/g, '')
  if (compact === 'inreview') return 'In review'

  // Bilingual cell as exported from sheets (JP + EN)
  if (/レビュー中/.test(raw)) return 'In review'

  if (/修正中\s*fixing/i.test(raw) || /^修正中$/.test(raw.trim())) return 'In progress'

  if (/修正中|修正/.test(raw)) return 'In progress'
  if (/完了|完成/.test(raw)) return 'Completed'
  if (/要確認|未着手/.test(raw)) return 'Need to be checked'

  return 'Need to be checked'
}

/** Valid `screen_status` enum labels used by the app / DB. */
const SCREEN_LIST_STATUS_CANONICAL = new Set([
  'Not started',
  'In progress',
  'In review',
  'Completed',
  'Need to be checked',
])

/** Map spreadsheet status (JP/EN, bilingual cells, mojibake) to `screen_status`. */
function canonicalScreenListStatusValue(val: unknown): string {
  let raw = String(val ?? '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
  raw = recoverUtf8MisreadAsLatin1(raw)
  raw = raw
    .replace(/\s*,\s*Fixing\s*$/i, '')
    .replace(/\s+Fixing\s*$/i, '')
    .trim()
  if (!raw) return 'Not started'

  if (SCREEN_LIST_STATUS_CANONICAL.has(raw)) {
    return raw
  }

  const lower = raw.toLowerCase().replace(/\s+/g, ' ').replace(/…/g, '...')

  if (/^need to be c(?:hecked)?/.test(lower) || lower.startsWith('need to be checked')) {
    return 'Need to be checked'
  }

  const enAlias: Record<string, string> = {
    'not started': 'Not started',
    'in progress': 'In progress',
    'in review': 'In review',
    completed: 'Completed',
    'need to be checked': 'Need to be checked',
  }
  if (enAlias[lower]) return enAlias[lower]

  const compact = lower.replace(/[^a-z]/g, '')
  if (compact === 'inreview') return 'In review'

  if (/レビュー中/.test(raw)) return 'In review'

  if (/修正中\s*fixing/i.test(raw) || /^修正中$/.test(raw.trim())) return 'In progress'

  if (/修正中|修正/.test(raw)) return 'In progress'
  if (/完了|完成/.test(raw)) return 'Completed'
  if (/要確認/.test(raw)) return 'Need to be checked'
  if (/未着手/.test(raw)) return 'Not started'

  return 'Not started'
}

function normalizeFunctionListCheckField(val: unknown): string | null {
  const s = String(val ?? '').trim()
  if (!s) return null
  const low = s.toLowerCase()
  if (low === 'done' || s === '完了') return 'Done'
  return null
}

/** Readable message from Supabase / PostgREST error objects (avoids "[object Object]"). */
function extractPostgrestErrorMessage(err: unknown): string {
  if (err == null) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message
  const o = err as {
    message?: unknown
    details?: unknown
    hint?: unknown
  }
  const parts: string[] = []
  if (typeof o.message === 'string' && o.message) parts.push(o.message)
  if (typeof o.details === 'string' && o.details) parts.push(o.details)
  if (typeof o.hint === 'string' && o.hint) parts.push(o.hint)
  if (parts.length > 0) return parts.join(' — ')
  try {
    return JSON.stringify(err)
  } catch {
    return 'Database error'
  }
}

function partitionExtrasIntoColumn(
  clean: Record<string, unknown>,
  tableName: string,
  originalRow: Record<string, unknown>
) {
  const native = TABLE_NATIVE_KEYS[tableName]
  if (!native) return

  const system = new Set(['id', 'project_id', 'created_at', 'updated_at', 'sort_order', 'extras'])
  const existingExtrasRaw = originalRow.extras
  const existingExtras =
    existingExtrasRaw && typeof existingExtrasRaw === 'object' && !Array.isArray(existingExtrasRaw)
      ? { ...(existingExtrasRaw as Record<string, unknown>) }
      : {}

  const extraPayload: Record<string, unknown> = {}
  for (const key of Object.keys(clean)) {
    if (native.has(key) || system.has(key)) continue
    extraPayload[key] = clean[key]
    delete clean[key]
  }

  clean.extras = { ...existingExtras, ...extraPayload }
}

function sanitizeRowData(row: Record<string, unknown>, tableName: string) {
  const clean: Record<string, unknown> = {}

  for (const key in row) {
    let val = row[key]

    if (key === 'extras') continue
    
    // 0. Skip virtual/UI-only fields
    if (key === 'assignedDevIds' || key === 'project_name') continue

    // 1. Handle Primary Keys and Mandatory Foreign Keys (id, project_id)
    if (key === 'id' || key === 'project_id') {
      if (isValidUUID(val)) {
        clean[key] = val;
      }
      continue;
    }

    // 2. Map Frontend Column Names to DB UUID Foreign Keys
    // If we have 'assignee' (which now contains a UUID), we move it to 'assignee_id'
    if (key === 'assignee' || key === 'owner' || key === 'tester') {
      const idKey = `${key}_id`;
      if (isValidUUID(val)) {
        clean[idKey] = val;
      } else {
        clean[idKey] = null;
      }
      continue;
    }

    // 3. Handle explicit UUID Foreign Keys (owner_id, assignee_id, etc.)
    if (key === 'owner_id' || key === 'assignee_id' || key === 'tester_id' || key.endsWith('_id')) {
      if (isValidUUID(val)) {
        clean[key] = val;
      } else {
        clean[key] = null;
      }
      continue;
    }

    // 4. Handle Nullable Numeric Columns
    if (key === 'person_day' || key === 'person_days' || key === 'sort_order') {
      if (val === '' || val === null || val === undefined) {
        val = null;
      } else {
        const parsed = parseFloat(String(val))
        val = isNaN(parsed) ? null : parsed
      }
    }

    // 5. Handle Nullable Date Columns
    if (key === 'deadline' || key === 'completed_date' || key === 'created_at' || key === 'updated_at') {
      val = (val === '' || !val) ? null : val
    }

    // 6. Handle NOT NULL Text Columns (must be at least empty string, never null)
    const notNullTextFields = [
      'remark', 'remarks', 'remark_ja', 'remarks_ja', 'completion_pm', 'status', 'effort', 'effort_ja',
      'epic', 'epic_ja', 'story', 'story_ja', 'task', 'task_ja', 'scenario_name', 'scenario_name_ja',
      'test_type', 'test_type_ja', 'summary', 'summary_ja', 'test_steps', 'test_steps_ja', 'expected_results',
      'expected_results_ja', 'tester', 'category', 'category_ja', 'service_name', 'service_name_ja',
      'api_name', 'api_name_ja', 'auth_method', 'auth_method_ja', 'data_handling', 'data_handling_ja',
      'screen_name', 'screen_name_ja', 'screen_code', 'function_name', 'function_name_ja',
      'function_code', 'function_details', 'function_details_ja', 'main_category', 'main_category_ja',
      'subcategory', 'subcategory_ja', 'user_category', 'user_category_ja', 'task_code', 'sprint', 'sprint_ja',
      'code', 'phase_ja', 'path', 'path_ja', 'medium_item', 'medium_item_ja', 'overview', 'overview_ja',
      'major_item', 'major_item_ja', 'content', 'content_ja', 'details', 'details_ja'
    ];
    if (notNullTextFields.includes(key)) {
      val = (val === null || val === undefined) ? '' : String(val)
    }

    // 7. Handle ENUM Columns (Never send empty string if it's an enum and not in the type)
    const enumFields = ['phase', 'realtime', 'mvp_required', 'status', 'completion_pm', 'completion_dev', 'completion_client'];
    if (enumFields.includes(key) && val === '') {
      val = null;
    }

    // 8. Global Catch-all for UUID Columns (ending in _id)
    // If a key ends in _id and it's an empty string, it MUST be null or omitted.
    if (key.endsWith('_id') && val === '') {
      val = null;
    }

    if (typeof val === 'string') {
      val = stripTextNuls(val)
    }

    clean[key] = val
  }

  /** Table-specific mapping fixes */

  if (tableName === 'task_rows') {
    if (clean.phase !== undefined && clean.phase !== null && String(clean.phase).trim() !== '') {
      const p = canonicalPhaseTypeValue(clean.phase)
      if (p !== null) clean.phase = p
    }
    // assignee_id is nullable — do not default to current user (that blocked true "Unassigned" saves)

    if (clean.status !== undefined && clean.status !== null && String(clean.status).trim() !== '') {
      clean.status = canonicalTaskStatusValue(clean.status)
    } else {
      clean.status = 'Not started'
    }

    // PM Check enum: ensure it maps correctly
    if (clean.completion_pm === null || clean.completion_pm === '') clean.completion_pm = ''; 
  }
  
  if (tableName === 'screen_list_rows') {
    if ('remark' in clean && !('remarks' in clean)) {
      clean.remarks = clean.remark;
      delete clean.remark;
    }
    if (clean.status !== undefined && clean.status !== null && String(clean.status).trim() !== '') {
      clean.status = canonicalScreenListStatusValue(clean.status)
    } else {
      clean.status = 'Not started'
    }
  }

  if (tableName === 'function_list_rows') {
    if (clean.phase !== undefined && clean.phase !== null) {
      const p = canonicalPhaseTypeValue(clean.phase)
      clean.phase = p
    }
    if (clean.status !== undefined && clean.status !== null && String(clean.status).trim() !== '') {
      clean.status = canonicalFunctionListStatusValue(clean.status)
    } else {
      clean.status = 'Need to be checked'
    }
    if (clean.status === '' || clean.status === 'Not started') {
      clean.status = 'Need to be checked'
    }
    if (clean.completion_dev !== undefined && clean.completion_dev !== null) {
      clean.completion_dev = normalizeFunctionListCheckField(clean.completion_dev)
    }
    if (clean.completion_client !== undefined && clean.completion_client !== null) {
      clean.completion_client = normalizeFunctionListCheckField(clean.completion_client)
    }
    if (clean.completion_dev === '') clean.completion_dev = null
    if (clean.completion_client === '') clean.completion_client = null
  }

  if (tableName === 'api_list_rows') {
    if (clean.mvp_required !== undefined && clean.mvp_required !== null) {
      const p = canonicalPhaseTypeValue(clean.mvp_required)
      clean.mvp_required = p
    }
  }

  if (tableName === 'backlog_rows') {
    // Sprint is an enum here
    if (clean.sprint === '') clean.sprint = 'Backlog';
  }

  if (tableName === 'purpose_rows') {
    for (const key of ['major_item_ja', 'content_ja', 'details_ja'] as const) {
      if (clean[key] === null || clean[key] === undefined) clean[key] = '';
    }
  }

  partitionExtrasIntoColumn(clean, tableName, row)

  return clean;
}

/** Map spreadsheet labels (e.g. Google Sheets `2.In Progress`, `1.ToDo`) to `task_status` enum values. */
function canonicalTaskStatusValue(val: unknown): string {
  let raw = stripTextNuls(String(val ?? '')).trim();
  if (!raw) return 'Not started';
  raw = recoverUtf8MisreadAsLatin1(raw);
  raw = raw.replace(/^\d+\.\s*/u, '').trim();
  raw = raw.replace(/^\d+\s*[.)]\s*/u, '').trim();
  const collapsed = raw.replace(/\s+/g, ' ');
  const lower = collapsed.toLowerCase();

  const map: Record<string, string> = {
    'not started': 'Not started',
    'in progress': 'In progress',
    'in review': 'In review',
    done: 'Done',
    blocked: 'Blocked',
    'need to be checked': 'Need to be checked',
    todo: 'Not started',
    'to do': 'Not started',
    'to-do': 'Not started',
    completed: 'Done',
    complete: 'Done',
  };
  if (map[lower]) return map[lower];

  if (/レビュー中/.test(collapsed)) return 'In review'

  const allowed = new Set([
    'Not started',
    'In progress',
    'In review',
    'Done',
    'Blocked',
    'Need to be checked',
  ]);
  if (allowed.has(collapsed)) return collapsed;

  const compact = lower.replace(/[^a-z]/g, '');
  if (compact === 'inprogress') return 'In progress';
  if (compact === 'inreview') return 'In review';
  if (compact === 'notstarted') return 'Not started';
  if (compact === 'needtobechecked') return 'Need to be checked';

  return 'Not started';
}

async function verifyProjectAccess(supabase: SupabaseClient, projectId: string) {
  const session = await getSession()
  if (!session || !isValidUUID(projectId)) return false

  const { data: project } = await supabase
    .from('projects')
    .select('owner_id, workspace_type, team_id')
    .eq('id', projectId)
    .single()

  if (!project) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .single()

  if (!profile) return false

  if (project.workspace_type === 'personal') {
    return project.owner_id === profile.id && project.team_id === null
  }

  // Team space validation
  if (project.workspace_type === 'team') {
    if (!project.team_id) return false
    
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('profile_id', profile.id)
      .eq('team_id', project.team_id)
      .single()

    return !!membership
  }

  return false
}

async function assertCanMutateTeamSheets(supabase: SupabaseClient, projectId: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const { data: profile } = await supabase.from('profiles').select('id').eq('email', session.email).maybeSingle()
  if (!profile) throw new Error('Unauthorized')

  const { data: project } = await supabase
    .from('projects')
    .select('id, team_id, workspace_type, pm_id, client_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project || project.workspace_type !== 'team') return

  const priv = await resolveTeamProjectPrivilege(supabase, profile.id, project)
  if (!canMutateSheetRows(priv)) throw new Error('Forbidden')
}

/** Team projects only; otherwise null (personal / non-team uses full row upsert). */
async function resolveTeamProjectPrivilegeForMutation(
  supabase: SupabaseClient,
  profileId: string,
  projectId: string
): Promise<TeamProjectPrivilege | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('id, team_id, workspace_type, pm_id, client_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project || project.workspace_type !== 'team' || !project.team_id) return null
  return resolveTeamProjectPrivilege(supabase, profileId, project)
}

/** Dev + client/member assignees: DB RBAC allows only `status` updates on these tabs (matches trigger). */
function isAssigneeStatusOnlySheetTab(tabId: string, priv: TeamProjectPrivilege | null): boolean {
  if (tabId !== 'function_list' && tabId !== 'screen_list') return false
  return priv === 'project_dev' || priv === 'project_assignee'
}

/** Team projects: PM, client, and all project_members may be task assignees (not only devs). */
async function loadTeamProjectAssignableProfileIds(
  supabase: SupabaseClient,
  projectId: string
): Promise<string[] | null> {
  const { data: proj } = await supabase
    .from('projects')
    .select('workspace_type, pm_id, client_id')
    .eq('id', projectId)
    .single();
  if (!proj || proj.workspace_type !== 'team') return null;
  const { data: members } = await supabase
    .from('project_members')
    .select('profile_id')
    .eq('project_id', projectId);
  const ids = new Set<string>();
  for (const m of members ?? []) {
    const id = (m as { profile_id: string }).profile_id;
    if (id) ids.add(id);
  }
  if (proj.pm_id) ids.add(proj.pm_id as string);
  if (proj.client_id) ids.add(proj.client_id as string);
  return [...ids];
}

/**
 * Supabase returns `assignee_id`; the sheet column key is `assignee`. Without this, fresh loads
 * show "Unassigned" while rows saved from the detail panel (which send `assignee`) look correct.
 */
function shapeTaskRowsForClient(rows: SheetRow[]): SheetRow[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    const aid = r.assignee_id
    const assigneeVal = r.assignee
    const hasAssignee =
      assigneeVal !== undefined &&
      assigneeVal !== null &&
      String(assigneeVal).length > 0
    if (typeof aid === 'string' && aid && !hasAssignee) {
      return { ...row, assignee: aid } as SheetRow
    }
    return row
  })
}

function shapeTaskRowForClient(row: SheetRow): SheetRow {
  return shapeTaskRowsForClient([row])[0]
}

async function fetchTaskCodesForProject(supabase: SupabaseClient, projectId: string): Promise<string[]> {
  const { data } = await supabase.from('task_rows').select('task_code').eq('project_id', projectId)
  return (data ?? []).map((r) => String((r as { task_code: string }).task_code ?? ''))
}

/** Next `TSK-01-NNN` for the project (max matching suffix + 1, or 001 if none). */
export async function getNextTaskCodeAction(projectId: string): Promise<string> {
  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, projectId))) throw new Error('Forbidden')
  const codes = await fetchTaskCodesForProject(supabase, projectId)
  return computeNextTaskCode(codes)
}

function mapUniqueViolationError(tableName: string, err: unknown): Error {
  const fullText = extractPostgrestErrorMessage(err).toLowerCase()
  const e = err as { code?: string }
  const code = e?.code ?? ''
  const isDup =
    code === '23505' ||
    fullText.includes('duplicate key') ||
    fullText.includes('unique constraint')
  if (tableName === 'task_rows' && isDup && fullText.includes('idx_task_code_project')) {
    return new Error('duplicate_task_code')
  }
  if (tableName === 'function_list_rows' && isDup && fullText.includes('idx_function_code_project')) {
    return new Error('Duplicate function code for this project')
  }
  if (tableName === 'screen_list_rows' && isDup && fullText.includes('idx_screen_code_project')) {
    return new Error('Duplicate screen code for this project')
  }
  return new Error(extractPostgrestErrorMessage(err))
}

export async function getSheetRowsAction(projectId: string, tabId: string): Promise<SheetRow[]> {
  const tableName = TABLE_MAP[tabId]
  if (!tableName) return []

  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, projectId))) return []

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error(`getSheetRowsAction error (${tableName}):`, error)
    return []
  }

  const rows = (data ?? []).map((r) => mergeExtrasIntoSheetRow(r as Record<string, unknown>))
  if (tabId === 'tasks') return shapeTaskRowsForClient(rows)
  return rows
}

export async function upsertSheetRowAction(tabId: string, row: Partial<SheetRow> & { id: string; project_id: string }): Promise<SheetRow> {
  const tableName = TABLE_MAP[tabId]
  if (!tableName) throw new Error(`Unknown table for tab: ${tabId}`)

  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, row.project_id))) throw new Error('Forbidden')
  await assertCanMutateTeamSheets(supabase, row.project_id)

  const cleanedData = sanitizeRowData(row, tableName)

  const { data: profileForPriv } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .maybeSingle()
  if (!profileForPriv) throw new Error('Unauthorized')
  const teamPriv = await resolveTeamProjectPrivilegeForMutation(
    supabase,
    profileForPriv.id,
    row.project_id
  )
  if (isAssigneeStatusOnlySheetTab(tabId, teamPriv)) {
    const { data, error } = await supabase
      .from(tableName)
      .update({ status: cleanedData.status })
      .eq('id', row.id)
      .eq('project_id', row.project_id)
      .select()
      .single()

    if (error) {
      console.error(`DB Error in ${tableName}:`, JSON.stringify(error, null, 2))
      throw mapUniqueViolationError(tableName, error)
    }

    return data as SheetRow
  }

  let payload: Record<string, unknown> = cleanedData
  if (tableName === 'task_rows') {
    const allowed = await loadTeamProjectAssignableProfileIds(supabase, row.project_id);
    if (allowed !== null) {
      const aid = cleanedData.assignee_id;
      if (typeof aid === 'string' && aid && !allowed.includes(aid)) {
        payload = { ...cleanedData, assignee_id: null };
      }
    }

    const p = payload as Record<string, unknown>
    const tcIn = String(p.task_code ?? '').trim()
    const { data: existing } = await supabase
      .from('task_rows')
      .select('task_code')
      .eq('id', row.id)
      .maybeSingle()
    const existingCode = existing ? String((existing as { task_code: string }).task_code ?? '').trim() : ''

    if (!tcIn) {
      if (existingCode) {
        p.task_code = existingCode
      } else {
        const codes = await fetchTaskCodesForProject(supabase, row.project_id)
        p.task_code = computeNextTaskCode(codes)
      }
    }
  }

  const { data, error } = await supabase
    .from(tableName)
    .upsert(payload)
    .select()
    .single()

  if (error) {
    console.error(`DB Error in ${tableName}:`, JSON.stringify(error, null, 2))
    throw mapUniqueViolationError(tableName, error)
  }

  const saved = data as SheetRow
  if (tabId === 'tasks') return shapeTaskRowForClient(saved)
  return saved
}

/**
 * Bulk upsert for write-behind / batched sheet saves. Same rules as `upsertSheetRowAction`;
 * uses chunked upserts with bisect-on-failure like import finalize.
 */
export async function upsertSheetRowsBatchAction(
  tabId: string,
  projectId: string,
  rows: (Partial<SheetRow> & { id: string })[]
): Promise<SheetRow[]> {
  if (rows.length === 0) return []

  const byId = new Map<string, Partial<SheetRow> & { id: string }>()
  for (const r of rows) {
    byId.set(r.id, r)
  }
  const deduped = [...byId.values()]

  const tableName = TABLE_MAP[tabId]
  if (!tableName) throw new Error(`Unknown table for tab: ${tabId}`)

  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, projectId))) throw new Error('Forbidden')
  await assertCanMutateTeamSheets(supabase, projectId)

  const { data: profileForPriv } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', session.email)
    .maybeSingle()
  if (!profileForPriv) throw new Error('Unauthorized')
  const teamPriv = await resolveTeamProjectPrivilegeForMutation(supabase, profileForPriv.id, projectId)

  if (isAssigneeStatusOnlySheetTab(tabId, teamPriv)) {
    const savedRows: SheetRow[] = []
    for (const row of deduped) {
      const base = { ...row, project_id: projectId } as Record<string, unknown>
      const cleanedData = sanitizeRowData(base, tableName)
      const { data, error } = await supabase
        .from(tableName)
        .update({ status: cleanedData.status })
        .eq('id', row.id)
        .eq('project_id', projectId)
        .select()
        .single()
      if (error) {
        console.error(`DB Error in ${tableName}:`, JSON.stringify(error, null, 2))
        throw mapUniqueViolationError(tableName, error)
      }
      if (data) savedRows.push(data as SheetRow)
    }
    const order = new Map(deduped.map((r, i) => [r.id, i]))
    return [...savedRows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }

  const assignableProfileIds =
    tableName === 'task_rows' ? await loadTeamProjectAssignableProfileIds(supabase, projectId) : null

  const ids = deduped.map((r) => r.id).filter(isValidUUID)

  const existingTaskCodeById = new Map<string, string>()
  if (tableName === 'task_rows' && ids.length > 0) {
    const { data: existing } = await supabase
      .from('task_rows')
      .select('id, task_code')
      .eq('project_id', projectId)
      .in('id', ids)

    for (const ex of existing ?? []) {
      const rec = ex as { id: string; task_code?: string }
      existingTaskCodeById.set(rec.id, String(rec.task_code ?? '').trim())
    }
  }

  let pendingTaskCodes = await fetchTaskCodesForProject(supabase, projectId)

  const payloads: Record<string, unknown>[] = []
  for (const row of deduped) {
    const base = { ...row, project_id: projectId } as Record<string, unknown>
    let cleanedData = sanitizeRowData(base, tableName)

    if (tableName === 'task_rows') {
      if (assignableProfileIds !== null) {
        const aid = cleanedData.assignee_id
        if (typeof aid === 'string' && aid && !assignableProfileIds.includes(aid)) {
          cleanedData = { ...cleanedData, assignee_id: null }
        }
      }

      const p = cleanedData as Record<string, unknown>
      const tcIn = String(p.task_code ?? '').trim()
      const existingCode = existingTaskCodeById.get(row.id) ?? ''

      if (!tcIn) {
        if (existingCode) {
          p.task_code = existingCode
        } else {
          const next = computeNextTaskCode(pendingTaskCodes)
          pendingTaskCodes = [...pendingTaskCodes, next]
          p.task_code = next
        }
      }
    }

    payloads.push(cleanedData)
  }

  const savedRows: SheetRow[] = []

  const upsertChunkOrBisect = async (chunk: Record<string, unknown>[]): Promise<void> => {
    if (chunk.length === 0) return

    const { data: batchData, error: batchError } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: 'id' })
      .select()

    if (!batchError && batchData != null) {
      const arr = Array.isArray(batchData) ? batchData : [batchData]
      savedRows.push(...(arr as SheetRow[]))
      return
    }

    if (chunk.length === 1) {
      const cleanedData = chunk[0]
      const { data, error } = await supabase
        .from(tableName)
        .upsert(cleanedData, { onConflict: 'id' })
        .select()
        .single()

      if (error) throw mapUniqueViolationError(tableName, error)
      if (data) savedRows.push(data as SheetRow)
      return
    }

    const mid = Math.floor(chunk.length / 2)
    await upsertChunkOrBisect(chunk.slice(0, mid))
    await upsertChunkOrBisect(chunk.slice(mid))
  }

  for (let i = 0; i < payloads.length; i += IMPORT_UPSERT_CHUNK_SIZE) {
    await upsertChunkOrBisect(payloads.slice(i, i + IMPORT_UPSERT_CHUNK_SIZE))
  }

  const shaped =
    tabId === 'tasks'
      ? shapeTaskRowsForClient(savedRows)
      : savedRows

  const order = new Map(deduped.map((r, i) => [r.id, i]))
  return [...shaped].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export async function deleteSheetRowAction(tabId: string, projectId: string, rowId: string): Promise<void> {
  const tableName = TABLE_MAP[tabId]
  if (!tableName) throw new Error(`Unknown table for tab: ${tabId}`)

  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, projectId))) throw new Error('Forbidden')
  await assertCanMutateTeamSheets(supabase, projectId)

  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', rowId)

  if (error) throw error
}

export async function deleteSheetRowsBatchAction(
  tabId: string,
  projectId: string,
  rowIds: string[]
): Promise<void> {
  const tableName = TABLE_MAP[tabId]
  if (!tableName) throw new Error(`Unknown table for tab: ${tabId}`)
  if (rowIds.length === 0) return

  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, projectId))) throw new Error('Forbidden')
  await assertCanMutateTeamSheets(supabase, projectId)

  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('project_id', projectId)
    .in('id', rowIds)

  if (error) throw error
}

export type ValidateImportRowsOptions = {
  /** Match each row to an existing DB row by business code and merge imported cells (e.g. Japanese translations). */
  mergeIntoExistingByCode?: boolean
}

export type FinalizeImportRowsOptions = {
  mergeIntoExistingByCode?: boolean
}

/**
 * Validate and map Excel rows to sheet rows, detecting conflicts
 * Returns preview rows and list of conflicts to resolve
 */
export async function validateAndMapImportRows(
  projectId: string,
  tabId: string,
  excelRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
  options?: ValidateImportRowsOptions
): Promise<ImportValidationResult> {
  const tableName = TABLE_MAP[tabId]
  if (!tableName) throw new Error(`Unknown table for tab: ${tabId}`)

  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, projectId))) throw new Error('Forbidden')
  await assertCanMutateTeamSheets(supabase, projectId)

  const businessField = getBusinessCodeField(tableName)
  const mergeMode = Boolean(options?.mergeIntoExistingByCode)

  if (mergeMode && !businessField) {
    throw new Error('Merge into existing rows is not available for this sheet.')
  }

  // Map Excel rows to sheet rows using column mapping
  const mappedRows = excelRows.map((excelRow, idx) => {
    const sheetRow: Record<string, unknown> = {
      id: crypto.randomUUID(),
      project_id: projectId,
    }

    for (const [excelCol, sheetColKey] of Object.entries(columnMapping)) {
      if (sheetColKey) {
        sheetRow[sheetColKey] = excelRow[excelCol] ?? ''
      }
    }

    return sheetRow as SheetRow
  })

  const comparableKeys = [...new Set(Object.values(columnMapping).filter((key): key is string => !!key))]

  const resolvedCodeField =
    mergeMode && businessField
      ? businessField
      : businessField !== null &&
          mappedRows.some(
            (row) =>
              normalizeComparableValue((row as Record<string, unknown>)[businessField] as unknown) !== ''
          )
        ? businessField
        : ['task_code', 'screen_code', 'function_code', 'code'].find((field) => {
            return mappedRows.some((row) => normalizeComparableValue(row[field]) !== '')
          }) || 'code'

  // Check for exact duplicates and code conflicts
  const conflicts: ImportConflict[] = []
  const previewRows: SheetRow[] = []
  const allRows: ImportPreviewRow[] = []

  const existingRows: Record<string, SheetRow> = {}
  const existingExactRows: Record<string, SheetRow> = {}
  const { data: dbRows } = await supabase
    .from(tableName)
    .select('*')
    .eq('project_id', projectId)

  if (dbRows) {
    ;(dbRows as SheetRow[]).forEach((row) => {
      const codeVal = String((row as Record<string, unknown>)[resolvedCodeField] ?? '')
      if (codeVal) {
        existingRows[codeVal] = row
      }
      const exactSignature = buildComparableSignature(row as Record<string, unknown>, comparableKeys)
      if (exactSignature) {
        existingExactRows[exactSignature] = row
      }
    })
  }

  /** First row index for each full-row signature (all mapped columns); used for duplicate-in-file only. */
  const firstIndexByFileSignature = new Map<string, number>()

  // Detect conflicts and preview rows
  let exactDuplicateCount = 0
  let duplicateInFileCount = 0
  let noMatchCount = 0

  mappedRows.forEach((row, idx) => {
    const exactSignature = buildComparableSignature(row as Record<string, unknown>, comparableKeys)
    if (exactSignature && existingExactRows[exactSignature]) {
      exactDuplicateCount += 1
      allRows.push({ ...row, previewStatus: 'duplicate' })
      return
    }

    // Within-file duplicate only when every mapped column matches an earlier row (same as DB exact-match logic).
    if (exactSignature) {
      const firstIdx = firstIndexByFileSignature.get(exactSignature)
      if (firstIdx !== undefined) {
        duplicateInFileCount += 1
        allRows.push({ ...row, previewStatus: 'duplicate_in_file' })
        return
      }
      firstIndexByFileSignature.set(exactSignature, idx)
    }

    const codeVal = normalizeComparableValue((row as Record<string, unknown>)[resolvedCodeField])

    if (mergeMode) {
      if (codeVal && existingRows[codeVal]) {
        previewRows.push(row)
        allRows.push({ ...row, previewStatus: 'merge' })
        return
      }
      noMatchCount += 1
      allRows.push({ ...row, previewStatus: 'no_match' })
      return
    }

    if (codeVal && existingRows[codeVal]) {
      conflicts.push({
        excelRowIndex: idx,
        excelRow: row,
        existingRow: existingRows[codeVal],
        codeValue: codeVal,
        codeField: resolvedCodeField,
      })
      allRows.push({ ...row, previewStatus: 'conflict' })
    } else {
      previewRows.push(row)
      allRows.push({ ...row, previewStatus: 'pass' })
    }
  })

  return {
    conflicts,
    allRows,
    previewRows,
    totalRows: excelRows.length,
    duplicateCount: conflicts.length + exactDuplicateCount + duplicateInFileCount,
    noMatchCount,
  }
}

/**
 * Finalize import after user resolves conflicts
 * Applies user decisions and imports rows
 */
export async function finalizeImportRows(
  projectId: string,
  tabId: string,
  rowsToImport: SheetRow[],
  conflictResolutions: ConflictChoice[],
  options?: FinalizeImportRowsOptions
): Promise<ImportFinalResult> {
  const tableName = TABLE_MAP[tabId]
  if (!tableName) throw new Error(`Unknown table for tab: ${tabId}`)

  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = await createClient()
  if (!(await verifyProjectAccess(supabase, projectId))) throw new Error('Forbidden')
  await assertCanMutateTeamSheets(supabase, projectId)

  const successful: SheetRow[] = []
  const failed: Array<{ rowData: Record<string, unknown>; reason: string }> = []

  const { data: existingDbRows } = await supabase
    .from(tableName)
    .select('*')
    .eq('project_id', projectId)
  const existingRowsArray = (existingDbRows ?? []) as SheetRow[]

  /** DB + codes reserved for earlier rows in this import (avoids unique violations on function_code / screen_code / task_code). */
  const claimedCodes = new Set<string>()
  for (const r of existingRowsArray) {
    const f = getBusinessCodeField(tableName)
    if (!f) break
    const c = String((r as Record<string, unknown>)[f] ?? '').trim()
    if (c) claimedCodes.add(c)
  }

  let pendingTaskCodes = existingRowsArray.map((r) => String(r.task_code ?? ''))

  const assignableProfileIds =
    tableName === 'task_rows'
      ? await loadTeamProjectAssignableProfileIds(supabase, projectId)
      : null

  /** Rows prepared in order (sanitize + codes); claimedCodes updated per row like single-row import. */
  const preparedPayloads: Record<string, unknown>[] = []

  const mergeMode =
    Boolean(options?.mergeIntoExistingByCode) && getBusinessCodeField(tableName) !== null

  if (mergeMode) {
    const codeField = getBusinessCodeField(tableName)!
    for (const row of rowsToImport) {
      try {
        const importRaw = { ...(row as Record<string, unknown>) }
        delete importRaw.id
        const code = normalizeComparableValue(importRaw[codeField])
        if (!code) {
          failed.push({
            rowData: row as Record<string, unknown>,
            reason: `Missing ${codeField} — map the code column or turn off merge mode.`,
          })
          continue
        }
        const existing = existingRowsArray.find(
          (r) => normalizeComparableValue((r as Record<string, unknown>)[codeField]) === code
        )
        if (!existing) {
          failed.push({
            rowData: row as Record<string, unknown>,
            reason: `No existing row with ${codeField} "${code}". Upload the primary sheet first or turn off merge mode.`,
          })
          continue
        }
        const merged = {
          ...(existing as Record<string, unknown>),
          ...importRaw,
          id: existing.id,
          project_id: projectId,
        }
        let cleanedData = sanitizeRowData(merged, tableName)

        const comparableKeys = Object.keys(cleanedData).filter(
          (key) => key !== 'id' && key !== 'project_id' && key !== 'created_at' && key !== 'updated_at'
        )
        const exactSignature = buildComparableSignature(cleanedData, comparableKeys)
        if (
          exactSignature &&
          existingRowsArray.some(
            (existingRow) =>
              buildComparableSignature(existingRow as Record<string, unknown>, comparableKeys) === exactSignature
          )
        ) {
          continue
        }

        if (tableName === 'task_rows' && assignableProfileIds !== null) {
          const aid = cleanedData.assignee_id
          if (typeof aid === 'string' && aid && !assignableProfileIds.includes(aid)) {
            cleanedData = { ...cleanedData, assignee_id: null }
          }
        }

        preparedPayloads.push(cleanedData)
      } catch (err: any) {
        failed.push({
          rowData: row as Record<string, unknown>,
          reason: err?.message || 'Unknown error',
        })
      }
    }
  } else {
    for (const row of rowsToImport) {
      try {
        const cleanedData = sanitizeRowData(row as Record<string, unknown>, tableName)

        const comparableKeys = Object.keys(cleanedData).filter(
          (key) => key !== 'id' && key !== 'project_id' && key !== 'created_at' && key !== 'updated_at'
        )
        const exactSignature = buildComparableSignature(cleanedData, comparableKeys)

        if (
          exactSignature &&
          existingRowsArray.some(
            (existingRow) =>
              buildComparableSignature(existingRow as Record<string, unknown>, comparableKeys) === exactSignature
          )
        ) {
          continue
        }

        if (tableName === 'task_rows') {
          const tc = String(cleanedData.task_code ?? '').trim()
          if (!tc) {
            cleanedData.task_code = computeNextTaskCode(pendingTaskCodes)
          }
          rewriteCodeIfClaimed(tableName, cleanedData, claimedCodes)
          const finalTc = String(cleanedData.task_code ?? '').trim()
          pendingTaskCodes = [...pendingTaskCodes, finalTc].filter(Boolean)
        } else {
          rewriteCodeIfClaimed(tableName, cleanedData, claimedCodes)
        }

        if (tableName === 'task_rows' && assignableProfileIds !== null) {
          const aid = cleanedData.assignee_id
          if (typeof aid === 'string' && aid && !assignableProfileIds.includes(aid)) {
            cleanedData.assignee_id = null
          }
        }

        rememberClaimedCode(tableName, cleanedData, claimedCodes)
        preparedPayloads.push(cleanedData)
      } catch (err: any) {
        failed.push({
          rowData: row,
          reason: err.message || 'Unknown error',
        })
      }
    }
  }

  /**
   * Upsert rows in bulk; if the batch fails (any row error, size/timeout, etc.), split the chunk
   * instead of issuing one HTTP round trip per row — that path could take many minutes on large imports.
   */
  const upsertChunkOrBisect = async (chunk: Record<string, unknown>[]): Promise<void> => {
    if (chunk.length === 0) return

    const { data: batchData, error: batchError } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: 'id' })
      .select()

    if (!batchError && batchData != null) {
      const rows = Array.isArray(batchData) ? batchData : [batchData]
      successful.push(...(rows as SheetRow[]))
      return
    }

    if (chunk.length === 1) {
      const cleanedData = chunk[0]
      const { data, error } = await supabase
        .from(tableName)
        .upsert(cleanedData, { onConflict: 'id' })
        .select()
        .single()

      if (error) {
        releaseClaimedCode(tableName, cleanedData, claimedCodes)
        failed.push({
          rowData: cleanedData,
          reason: mapUniqueViolationError(tableName, error).message || extractPostgrestErrorMessage(error),
        })
      } else if (data) {
        successful.push(data as SheetRow)
      }
      return
    }

    const mid = Math.floor(chunk.length / 2)
    await upsertChunkOrBisect(chunk.slice(0, mid))
    await upsertChunkOrBisect(chunk.slice(mid))
  }

  for (let i = 0; i < preparedPayloads.length; i += IMPORT_UPSERT_CHUNK_SIZE) {
    await upsertChunkOrBisect(preparedPayloads.slice(i, i + IMPORT_UPSERT_CHUNK_SIZE))
  }

  // conflictResolutions: ConflictResolver already merges overwrite/use_new rows into `rowsToImport` above.

  return {
    successful,
    failed,
  }
}
