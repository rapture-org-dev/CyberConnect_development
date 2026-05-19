-- =============================================================================
-- Copy RLS from PRODUCTION Supabase -> paste into STAGING Supabase
-- =============================================================================
-- STEP 1 — Run sections A + B on your **PRODUCTION** project (Role: postgres).
-- STEP 2 — Copy the **Results** text from section B into STAGING SQL Editor.
-- STEP 3 — Run on **STAGING** (Role: postgres). Fix any errors (missing functions, etc.).
--
-- Note: Policies reference functions (e.g. auth.uid()). Prod and staging must have
-- the same schema/RPCs, or staging will error until you create missing functions.
-- =============================================================================

-- ########## A) List tables with RLS on/off (PROD) ##########

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
ORDER BY c.relname;

-- ########## B) Generate script: ENABLE RLS + DROP/CREATE policies (PROD) ##########
-- Run this query; copy the single column "ddl" from Results (all rows) -> staging.

SELECT ddl
FROM (
  SELECT
    1 AS ord,
    0 AS sub,
    format(
      E'-- ===== RLS export from prod: %s =====\n',
      to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS UTC')
    ) AS ddl

  UNION ALL

  SELECT
    2 AS ord,
    row_number() OVER (ORDER BY c.relname)::int AS sub,
    format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', 'public', c.relname) AS ddl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
    AND c.relname NOT LIKE 'pg_%'

  UNION ALL

  SELECT
    3 AS ord,
    row_number() OVER (ORDER BY p.tablename, p.policyname)::int AS sub,
    format(
      'DROP POLICY IF EXISTS %I ON %I.%I;',
      p.policyname,
      p.schemaname,
      p.tablename
    ) AS ddl
  FROM pg_policies p
  WHERE p.schemaname = 'public'

  UNION ALL

  SELECT
    4 AS ord,
    row_number() OVER (ORDER BY p.tablename, p.policyname)::int AS sub,
    (
      'CREATE POLICY ' || quote_ident(p.policyname) || ' ON ' ||
      quote_ident(p.schemaname) || '.' || quote_ident(p.tablename) ||
      CASE
        WHEN upper(coalesce(p.permissive::text, 'PERMISSIVE')) IN (
          'T', 'TRUE', 'PERMISSIVE', 'YES'
        )
        THEN ' AS PERMISSIVE'
        ELSE ' AS RESTRICTIVE'
      END ||
      ' FOR ' || p.cmd ||
      ' TO ' || array_to_string(
        ARRAY(SELECT quote_ident(r) FROM unnest(p.roles) AS r),
        ', '
      ) ||
      CASE WHEN p.qual IS NOT NULL THEN ' USING (' || p.qual || ')' ELSE '' END ||
      CASE WHEN p.with_check IS NOT NULL THEN ' WITH CHECK (' || p.with_check || ')' ELSE '' END ||
      ';'
    ) AS ddl
  FROM pg_policies p
  WHERE p.schemaname = 'public'
) x
ORDER BY ord, sub;

-- ########## C) Optional: human-readable list (PROD) ##########

SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
