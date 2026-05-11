-- Allow developers (project dev role) to UPDATE only `status` on screen_list_rows / function_list_rows.
-- Triggers already reference public.enforce_general_sheet_row_rbac — replacing the function is enough.
-- Run after deploying app changes that let devs edit status in the UI.

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
