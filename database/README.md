# CyberConnect database (clone a Supabase project)

Use **two files** only. Run in the Supabase SQL Editor with role **postgres** (not `authenticated`).

| Order | File | Contents |
|------:|------|----------|
| 1 | [`cyberconnect_schema.sql`](./cyberconnect_schema.sql) | Extensions, enums, tables, indexes, RBAC sheet triggers, RPCs (`get_team_member_profiles`, `set_team_member_role`, …). **No RLS.** |
| 2 | [`cyberconnect_rls.sql`](./cyberconnect_rls.sql) | Sign-up profile trigger, RLS helper functions, production RLS policies (127 policies). |

## New project checklist

1. Create Supabase project (Auth enabled).
2. **Authentication → Providers → Email**: turn **Confirm email** off if you want instant login on staging/dev.
3. Paste and run **`cyberconnect_schema.sql`** (entire file, top to bottom).
4. Paste and run **`cyberconnect_rls.sql`** (entire file).
5. In the app, set `NEXT_PUBLIC_SUPABASE_URL` and anon key to this project; sign out/in after RLS changes.

## Re-applying RLS on an existing DB

Policies are idempotent (`DROP POLICY IF EXISTS` then `CREATE`). You can re-run **`cyberconnect_rls.sql`** alone after schema exists. If you have conflicting custom policies, drop all public policies first:

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
```

Then run **`cyberconnect_rls.sql`**.

## Older / incremental files

Previous per-table SQL, staging hotfixes, and export snippets live under [`archive/`](./archive/) for history only. Do not use them for a fresh clone.

## Production enum note

RLS policies from production may reference `user_role` labels like `administrator` and `developer`. The schema bundle defines `('admin', 'pm', 'dev', 'client')`. If policy creation fails on enum cast, align `public.user_role` with production (or re-export policies after enums match).
