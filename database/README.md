# CyberConnect database SQL

## Copy-paste bundles (new Supabase project)

| File | Purpose |
|------|---------|
| **`cyberconnect_full_schema_paste.sql`** | Tables, enums, sheet RBAC triggers, team RPCs. **No RLS.** Run first as `postgres`. (Single `.sql` file; no `.txt` duplicate.) |
| **`cyberconnect_rls_policies_paste.sql`** | RLS helper functions, prod policies, signup profile trigger. Run second as `postgres`. |

Dashboard: turn off **Confirm email** (Auth → Email) on staging if you match production.

## Per-table source files (edit here, then refresh paste bundles when needed)

**Core**

- `profiles.sql`, `teams.sql`, `team_members.sql`, `projects.sql`, `project_members.sql`
- `invitations.sql`, `code_sequences.sql`, `project_sheet_column_layouts.sql`

**Sheet row tables**

- `purpose_rows.sql`, `tech_stack_rows.sql`, `non_func_rows.sql`, `screen_list_rows.sql`
- `function_list_rows.sql`, `task_rows.sql`, `test_case_rows.sql`, `api_list_rows.sql`
- `backlog_rows.sql`, `process_chart_rows.sql`, `app_list_rows.sql`

**Enums / column patches**

- `task_status_add_in_review.sql`, `screen_status_add_in_review.sql`, `function_status_add_in_review.sql`
- `phase_type_add_actual_performance.sql`

**Logic (not a single table)**

- `rbac_sheet_triggers.sql` — sheet row RBAC trigger functions
- `get_team_member_profiles.sql` — team roster RPC
- `migrate_set_team_member_role.sql` — billing-owner changes company admin role

The full schema paste also embeds bootstrap SQL, `01_teams_owner_fk`, and migrations for bilingual columns / sheet layout table (see `FILE:` markers inside the paste file).

## Re-exporting RLS from production later

If production policies change, re-export from prod and replace the body of `cyberconnect_rls_policies_paste.sql` (helpers + `DROP`/`CREATE POLICY` statements). Keep the signup trigger block at the top unless prod adds its own.
