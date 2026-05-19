-- =============================================================================
-- PRODUCTION ONLY — Export helper functions used by prod RLS policies
-- =============================================================================
-- Run on **cyberconnect_platform (PROD)** as **postgres**.
-- Copy every row from column "function_ddl" -> paste into STAGING first (before policies).
--
-- Policies reference: user_can_access_project, current_user_role, is_admin,
-- get_my_team_id, is_project_member (and possibly more).
-- =============================================================================

SELECT pg_get_functiondef(p.oid) AS function_ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'user_can_access_project',
    'current_user_role',
    'is_admin',
    'get_my_team_id',
    'is_project_member'
  )
ORDER BY p.proname;

-- If fewer than 5 rows, list ALL public functions (pick the ones policies need):
-- SELECT p.proname, pg_get_functiondef(p.oid) AS function_ddl
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prokind = 'f'
-- ORDER BY p.proname;
