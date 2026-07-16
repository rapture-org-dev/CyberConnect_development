export type UserRole = 'admin' | 'pm' | 'dev' | 'client';

export type AccountKind = 'team' | 'personal';

export interface Team {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  invite_code?: string;
}

export interface TeamMembership {
  team_id: string;
  profile_id: string;
  role: 'admin' | 'member';
  team?: Team;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team_id?: string;
  team_role?: 'admin' | 'member';
  /** Team = company demo (role selection). Personal = isolated workspace. */
  accountKind?: AccountKind;
  activeWorkspaceRole?: string;
  activeTeamSlug?: string;
  avatar_url?: string;
  department?: string;
}

export interface SheetTab {
  id: string;
  name: string;
  nameJa: string;
  icon: string;
  visibleTo: UserRole[];
  columns: SheetColumn[];
  guestEditableColumns: string[];
  pmCanAddRows: boolean;
  isSpecialView?: boolean;
}

export interface SheetColumn {
  key: string;
  label: string;
  labelJa: string;
  width: number;
  type: 'text' | 'status' | 'select' | 'date' | 'number' | 'code' | 'assignee' | 'longtext';
  editable: boolean;
  options?: string[];
}

export interface SheetRow {
  id: string;
  [key: string]: string | number | boolean | null | undefined;
}

export type ImportRowStatus =
  | 'pass'
  | 'duplicate'
  | 'conflict'
  | 'duplicate_in_file'
  | 'merge'
  | 'no_match';

export interface ImportPreviewRow extends SheetRow {
  previewStatus: ImportRowStatus;
}

/** Workspace role on a project (from project_members / pm_id / client_id). Used for sheet RBAC. */
export interface ProjectMemberEntry {
  profile_id: string;
  workspace_role: string;
}

export interface Project {
  id: string;
  team_id?: string;
  name: string;
  name_ja: string;
  nameJa?: string; // Keep for static data compatibility
  client: string;
  pm_id: string | null;
  assignedDevIds: string[]; // From project_members join (workspace_role = dev)
  /** All project_members rows with roles (for resolving the current user project role). */
  projectMemberEntries?: ProjectMemberEntry[];
  client_id: string | null;
  description: string;
  description_ja: string;
  color: string;
  status: 'active' | 'completed' | 'on_hold';
  background: string;
  background_ja: string;
  purpose: string;
  purpose_ja: string;
  dev_period: string;
  workspace_type: AccountKind;
  owner_id: string | null;
  created_at: string;
  /** GitHub Issues target (empty = fall back to GITHUB_OWNER / GITHUB_REPO env). */
  github_owner?: string;
  github_repo?: string;
  /** JSON array of "owner/repo" strings (first is primary). */
  github_repos?: string[];
}

export interface ExportOptions {
  format: 'pdf' | 'csv';
  columns: string[];
}

/** Represents an import action choice for a conflict */
export type ConflictResolution = 'skip' | 'overwrite' | 'use_new';

/** User's resolution for a single conflict */
export interface ConflictChoice {
  excelRowIndex: number;
  decision: ConflictResolution;
}

/** Conflict detected during import validation */
export interface ImportConflict {
  excelRowIndex: number;
  excelRow: SheetRow;
  existingRow: SheetRow;
  codeValue: string;
  codeField: string;
}

/** Result from detecting conflicts before import */
export interface ImportValidationResult {
  conflicts: ImportConflict[];
  allRows: ImportPreviewRow[];
  previewRows: SheetRow[]; // Rows with no conflicts, ready to import
  totalRows: number;
  duplicateCount: number;
  /** Rows whose code did not match any existing row (merge-by-code mode only). */
  noMatchCount: number;
}

/**
 * Full client-side validation payload used to preview the import before commit.
 */
export interface ImportValidationPreview {
  allRows: ImportPreviewRow[];
  previewRows: SheetRow[];
  conflicts: ImportConflict[];
  columnMapping: Record<string, string>;
  totalRows: number;
  duplicateCount: number;
  noMatchCount: number;
  /** When true, finalize merges each row onto an existing DB row with the same business code (e.g. Japanese-only columns). */
  mergeIntoExistingByCode: boolean;
}

/** Result from finalizing import after conflict resolution */
export interface ImportFinalResult {
  successful: SheetRow[];
  failed: Array<{
    rowData: Record<string, unknown>;
    reason: string;
  }>;
}
