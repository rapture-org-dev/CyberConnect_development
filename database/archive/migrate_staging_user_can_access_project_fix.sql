-- Staging: align user_can_access_project with personal owners + team members (prod sheet RLS).
-- Run as postgres on cyberconnect-dev after prod_rls_policies_paste.sql.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND (
        (p.workspace_type = 'personal'::workspace_type AND p.owner_id = auth.uid() AND p.team_id IS NULL)
        OR (
          p.workspace_type = 'team'::workspace_type
          AND p.team_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = p.team_id
              AND tm.profile_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = p.id
            AND pm.profile_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_project(uuid) TO anon;
