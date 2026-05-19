-- ================================================================================
-- CyberConnect — FULL RLS (helpers, auth trigger, production policies)
-- Supabase SQL Editor · Role = postgres
-- Run AFTER: database/cyberconnect_schema.sql
-- ================================================================================

-- --- Sign-up: auto-create profile ---

-- Auto-create public.profiles when a new auth.users row is inserted (sign-up).
-- Runs as SECURITY DEFINER so it works even when the browser has no session yet
-- (e.g. email confirmation off/on, or client upsert blocked by RLS timing).
-- Run once per Supabase project (staging + prod). Safe to re-run.
--
-- IMPORTANT (Supabase SQL Editor):
-- Bottom-right "Role" must be **postgres** — NOT "authenticated" as your email.
-- Otherwise you get: permission denied for schema public (42501).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  display_name text;
  user_email text;
BEGIN
  user_email := lower(coalesce(trim(new.email), ''));
  display_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  IF display_name IS NULL OR display_name = '' THEN
    display_name := coalesce(nullif(split_part(user_email, '@', 1), ''), 'User');
  END IF;

  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (
    new.id,
    display_name,
    user_email,
    'client'::public.user_role,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = CASE
      WHEN EXCLUDED.name IS NOT NULL AND EXCLUDED.name <> '' THEN EXCLUDED.name
      ELSE public.profiles.name
    END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- --- RLS helper functions ---

-- Paste from production export (export_prod_rls_functions_for_staging.sql).
-- Run on STAGING as postgres BEFORE applying prod RLS policies (Section B ddl).

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_my_team_id()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
   SELECT team_id FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
   SELECT EXISTS (
     SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND team_role = 'admin'
   );
$function$;

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
   SELECT EXISTS (
     SELECT 1 FROM public.project_members
     WHERE project_id = p_project_id AND profile_id = auth.uid()
   );
$function$;

-- --- user_can_access_project (personal owner + team + project_members) ---

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

-- --- Enable RLS, drop old policies, create production policies ---

ALTER TABLE public.api_list_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.backlog_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.code_sequences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.function_list_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.non_func_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.process_chart_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_sheet_column_layouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purpose_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.screen_list_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tech_stack_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.test_case_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.api_list_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.api_list_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.api_list_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.api_list_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.api_list_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.api_list_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.api_list_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.api_list_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.api_list_rows;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.backlog_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.backlog_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.backlog_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.backlog_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.backlog_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.backlog_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.backlog_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.backlog_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.backlog_rows;

DROP POLICY IF EXISTS "code_sequences: pm and above can write" ON public.code_sequences;

DROP POLICY IF EXISTS "code_sequences: project members can read" ON public.code_sequences;

DROP POLICY IF EXISTS "Allow CRUD for project members" ON public.function_list_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.function_list_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.function_list_rows;

DROP POLICY IF EXISTS "Admin manages invitations" ON public.invitations;

DROP POLICY IF EXISTS "Anyone can read pending invitations by token" ON public.invitations;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.non_func_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.non_func_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.non_func_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.non_func_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.non_func_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.non_func_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.non_func_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.non_func_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.non_func_rows;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.process_chart_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.process_chart_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.process_chart_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.process_chart_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.process_chart_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.process_chart_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.process_chart_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.process_chart_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.process_chart_rows;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

DROP POLICY IF EXISTS "profiles: own row + admins see all" ON public.profiles;

DROP POLICY IF EXISTS "profiles: users update own row" ON public.profiles;

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

DROP POLICY IF EXISTS "Admin full access on project_members" ON public.project_members;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.project_members;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.project_members;

DROP POLICY IF EXISTS "project_members: admin and PM can manage" ON public.project_members;

DROP POLICY IF EXISTS "project_members: visible to project members" ON public.project_members;

DROP POLICY IF EXISTS project_sheet_column_layouts_modify_authenticated ON public.project_sheet_column_layouts;

DROP POLICY IF EXISTS project_sheet_column_layouts_select_authenticated ON public.project_sheet_column_layouts;

DROP POLICY IF EXISTS "Admin full access on projects" ON public.projects;

DROP POLICY IF EXISTS "Allow delete for owners" ON public.projects;

DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.projects;

DROP POLICY IF EXISTS "Allow select for owners or team" ON public.projects;

DROP POLICY IF EXISTS "Allow update for owners" ON public.projects;

DROP POLICY IF EXISTS "Allow update for owners or team" ON public.projects;

DROP POLICY IF EXISTS "Members can view assigned projects" ON public.projects;

DROP POLICY IF EXISTS "PM can manage own projects" ON public.projects;

DROP POLICY IF EXISTS "Personal projects isolation" ON public.projects;

DROP POLICY IF EXISTS "Strict INSERT Project Isolation" ON public.projects;

DROP POLICY IF EXISTS "Strict SELECT Project Isolation" ON public.projects;

DROP POLICY IF EXISTS "Strict UPDATE/DELETE Isolation" ON public.projects;

DROP POLICY IF EXISTS "Team projects isolation" ON public.projects;

DROP POLICY IF EXISTS insert_projects ON public.projects;

DROP POLICY IF EXISTS manage_projects ON public.projects;

DROP POLICY IF EXISTS "projects: admin and PM can insert" ON public.projects;

DROP POLICY IF EXISTS "projects: admin and PM can update" ON public.projects;

DROP POLICY IF EXISTS "projects: admin only delete" ON public.projects;

DROP POLICY IF EXISTS "projects: visible to assigned users" ON public.projects;

DROP POLICY IF EXISTS select_projects ON public.projects;

DROP POLICY IF EXISTS purpose_rows_delete ON public.purpose_rows;

DROP POLICY IF EXISTS purpose_rows_insert ON public.purpose_rows;

DROP POLICY IF EXISTS purpose_rows_select ON public.purpose_rows;

DROP POLICY IF EXISTS purpose_rows_update ON public.purpose_rows;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.screen_list_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.screen_list_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.screen_list_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.screen_list_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.screen_list_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.screen_list_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.screen_list_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.screen_list_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.screen_list_rows;

DROP POLICY IF EXISTS "Admins full access tasks" ON public.task_rows;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.task_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.task_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.task_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.task_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.task_rows;

DROP POLICY IF EXISTS "Clients update tasks" ON public.task_rows;

DROP POLICY IF EXISTS "Members select tasks" ON public.task_rows;

DROP POLICY IF EXISTS "Non-clients manage tasks" ON public.task_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.task_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.task_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.task_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.task_rows;

DROP POLICY IF EXISTS "Allow owners to add members to their teams" ON public.team_members;

DROP POLICY IF EXISTS "Users can view their own team memberships" ON public.team_members;

DROP POLICY IF EXISTS "Allow owners to update their own team" ON public.teams;

DROP POLICY IF EXISTS "Allow users to create their own team" ON public.teams;

DROP POLICY IF EXISTS "Allow users to view teams they own or are members of" ON public.teams;

DROP POLICY IF EXISTS "Users can view teams they are members of" ON public.teams;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.tech_stack_rows;

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.test_case_rows;

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.test_case_rows;

DROP POLICY IF EXISTS "Allow manage if project accessible" ON public.test_case_rows;

DROP POLICY IF EXISTS "Allow select if project accessible" ON public.test_case_rows;

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.test_case_rows;

DROP POLICY IF EXISTS "sheet delete: pm and above" ON public.test_case_rows;

DROP POLICY IF EXISTS "sheet read: project members" ON public.test_case_rows;

DROP POLICY IF EXISTS "sheet update: pm and above" ON public.test_case_rows;

DROP POLICY IF EXISTS "sheet write: pm and above" ON public.test_case_rows;

CREATE POLICY "Allow delete for authenticated" ON public.api_list_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = api_list_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.api_list_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = api_list_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.api_list_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = api_list_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.api_list_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = api_list_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.api_list_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = api_list_rows.project_id))));

