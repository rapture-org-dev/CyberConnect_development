-- Align DB sheet role with src/lib/team-project-auth.ts resolveTeamProjectPrivilege.
--
-- Without this, users with profiles.role = 'admin' or teams.owner_id = uid can still be
-- assigned workspace_role = 'dev' in project_members. The app treats them as PM-level,
-- but enforce_general_sheet_row_rbac used resolve_project_sheet_role → 'dev' → full-row upserts failed.
--
-- Run once in Supabase SQL Editor after pulling app changes.

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

  IF v_workspace_type = 'personal' AND v_owner_id = uid THEN
    RETURN 'pm';
  END IF;

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

  RETURN 'client';
END;

$func$;
