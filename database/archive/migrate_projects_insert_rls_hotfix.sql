-- Hotfix: project create (personal + team) blocked by projects INSERT RLS.
-- Run as postgres. Safe to re-run.

DROP POLICY IF EXISTS projects_insert_access ON public.projects;
CREATE POLICY projects_insert_access
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
    AND (
      (
        workspace_type::text = 'personal'
        AND team_id IS NULL
      )
      OR (
        workspace_type::text = 'team'
        AND team_id IS NOT NULL
        AND (
          public.is_member_of_team(team_id)
          OR EXISTS (
            SELECT 1
            FROM public.teams t
            WHERE t.id = team_id
              AND t.owner_id = auth.uid()
          )
        )
      )
    )
  );