CREATE POLICY "sheet delete: pm and above" ON public.api_list_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.api_list_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.api_list_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.api_list_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "Allow delete for authenticated" ON public.backlog_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = backlog_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.backlog_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = backlog_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.backlog_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = backlog_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.backlog_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = backlog_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.backlog_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = backlog_rows.project_id))));

CREATE POLICY "sheet delete: pm and above" ON public.backlog_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.backlog_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.backlog_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.backlog_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "code_sequences: pm and above can write" ON public.code_sequences AS PERMISSIVE FOR ALL TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "code_sequences: project members can read" ON public.code_sequences AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "Allow CRUD for project members" ON public.function_list_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = function_list_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.function_list_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = function_list_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.function_list_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = function_list_rows.project_id))));

CREATE POLICY "Admin manages invitations" ON public.invitations AS PERMISSIVE FOR ALL TO public USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));

CREATE POLICY "Anyone can read pending invitations by token" ON public.invitations AS PERMISSIVE FOR SELECT TO anon, authenticated USING (((status = 'pending'::text) AND (expires_at > now())));

CREATE POLICY "Allow delete for authenticated" ON public.non_func_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = non_func_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.non_func_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = non_func_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.non_func_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = non_func_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.non_func_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = non_func_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.non_func_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = non_func_rows.project_id))));

