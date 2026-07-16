import { createClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveGitHubRepoFromProject, type GitHubRepoRef } from '@/lib/githubRepo'

export async function loadGitHubRepoForProject(
  projectId: string,
  supabase?: SupabaseClient
): Promise<GitHubRepoRef> {
  const client = supabase ?? (await createClient())
  const { data, error } = await client
    .from('projects')
    .select('github_owner, github_repo')
    .eq('id', projectId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Project not found')

  return resolveGitHubRepoFromProject(data)
}
