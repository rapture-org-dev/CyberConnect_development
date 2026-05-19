-- STAGING (cyberconnect-dev) — repair incomplete prod RLS paste.
-- Your markdown export dropped many CREATE POLICY lines (only DROP remained).
-- Run as postgres AFTER prod_rls_helper_functions_paste.sql.
-- Safe to re-run.

-- Prerequisite: run database/migrate_staging_user_can_access_project_fix.sql first.

-- Missing permissive sheet policies (lost when ddl was copied as markdown table) (prod "Allow * for authenticated")
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'api_list_rows',
    'backlog_rows',
    'function_list_rows',
    'non_func_rows',
    'process_chart_rows',
    'purpose_rows',
    'screen_list_rows',
    'task_rows',
    'tech_stack_rows',
    'test_case_rows'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip missing table %', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow insert for authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.projects p WHERE p.id = %I.project_id)
      )',
      'Allow insert for authenticated', t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow select if project accessible', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.projects p WHERE p.id = %I.project_id)
      )',
      'Allow select if project accessible', t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow update for authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.projects p WHERE p.id = %I.project_id)
      )',
      'Allow update for authenticated', t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow delete for authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.projects p WHERE p.id = %I.project_id)
      )',
      'Allow delete for authenticated', t, t
    );
  END LOOP;
END $$;

-- 3) Teams (Upgrade to Team)
DROP POLICY IF EXISTS "Allow users to create their own team" ON public.teams;
CREATE POLICY "Allow users to create their own team"
  ON public.teams AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Allow owners to update their own team" ON public.teams;
CREATE POLICY "Allow owners to update their own team"
  ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS teams_select_member_or_owner ON public.teams;
CREATE POLICY teams_select_member_or_owner
  ON public.teams AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = teams.id AND tm.profile_id = auth.uid()
    )
  );

-- 4) team_members (owner adds self as admin after creating team)
DROP POLICY IF EXISTS team_members_insert_self_when_owner ON public.team_members;
CREATE POLICY team_members_insert_self_when_owner
  ON public.team_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_members_select_same_team ON public.team_members;
CREATE POLICY team_members_select_same_team
  ON public.team_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id AND tm.profile_id = auth.uid()
    )
  );

-- 5) Projects — personal create (if missing)
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.projects;
CREATE POLICY "Allow insert for authenticated users"
  ON public.projects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Strict INSERT Project Isolation" ON public.projects;
CREATE POLICY "Strict INSERT Project Isolation"
  ON public.projects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (
      workspace_type = 'personal'::workspace_type
      AND owner_id = auth.uid()
    )
    OR (
      workspace_type = 'team'::workspace_type
      AND team_id IN (
        SELECT tm.team_id FROM public.team_members tm
        WHERE tm.profile_id = auth.uid()
          AND tm.role IN ('admin'::team_roles, 'pm'::team_roles)
      )
    )
  );

DROP POLICY IF EXISTS insert_projects ON public.projects;
CREATE POLICY insert_projects
  ON public.projects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (workspace_type = 'personal'::workspace_type AND owner_id = auth.uid())
    OR (
      workspace_type = 'team'::workspace_type
      AND (is_admin() OR team_id = get_my_team_id())
    )
  );