CREATE POLICY "sheet delete: pm and above" ON public.non_func_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.non_func_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.non_func_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.non_func_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "Allow delete for authenticated" ON public.process_chart_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = process_chart_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.process_chart_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = process_chart_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.process_chart_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = process_chart_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.process_chart_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = process_chart_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.process_chart_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = process_chart_rows.project_id))));

CREATE POLICY "sheet delete: pm and above" ON public.process_chart_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.process_chart_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.process_chart_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.process_chart_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));

CREATE POLICY "profiles: own row + admins see all" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (((id = auth.uid()) OR (current_user_role() = 'administrator'::user_role)));

CREATE POLICY "profiles: users update own row" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((id = auth.uid()));

CREATE POLICY profiles_insert_own ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));

CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));

CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY "Admin full access on project_members" ON public.project_members AS PERMISSIVE FOR ALL TO authenticated USING (((current_user_role() = 'administrator'::user_role) OR (profile_id = auth.uid()))) WITH CHECK ((current_user_role() = 'administrator'::user_role));

CREATE POLICY "Allow manage if project accessible" ON public.project_members AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = project_members.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.project_members AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = project_members.project_id))));

CREATE POLICY "project_members: admin and PM can manage" ON public.project_members AS PERMISSIVE FOR ALL TO public USING (((current_user_role() = 'administrator'::user_role) OR (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_members.project_id) AND (projects.pm_id = auth.uid()))))));

CREATE POLICY "project_members: visible to project members" ON public.project_members AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY project_sheet_column_layouts_modify_authenticated ON public.project_sheet_column_layouts AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_sheet_column_layouts.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = ( SELECT auth.uid() AS uid))) OR ((p.workspace_type = 'team'::workspace_type) AND (p.team_id IS NOT NULL) AND ((EXISTS ( SELECT 1
           FROM profiles pr
          WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND ((pr.role)::text = 'admin'::text)))) OR (EXISTS ( SELECT 1
           FROM teams t
          WHERE ((t.id = p.team_id) AND (t.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = ( SELECT auth.uid() AS uid)) AND (tm.role = 'admin'::team_roles)))) OR (p.pm_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM project_members pm
          WHERE ((pm.project_id = p.id) AND (pm.profile_id = ( SELECT auth.uid() AS uid)) AND (pm.workspace_role = 'pm'::workspace_roles))))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_sheet_column_layouts.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = ( SELECT auth.uid() AS uid))) OR ((p.workspace_type = 'team'::workspace_type) AND (p.team_id IS NOT NULL) AND ((EXISTS ( SELECT 1
           FROM profiles pr
          WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND ((pr.role)::text = 'admin'::text)))) OR (EXISTS ( SELECT 1
           FROM teams t
          WHERE ((t.id = p.team_id) AND (t.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = ( SELECT auth.uid() AS uid)) AND (tm.role = 'admin'::team_roles)))) OR (p.pm_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM project_members pm
          WHERE ((pm.project_id = p.id) AND (pm.profile_id = ( SELECT auth.uid() AS uid)) AND (pm.workspace_role = 'pm'::workspace_roles)))))))))));

