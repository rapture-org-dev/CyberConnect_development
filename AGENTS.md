# AGENTS.md

## Cursor Cloud specific instructions

CyberConnect is a **Next.js 16 (App Router) + Supabase** app. There is no separate
backend service — the Next.js app (route handlers in `src/app/api` and server modules
in `src/server`) talks directly to Supabase (Postgres + Auth + RLS). Running it locally
end-to-end therefore requires a **local Supabase stack** in addition to the Next.js dev
server.

### Services

| Service | Command | Notes |
|---------|---------|-------|
| Local Supabase (Postgres/Auth/REST) | `npx supabase start` | Runs in Docker. API on `:54321`, DB on `:54322`, Studio on `:54323`. |
| Next.js dev server | `npm run dev` | http://localhost:3000. Reads `.env.local`. |

The update script only refreshes npm deps (`npm install`). Everything below (Docker
daemon, Supabase stack, DB setup) is **session startup** that must be done by hand /
via the helper script; it is intentionally NOT in the update script.

### Bringing the environment up from a fresh VM

1. **Docker** is required for Supabase. It is pre-installed in the Cursor Cloud VM but
   there is no systemd, so the daemon does not auto-start: start it manually in the
   background (e.g. `sudo dockerd > /tmp/dockerd.log 2>&1` in a tmux session) and make
   the socket usable (`sudo chmod 666 /var/run/docker.sock`). The local Supabase
   containers persist in the VM snapshot and restart automatically once `dockerd` is up.
2. Run the idempotent DB bring-up helper: `./scripts/setup-local-supabase.sh`.
   It starts Supabase (if needed), applies `database/cyberconnect_schema.sql`, aligns
   enum labels, grants Data API privileges, applies `database/cyberconnect_rls.sql`, and
   writes `.env.local` pointing at the local stack.
3. `npm run dev`, then open http://localhost:3000.

### Non-obvious gotchas (discovered during setup)

- **`npm run lint` is broken** on this repo: Next 16 removed the `next lint` subcommand
  and there is no ESLint config/dependency. For a static check use `npx tsc --noEmit`
  (passes clean).
- **The bundled schema is a one-shot fresh-install script** — several `CREATE TABLE`
  statements lack `IF NOT EXISTS`, so re-running it on a populated DB errors out. The
  helper script guards this by only applying schema when `public.profiles` is absent.
- **Enum mismatch (documented in `database/README.md`):** the production RLS export
  references enum labels that the bundled schema omits — `user_role` needs
  `administrator` and `developer`, and `team_roles` needs `pm`. The helper adds these
  with `ADD VALUE IF NOT EXISTS` before applying RLS.
- **Newer Supabase CLI does not auto-expose `public` tables to the Data API roles**
  (`anon`/`authenticated`). Without explicit `GRANT`s you get
  `permission denied for table profiles` on signup/login. The helper grants the standard
  Supabase privileges (RLS still enforces row-level security) and runs
  `NOTIFY pgrst, 'reload schema'`.
- **Auth requires a Supabase connection at all times:** `src/middleware.ts` calls
  `auth.getUser()` on nearly every route, and the Supabase clients use non-null env vars
  with no fallback, so the app 500s if `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing or the stack is down.
- **Email confirmation** is disabled in `supabase/config.toml` (`[auth.email]
  enable_confirmations = false`), so accounts created via the in-app signup can log in
  immediately.
- DeepL auto-translate is optional and disabled via `DEEPL_AUTO_TRANSLATE=false` in
  `.env.local`; it is not needed for local development.
