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
