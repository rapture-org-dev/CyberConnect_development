-- ================================================================================
-- CyberConnect - RLS POLICIES (production export) + signup profile trigger
-- Supabase SQL Editor · Role = postgres · run AFTER cyberconnect_full_schema_paste.sql
-- ================================================================================

-- ########## Auth: auto-create profile on signup ##########

-- Auto-create public.profiles when a new auth.users row is inserted (sign-up).
-- Runs as SECURITY DEFINER so it works even when the browser has no session yet
-- (e.g. email confirmation off/on, or client upsert blocked by RLS timing).
-- Run once per Supabase project (staging + prod). Safe to re-run.
--
-- IMPORTANT (Supabase SQL Editor):
-- Bottom-right "Role" must be **postgres** -- NOT "authenticated" as your email.
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

-- ########## RLS helper functions (production) ##########

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

CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND profile_id = auth.uid()
  );
$function$;

-- ########## RLS policies (production export) ##########
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
CREATE POLICY "sheet delete: pm and above" ON public.api_list_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));
CREATE POLICY "sheet read: project members" ON public.api_list_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "sheet update: pm and above" ON public.api_list_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));
CREATE POLICY "sheet write: pm and above" ON public.api_list_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
CREATE POLICY "sheet delete: pm and above" ON public.backlog_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));
CREATE POLICY "sheet read: project members" ON public.backlog_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "sheet update: pm and above" ON public.backlog_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));
CREATE POLICY "sheet write: pm and above" ON public.backlog_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
CREATE POLICY "code_sequences: pm and above can write" ON public.code_sequences AS PERMISSIVE FOR ALL TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
CREATE POLICY "code_sequences: project members can read" ON public.code_sequences AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "Admin manages invitations" ON public.invitations AS PERMISSIVE FOR ALL TO public USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "Anyone can read pending invitations by token" ON public.invitations AS PERMISSIVE FOR SELECT TO anon, authenticated USING (((status = 'pending'::text) AND (expires_at > now())));
CREATE POLICY "sheet delete: pm and above" ON public.non_func_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));
CREATE POLICY "sheet read: project members" ON public.non_func_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "sheet update: pm and above" ON public.non_func_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));
CREATE POLICY "sheet write: pm and above" ON public.non_func_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
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
CREATE POLICY "project_members: visible to project members" ON public.project_members AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "Admin full access on projects" ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "Allow delete for owners" ON public.projects AS PERMISSIVE FOR DELETE TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY "Allow insert for authenticated users" ON public.projects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Allow select for owners or team" ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR (workspace_type = 'team'::workspace_type)));
CREATE POLICY "Allow update for owners" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_id = auth.uid()) OR (workspace_type = 'team'::workspace_type))) WITH CHECK (((owner_id = auth.uid()) OR (workspace_type = 'team'::workspace_type)));
CREATE POLICY "Allow update for owners or team" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated USING ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR (workspace_type = 'team'::workspace_type)));
CREATE POLICY "Members can view assigned projects" ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING (((pm_id = auth.uid()) OR (client_id = auth.uid()) OR user_can_access_project(id) OR (current_user_role() = 'administrator'::user_role)));
CREATE POLICY "PM can manage own projects" ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING (((current_user_role() = 'pm'::user_role) AND (pm_id = auth.uid()))) WITH CHECK (((current_user_role() = 'pm'::user_role) AND (pm_id = auth.uid())));
CREATE POLICY "Personal projects isolation" ON public.projects AS PERMISSIVE FOR SELECT TO public USING (((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid()) AND (team_id IS NULL)));
CREATE POLICY insert_projects ON public.projects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR ((workspace_type = 'team'::workspace_type) AND (is_admin() OR (team_id = get_my_team_id())))));
CREATE POLICY manage_projects ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() OR ((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid()))));
CREATE POLICY "projects: admin and PM can insert" ON public.projects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role])));
CREATE POLICY "projects: admin and PM can update" ON public.projects AS PERMISSIVE FOR UPDATE TO public USING (((current_user_role() = 'administrator'::user_role) OR (pm_id = auth.uid())));
CREATE POLICY "projects: admin only delete" ON public.projects AS PERMISSIVE FOR DELETE TO public USING ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "projects: visible to assigned users" ON public.projects AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(id));
CREATE POLICY select_projects ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin() OR ((workspace_type = 'personal'::workspace_type) AND (owner_id = auth.uid())) OR is_project_member(id)));
CREATE POLICY "sheet delete: pm and above" ON public.screen_list_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));
CREATE POLICY "sheet read: project members" ON public.screen_list_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "sheet update: pm and above" ON public.screen_list_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));
CREATE POLICY "sheet write: pm and above" ON public.screen_list_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
CREATE POLICY "Admins full access tasks" ON public.task_rows AS PERMISSIVE FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "sheet delete: pm and above" ON public.task_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));
CREATE POLICY "sheet read: project members" ON public.task_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "sheet update: pm and above" ON public.task_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));
CREATE POLICY "sheet write: pm and above" ON public.task_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
CREATE POLICY "Users can view their own team memberships" ON public.team_members AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = profile_id));
CREATE POLICY "Allow owners to update their own team" ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "Allow users to create their own team" ON public.teams AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "sheet delete: pm and above" ON public.tech_stack_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));
CREATE POLICY "sheet read: project members" ON public.tech_stack_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "sheet update: pm and above" ON public.tech_stack_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));
CREATE POLICY "sheet write: pm and above" ON public.tech_stack_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
CREATE POLICY "sheet delete: pm and above" ON public.test_case_rows AS PERMISSIVE FOR DELETE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role]))));
CREATE POLICY "sheet read: project members" ON public.test_case_rows AS PERMISSIVE FOR SELECT TO public USING (user_can_access_project(project_id));
CREATE POLICY "sheet update: pm and above" ON public.test_case_rows AS PERMISSIVE FOR UPDATE TO public USING ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role, 'client'::user_role]))));
CREATE POLICY "sheet write: pm and above" ON public.test_case_rows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_can_access_project(project_id) AND (current_user_role() = ANY (ARRAY['administrator'::user_role, 'pm'::user_role, 'developer'::user_role]))));
