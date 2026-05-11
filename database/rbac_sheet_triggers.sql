-- =============================================================================
-- Sheet RBAC: project role (pm / dev / client) enforced on row tables
--
-- Schema refs (repo database/*.sql):
--   projects.sql          -> public.projects
--   team_members.sql      -> public.team_members (team_roles)
--   project_members.sql   -> public.project_members (workspace_roles)
--   *_rows.sql            -> sheet tables (purpose_rows, task_rows, …)
--
-- Parser note (Supabase / PL/pgSQL):
--   Avoid multi-column "SELECT … INTO var1, var2, …" — it can mis-parse INTO targets
--   as relation names ("v_owner_id does not exist"). Prefer scalar assigns:
--   var := (SELECT single_col FROM …);
--
-- Run the entire file top-to-bottom in one batch so functions exist before CREATE TRIGGER.
-- =============================================================================

-- Resolve the effective sheet role for the current user on a project.
-- Priority: personal owner -> profiles.role admin -> team.owner -> team admin member ->
-- projects.pm_id -> project_members.workspace_role -> client_id -> default client.
-- Keep ordering aligned with src/lib/team-project-auth.ts resolveTeamProjectPrivilege.
CREATE OR REPLACE FUNCTION public.resolve_project_sheet_role (p_project_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $func$
DECLARE
  uid uuid := auth.uid();
  wr text;
  v_owner_id uuid;
  v_team_id uuid;
  v_pm_id uuid;
  v_client_id uuid;
  v_workspace_type text;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT
      1
    FROM
      public.projects AS pr
    WHERE
      pr.id = p_project_id) THEN
    RETURN NULL;
  END IF;

  -- One column per assign: no multi-target SELECT INTO (avoids "relation v_* does not exist").
  v_owner_id := (
    SELECT
      pr.owner_id
    FROM
      public.projects AS pr
    WHERE
      pr.id = p_project_id);

  v_team_id := (
    SELECT
      pr.team_id
    FROM
      public.projects AS pr
    WHERE
      pr.id = p_project_id);

  v_pm_id := (
    SELECT
      pr.pm_id
    FROM
      public.projects AS pr
    WHERE
      pr.id = p_project_id);

  v_client_id := (
    SELECT
      pr.client_id
    FROM
      public.projects AS pr
    WHERE
      pr.id = p_project_id);

  v_workspace_type := (
    SELECT
      CAST(pr.workspace_type AS text)
    FROM
      public.projects AS pr
    WHERE
      pr.id = p_project_id);

  -- Personal workspace: only the owner may write; treat as PM for sheet policy.
  IF v_workspace_type = 'personal' AND v_owner_id = uid THEN
    RETURN 'pm';
  END IF;

  -- Platform profile admin (matches app: full sheet access before project_members.dev).
  -- Compare as text: production DBs may use enum user_role without an 'admin' label — comparing
  -- to 'admin'::user_role raises invalid input; ::text matches migrate_project_sheet_column_layouts_rls.sql.
  IF EXISTS (
    SELECT
      1
    FROM
      public.profiles p
    WHERE
      p.id = uid
      AND p.role::text = 'admin') THEN
    RETURN 'pm';
  END IF;

  -- Team billing owner (matches app resolveTeamProjectPrivilege).
  IF v_team_id IS NOT NULL AND EXISTS (
    SELECT
      1
    FROM
      public.teams t
    WHERE
      t.id = v_team_id
      AND t.owner_id = uid) THEN
    RETURN 'pm';
  END IF;

  -- Team company admin: full PM-level access to all team projects
  IF v_team_id IS NOT NULL AND EXISTS (
    SELECT
      1
    FROM
      public.team_members tm
    WHERE
      tm.team_id = v_team_id
      AND tm.profile_id = uid
      AND tm.role = 'admin') THEN
    RETURN 'pm';
  END IF;

  IF v_pm_id = uid THEN
    RETURN 'pm';
  END IF;

  wr := (
    SELECT
      CAST(pm.workspace_role AS text)
    FROM
      public.project_members pm
    WHERE
      pm.project_id = p_project_id
      AND pm.profile_id = uid);

  IF wr IS NOT NULL THEN
    RETURN wr;
  END IF;

  IF v_client_id = uid THEN
    RETURN 'client';
  END IF;

  -- Restrictive default if the user reached the row via RLS but has no mapping
  RETURN 'client';
END;

$func$;

-- -----------------------------------------------------------------------------
-- Strip JSON keys then compare OLD vs NEW (client may change remark columns;
-- on screen/function sheets also `status` — matches product rule for assignees).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sheet_client_json_strip_for_compare (p_table_name text, p_payload jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  AS $func$
DECLARE
  strip text[];
  sk text;
  result jsonb := p_payload;
BEGIN
  strip := CASE p_table_name
  WHEN 'purpose_rows' THEN
    ARRAY['updated_at'::text]
  WHEN 'tech_stack_rows' THEN
    ARRAY['updated_at'::text]
  WHEN 'non_func_rows' THEN
    ARRAY['updated_at'::text]
  WHEN 'screen_list_rows' THEN
    ARRAY['remarks', 'remarks_ja', 'status', 'updated_at']
  WHEN 'function_list_rows' THEN
    ARRAY['remarks', 'remarks_ja', 'status', 'updated_at']
  WHEN 'test_case_rows' THEN
    ARRAY['remarks', 'remarks_ja', 'updated_at']
  WHEN 'api_list_rows' THEN
    ARRAY['remarks', 'remarks_ja', 'updated_at']
  WHEN 'backlog_rows' THEN
    ARRAY['updated_at'::text]
  WHEN 'process_chart_rows' THEN
    ARRAY['updated_at'::text]
  ELSE
    ARRAY['updated_at'::text]
  END;

  FOREACH sk IN ARRAY strip LOOP
    result := result - sk;
  END LOOP;

  RETURN result;
END;

$func$;

CREATE OR REPLACE FUNCTION public.enforce_general_sheet_row_rbac ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $func$
DECLARE
  r text;
  v_project_id uuid;
  jold jsonb;
  jnew jsonb;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  r := public.resolve_project_sheet_role (v_project_id);

  IF r IS NULL THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  IF r = 'pm' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    IF r IN ('dev', 'member') THEN
      RAISE EXCEPTION 'Access Denied: Developers have view-only access to this sheet.';
    END IF;

    IF r = 'client' THEN
      RAISE EXCEPTION 'Access Denied';
    END IF;

    RAISE EXCEPTION 'Access Denied';
  END IF;

  -- UPDATE
  IF r IN ('dev', 'member') THEN
    -- Developers may update only `status` on screen/function sheets (same workflow as tasks).
    IF TG_TABLE_NAME IN ('screen_list_rows', 'function_list_rows') THEN
      jold := to_jsonb (OLD) - 'status' - 'updated_at';
      jnew := to_jsonb (NEW) - 'status' - 'updated_at';
      IF jold IS NOT DISTINCT FROM jnew THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Access Denied: Developers have view-only access to this sheet.';
  END IF;

  IF r = 'client' THEN
    jold := public.sheet_client_json_strip_for_compare (TG_TABLE_NAME::text, to_jsonb (OLD));
    jnew := public.sheet_client_json_strip_for_compare (TG_TABLE_NAME::text, to_jsonb (NEW));

    IF jold IS DISTINCT FROM jnew THEN
      RAISE EXCEPTION 'Access Denied: Clients can only update remarks.';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Access Denied';
END;

$func$;

CREATE OR REPLACE FUNCTION public.enforce_task_row_rbac ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $func$
DECLARE
  r text;
  v_project_id uuid;
  jold jsonb;
  jnew jsonb;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  r := public.resolve_project_sheet_role (v_project_id);

  IF r IS NULL THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  IF r = 'pm' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF r IN ('dev', 'member') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF r = 'client' THEN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
      RAISE EXCEPTION 'Access Denied';
    END IF;

    jold := to_jsonb (OLD) - 'remark' - 'remark_ja' - 'updated_at';
    jnew := to_jsonb (NEW) - 'remark' - 'remark_ja' - 'updated_at';

    IF jold IS DISTINCT FROM jnew THEN
      RAISE EXCEPTION 'Access Denied: Clients can only update remarks.';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Access Denied';
END;

$func$;

-- Drop existing triggers if re-running
DROP TRIGGER IF EXISTS trg_rbac_general_purpose_rows ON public.purpose_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_tech_stack_rows ON public.tech_stack_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_non_func_rows ON public.non_func_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_screen_list_rows ON public.screen_list_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_function_list_rows ON public.function_list_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_test_case_rows ON public.test_case_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_backlog_rows ON public.backlog_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_process_chart_rows ON public.process_chart_rows;

DROP TRIGGER IF EXISTS trg_rbac_general_api_list_rows ON public.api_list_rows;

DROP TRIGGER IF EXISTS trg_rbac_task_rows ON public.task_rows;

CREATE TRIGGER trg_rbac_general_purpose_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.purpose_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_tech_stack_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.tech_stack_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_non_func_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.non_func_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_screen_list_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.screen_list_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_function_list_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.function_list_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_test_case_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.test_case_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_backlog_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.backlog_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_process_chart_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.process_chart_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_general_api_list_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.api_list_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_general_sheet_row_rbac ();

CREATE TRIGGER trg_rbac_task_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.task_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_row_rbac ();
