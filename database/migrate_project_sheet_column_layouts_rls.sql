-- Row Level Security for project_sheet_column_layouts.
-- Run AFTER database/migrate_sheet_column_layouts_and_extras.sql (table must exist).
-- Safe to re-run (drops and recreates policies).

ALTER TABLE public.project_sheet_column_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_sheet_column_layouts_select_authenticated"
  ON public.project_sheet_column_layouts;
DROP POLICY IF EXISTS "project_sheet_column_layouts_modify_authenticated"
  ON public.project_sheet_column_layouts;

-- Read: personal owner, or any member of the project's team.
CREATE POLICY "project_sheet_column_layouts_select_authenticated"
  ON public.project_sheet_column_layouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_sheet_column_layouts.project_id
        AND (
          (p.workspace_type = 'personal' AND p.owner_id = (SELECT auth.uid()))
          OR (
            p.workspace_type = 'team'
            AND p.team_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.team_members tm
              WHERE tm.team_id = p.team_id
                AND tm.profile_id = (SELECT auth.uid())
            )
          )
        )
    )
  );

-- Write: matches server-side canUpdateTeamProjectMetadata (personal owner; team admin/owner/platform admin; project PM).
CREATE POLICY "project_sheet_column_layouts_modify_authenticated"
  ON public.project_sheet_column_layouts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_sheet_column_layouts.project_id
        AND (
          (p.workspace_type = 'personal' AND p.owner_id = (SELECT auth.uid()))
          OR (
            p.workspace_type = 'team'
            AND p.team_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.profiles pr
                WHERE pr.id = (SELECT auth.uid())
                  -- Compare as text so Postgres does not cast 'admin' to user_role (your enum may not list 'admin').
                  AND pr.role::text = 'admin'
              )
              OR EXISTS (
                SELECT 1
                FROM public.teams t
                WHERE t.id = p.team_id
                  AND t.owner_id = (SELECT auth.uid())
              )
              OR EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = p.team_id
                  AND tm.profile_id = (SELECT auth.uid())
                  AND tm.role = 'admin'::public.team_roles
              )
              OR p.pm_id = (SELECT auth.uid())
              OR EXISTS (
                SELECT 1
                FROM public.project_members pm
                WHERE pm.project_id = p.id
                  AND pm.profile_id = (SELECT auth.uid())
                  AND pm.workspace_role = 'pm'::public.workspace_roles
              )
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_sheet_column_layouts.project_id
        AND (
          (p.workspace_type = 'personal' AND p.owner_id = (SELECT auth.uid()))
          OR (
            p.workspace_type = 'team'
            AND p.team_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.profiles pr
                WHERE pr.id = (SELECT auth.uid())
                  -- Compare as text so Postgres does not cast 'admin' to user_role (your enum may not list 'admin').
                  AND pr.role::text = 'admin'
              )
              OR EXISTS (
                SELECT 1
                FROM public.teams t
                WHERE t.id = p.team_id
                  AND t.owner_id = (SELECT auth.uid())
              )
              OR EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = p.team_id
                  AND tm.profile_id = (SELECT auth.uid())
                  AND tm.role = 'admin'::public.team_roles
              )
              OR p.pm_id = (SELECT auth.uid())
              OR EXISTS (
                SELECT 1
                FROM public.project_members pm
                WHERE pm.project_id = p.id
                  AND pm.profile_id = (SELECT auth.uid())
                  AND pm.workspace_role = 'pm'::public.workspace_roles
              )
            )
          )
        )
    )
  );
