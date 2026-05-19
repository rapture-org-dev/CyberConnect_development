import { getGlobalTaskStats } from '@/lib/dal/stats';
import AdminDashboardClient from './AdminDashboardClient';
import { serverApiFetch } from '@/lib/api/server-fetch';
import type { Project } from '@/types';
import { createClient } from '@/lib/supabase-server';

export default async function AdminDashboardPage(props: { params: Promise<{ team_slug: string }> }) {
  const params = await props.params;
  const teamSlug = params.team_slug;

  // Resolves the team_id using the team_slug from the URL.
  const supabase = await createClient();
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .eq('slug', teamSlug)
    .single();

  const teamId = team?.id;

  // Passes that specific team_id into the getProjectsAction.
  // If fetching for a Team, the query MUST include .eq('workspace_type', 'team').eq('team_id', requested_team_id).
  const initialProjects = teamId
    ? await serverApiFetch<Project[]>(`/api/projects?scope=team&teamId=${encodeURIComponent(teamId)}`)
    : [];

  const stats = await getGlobalTaskStats(teamId);

  return (
    <AdminDashboardClient 
      teamSlug={teamSlug} 
      serverStats={stats} 
      initialProjects={initialProjects} 
    />
  );
}
