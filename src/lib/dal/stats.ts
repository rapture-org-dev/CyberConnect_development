'use server'

import { createClient } from '@/lib/supabase-server'

export interface GlobalTaskStats {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  notStarted: number;
}

/**
 * Fetches aggregated task statistics for a specific team.
 * Filters tasks to only include those from projects in the given team.
 */
export async function getGlobalTaskStats(teamId?: string): Promise<GlobalTaskStats> {
  const supabase = await createClient()

  // If teamId is provided, filter to only projects in that team
  if (teamId) {
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('team_id', teamId);

    if (projectError) {
      console.error('Error fetching team projects:', projectError);
      return { total: 0, done: 0, inProgress: 0, blocked: 0, notStarted: 0 };
    }

    const projectIds = projects?.map(p => p.id) || [];
    
    if (projectIds.length === 0) {
      return { total: 0, done: 0, inProgress: 0, blocked: 0, notStarted: 0 };
    }

    const { data, error } = await supabase
      .from('task_rows')
      .select('status')
      .in('project_id', projectIds);

    if (error) {
      console.error('Error in getGlobalTaskStats:', error);
      return { total: 0, done: 0, inProgress: 0, blocked: 0, notStarted: 0 };
    }

    const rows = Array.isArray(data) ? data : [];

    const stats = {
      total: rows.length,
      done: 0,
      inProgress: 0,
      blocked: 0,
      notStarted: 0,
    };

    rows.forEach(row => {
      const s = row.status;
      if (s === 'Done' || s === '完了') stats.done++;
      else if (s === 'In progress' || s === '進行中' || s === 'In review' || s === 'レビュー中') stats.inProgress++;
      else if (s === 'Blocked' || s === 'ブロック中') stats.blocked++;
      else if (s === 'Not started' || s === '未着手') stats.notStarted++;
    });

    return stats;
  }

  // Fallback: fetch all accessible tasks if no teamId provided
  const { data, error } = await supabase
    .from('task_rows')
    .select('status');

  if (error) {
    console.error('Error in getGlobalTaskStats:', error);
    return { total: 0, done: 0, inProgress: 0, blocked: 0, notStarted: 0 };
  }

  const rows = Array.isArray(data) ? data : []

  const stats = {
    total: rows.length,
    done: 0,
    inProgress: 0,
    blocked: 0,
    notStarted: 0,
  };

  rows.forEach(row => {
    const s = row.status;
    if (s === 'Done' || s === '完了') stats.done++;
    else if (s === 'In progress' || s === '進行中' || s === 'In review' || s === 'レビュー中') stats.inProgress++;
    else if (s === 'Blocked' || s === 'ブロック中') stats.blocked++;
    else if (s === 'Not started' || s === '未着手') stats.notStarted++;
  });

  return stats;
}