CREATE POLICY project_sheet_column_layouts_select_authenticated ON public.project_sheet_column_layouts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_sheet_column_layouts.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = ( SELECT auth.uid() AS uid))) OR ((p.workspace_type = 'team'::workspace_type) AND (p.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = ( SELECT auth.uid() AS uid)))))))))));

CREATE POLICY "Admin full access on projects" ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));

CREATE POLICY "Allow delete for owners" ON public.projects AS PERMISSIVE FOR DELETE TO authenticated USING ((owner_id = auth.uid()));

CREATE POLICY "Allow insert for authenticated users" ON public.projects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Allow select for owners or team" ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR (workspace_type = 'team'::workspace_type)));

CREATE POLICY "Allow update for owners" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_id = auth.uid()) OR (workspace_type = 'team'::workspace_type))) WITH CHECK (((owner_id = auth.uid()) OR (workspace_type = 'team'::workspace_type)));

CREATE POLICY "Allow update for owners or team" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated USING ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR (workspace_type = 'team'::workspace_type)));

CREATE POLICY "Members can view assigned projects" ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING (((pm_id = auth.uid()) OR (client_id = auth.uid()) OR user_can_access_project(id) OR (current_user_role() = 'administrator'::user_role)));

CREATE POLICY "PM can manage own projects" ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING (((current_user_role() = 'pm'::user_role) AND (pm_id = auth.uid()))) WITH CHECK (((current_user_role() = 'pm'::user_role) AND (pm_id = auth.uid())));

CREATE POLICY "Personal projects isolation" ON public.projects AS PERMISSIVE FOR SELECT TO public USING (((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid()) AND (team_id IS NULL)));

CREATE POLICY "Strict INSERT Project Isolation" ON public.projects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR ((workspace_type = 'team'::workspace_type) AND (team_id IN ( SELECT team_members.team_id
   FROM team_members
  WHERE ((team_members.profile_id = auth.uid()) AND ((team_members.role = 'admin'::team_roles) OR (team_members.role = 'pm'::team_roles))))))));

CREATE POLICY "Strict SELECT Project Isolation" ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR ((workspace_type = 'team'::workspace_type) AND (team_id IN ( SELECT team_members.team_id
   FROM team_members
  WHERE (team_members.profile_id = auth.uid()))))));

CREATE POLICY "Strict UPDATE/DELETE Isolation" ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR ((workspace_type = 'team'::workspace_type) AND (team_id IN ( SELECT team_members.team_id
   FROM team_members
  WHERE (team_members.profile_id = auth.uid()))))));

CREATE POLICY "Team projects isolation" ON public.projects AS PERMISSIVE FOR SELECT TO public USING (((workspace_type = 'team'::workspace_type) AND (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = projects.team_id) AND (team_members.profile_id = auth.uid()))))));

CREATE POLICY insert_projects ON public.projects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR ((workspace_type = 'team'::workspace_type) AND (is_admin() OR (team_id = get_my_team_id())))));

CREATE POLICY manage_projects ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() OR ((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid()))));

CREATE POLICY "projects: admin and PM can insert" ON public.projects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role])));

CREATE POLICY "projects: admin and PM can update" ON public.projects AS PERMISSIVE FOR UPDATE TO public USING (((current_user_role() = 'administrator'::user_role) OR (pm_id = auth.uid())));

CREATE POLICY "projects: admin only delete" ON public.projects AS PERMISSIVE FOR DELETE TO public USING ((current_user_role() = 'administrator'::user_role));

CREATE POLICY "projects: visible to assigned users" ON public.projects AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(id));

CREATE POLICY select_projects ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin() OR ((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR is_project_member(id)));

CREATE POLICY purpose_rows_delete ON public.purpose_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = purpose_rows.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = auth.uid())) OR ((p.workspace_type = 'team'::workspace_type) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = auth.uid()))))))))));

CREATE POLICY purpose_rows_insert ON public.purpose_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = purpose_rows.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = auth.uid())) OR ((p.workspace_type = 'team'::workspace_type) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = auth.uid()))))))))));

