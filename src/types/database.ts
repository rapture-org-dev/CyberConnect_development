/**
 * DATABASE TYPES
 * Based on the PostgreSQL schema and Row Level Security (RLS) policies.
 */

export type WorkspaceRole = 'pm' | 'dev' | 'client' | 'member';
export type TeamRole = 'admin' | 'member';
export type WorkspaceType = 'team' | 'personal';
export type ProjectStatus = 'active' | 'completed' | 'on_hold';
export type TaskStatus =
  | 'Not started'
  | 'In progress'
  | 'In review'
  | 'Done'
  | 'Blocked'
  | 'Need to be checked';

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  /** Primary workspace role (existing schema compatibility) */
  role: 'administrator' | 'pm' | 'developer' | 'client';
  /** Global team membership info */
  team_id: string | null;
  team_role: TeamRole | null;
  status: 'pending' | 'active' | 'suspended';
  avatar_url: string;
  department: string;
  created_at: string;
  updated_at: string;
  extra_roles: string[];
  invited_by: string | null;
}

export interface Project {
  id: string;
  team_id: string | null;
  name: string;
  name_ja: string;
  client: string;
  pm_id: string | null;
  client_id: string | null;
  description: string;
  description_ja: string;
  color: string;
  status: ProjectStatus;
  background: string;
  background_ja: string;
  purpose: string;
  purpose_ja: string;
  dev_period: string;
  workspace_type: WorkspaceType;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  project_id: string;
  profile_id: string;
  workspace_role: WorkspaceRole;
}

export interface TaskRow {
  id: string;
  project_id: string;
  sort_order: number;
  task_code: string;
  phase: string | null;
  sprint: string;
  epic: string;
  epic_ja: string;
  screen_code: string;
  function_code: string;
  task: string;
  task_ja: string;
  person_day: number | null;
  assignee_id: string | null;
  status: TaskStatus;
  deadline: string | null;
  completed_date: string | null;
  completion_pm: string;
  remark: string;
  remark_ja: string;
  created_at: string;
  updated_at: string;
}
