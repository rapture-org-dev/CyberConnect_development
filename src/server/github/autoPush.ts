import type { SupabaseClient } from '@supabase/supabase-js'
import type { SheetRow } from '@/types'
import {
  readTaskGitHubIssue,
  resolveRepoForLinkedIssue,
  taskGitHubIssuePatch,
} from '@/lib/githubTaskLink'
import {
  desiredGitHubStateFromTaskStatus,
  mergeExtrasWithGitHubFields,
} from '@/lib/githubTaskSync'
import { getEnvGitHubRepo } from '@/lib/githubRepo'
import { setGitHubIssueState } from '@/server/github/issues'
import { loadGitHubRepoForProject } from '@/server/github/projectRepo'

/**
 * After a task row save: if linked to GitHub and status implies a different
 * open/closed state, PATCH the issue on the linked issue's repo (any repo).
 */
export async function maybeAutoPushGitHubIssueAfterTaskSave(
  supabase: SupabaseClient,
  savedMerged: SheetRow
): Promise<SheetRow> {
  if (!process.env.GITHUB_ISSUES_TOKEN) {
    return savedMerged
  }

  const linked = readTaskGitHubIssue(savedMerged as Record<string, unknown>)
  const issueNumber = Number(linked.github_issue_number)
  if (!linked.github_issue_url || !Number.isFinite(issueNumber) || issueNumber <= 0) {
    return savedMerged
  }

  const desired = desiredGitHubStateFromTaskStatus(savedMerged.status)
  if (linked.github_issue_state === desired) {
    return savedMerged
  }

  const projectId = String(savedMerged.project_id ?? '').trim()
  if (!projectId) return savedMerged

  try {
    let fallback = null as ReturnType<typeof getEnvGitHubRepo>
    try {
      fallback = await loadGitHubRepoForProject(projectId, supabase)
    } catch {
      fallback = getEnvGitHubRepo()
    }
    const repoRef = resolveRepoForLinkedIssue(linked, fallback)
    const issue = await setGitHubIssueState(issueNumber, desired, repoRef)
    const patch = taskGitHubIssuePatch({ ...issue, owner: repoRef.owner, repo: repoRef.repo })

    const { data: raw } = await supabase
      .from('task_rows')
      .select('extras')
      .eq('id', savedMerged.id)
      .maybeSingle()

    const extras = mergeExtrasWithGitHubFields(
      (raw as { extras?: unknown } | null)?.extras,
      patch
    )

    const { error } = await supabase
      .from('task_rows')
      .update({ extras })
      .eq('id', savedMerged.id)

    if (error) {
      console.error('GitHub auto-push: failed to update extras', error)
      return { ...savedMerged, ...patch } as SheetRow
    }

    return { ...savedMerged, ...patch } as SheetRow
  } catch (err) {
    console.error('GitHub auto-push after task save failed:', err)
    return savedMerged
  }
}
