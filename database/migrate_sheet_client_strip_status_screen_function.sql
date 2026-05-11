-- Allow client-role sheet users to change `status` on Screens / Functions (RBAC compare strips status).
-- Run in Supabase SQL Editor after pulling app changes that let assignees edit status.

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