CREATE POLICY purpose_rows_select ON public.purpose_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = purpose_rows.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = auth.uid())) OR ((p.workspace_type = 'team'::workspace_type) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = auth.uid()))))))))));

CREATE POLICY purpose_rows_update ON public.purpose_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = purpose_rows.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = auth.uid())) OR ((p.workspace_type = 'team'::workspace_type) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = auth.uid())))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = purpose_rows.project_id) AND (((p.workspace_type = 'personal'::workspace_type) AND (p.owner_id = auth.uid())) OR ((p.workspace_type = 'team'::workspace_type) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = p.team_id) AND (tm.profile_id = auth.uid()))))))))));

CREATE POLICY "Allow delete for authenticated" ON public.screen_list_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = screen_list_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.screen_list_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = screen_list_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.screen_list_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = screen_list_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.screen_list_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = screen_list_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.screen_list_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = screen_list_rows.project_id))));

CREATE POLICY "sheet delete: pm and above" ON public.screen_list_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.screen_list_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.screen_list_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.screen_list_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "Admins full access tasks" ON public.task_rows AS PERMISSIVE FOR ALL TO authenticated USING (is_admin());

CREATE POLICY "Allow delete for authenticated" ON public.task_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = task_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.task_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = task_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.task_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = task_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.task_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = task_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.task_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = task_rows.project_id))));

CREATE POLICY "Clients update tasks" ON public.task_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM project_members
  WHERE ((project_members.project_id = task_rows.project_id) AND (project_members.profile_id = auth.uid()) AND (project_members.workspace_role = 'client'::workspace_roles)))));

CREATE POLICY "Members select tasks" ON public.task_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM project_members
  WHERE ((project_members.project_id = task_rows.project_id) AND (project_members.profile_id = auth.uid())))));

CREATE POLICY "Non-clients manage tasks" ON public.task_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM project_members
  WHERE ((project_members.project_id = task_rows.project_id) AND (project_members.profile_id = auth.uid()) AND (project_members.workspace_role <> 'client'::workspace_roles)))));

CREATE POLICY "sheet delete: pm and above" ON public.task_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.task_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.task_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.task_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "Allow owners to add members to their teams" ON public.team_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM teams
  WHERE ((teams.id = team_members.team_id) AND (teams.owner_id = auth.uid())))));

CREATE POLICY "Users can view their own team memberships" ON public.team_members AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = profile_id));

CREATE POLICY "Allow owners to update their own team" ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));

CREATE POLICY "Allow users to create their own team" ON public.teams AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));

CREATE POLICY "Allow users to view teams they own or are members of" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = teams.id) AND (team_members.profile_id = auth.uid()))))));

CREATE POLICY "Users can view teams they are members of" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = teams.id) AND (team_members.profile_id = auth.uid())))));

CREATE POLICY "Allow delete for authenticated" ON public.tech_stack_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = tech_stack_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.tech_stack_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = tech_stack_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.tech_stack_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = tech_stack_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.tech_stack_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = tech_stack_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.tech_stack_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = tech_stack_rows.project_id))));

CREATE POLICY "sheet delete: pm and above" ON public.tech_stack_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.tech_stack_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.tech_stack_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.tech_stack_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));

CREATE POLICY "Allow delete for authenticated" ON public.test_case_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = test_case_rows.project_id))));

CREATE POLICY "Allow insert for authenticated" ON public.test_case_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = test_case_rows.project_id))));

CREATE POLICY "Allow manage if project accessible" ON public.test_case_rows AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = test_case_rows.project_id))));

CREATE POLICY "Allow select if project accessible" ON public.test_case_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = test_case_rows.project_id))));

CREATE POLICY "Allow update for authenticated" ON public.test_case_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = test_case_rows.project_id))));

CREATE POLICY "sheet delete: pm and above" ON public.test_case_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));

CREATE POLICY "sheet read: project members" ON public.test_case_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));

CREATE POLICY "sheet update: pm and above" ON public.test_case_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));

CREATE POLICY "sheet write: pm and above" ON public.test_case_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
