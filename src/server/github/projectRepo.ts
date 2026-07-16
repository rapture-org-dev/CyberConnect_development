import { createClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listGitHubReposForProject,
  resolveGitHubRepoFromProject,
  type GitHubRepoRef,
} from '@/lib/githubRepo'

export type ProjectGitHubRow = {
  github_owner?: string | null
  github_repo?: string | null
  github_repos?: unknown
}

export async function loadProjectGitHubRow(
  projectId: string,
  supabase?: SupabaseClient
): Promise<ProjectGitHubRow> {
  const client = supabase ?? (await createClient())
  const { data, error } = await client
    .from('projects')
    .select('github_owner, github_repo, github_repos')
    .eq('id', projectId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Project not found')
  return data
}

export async function loadGitHubRepoForProject(
  projectId: string,
  supabase?: SupabaseClient
): Promise<GitHubRepoRef> {
  const data = await loadProjectGitHubRow(projectId, supabase)
  return resolveGitHubRepoFromProject(data)
}

export async function loadGitHubReposForProject(
  projectId: string,
  supabase?: SupabaseClient
): Promise<GitHubRepoRef[]> {
  const data = await loadProjectGitHubRow(projectId, supabase)
  return listGitHubReposForProject(data)
}
