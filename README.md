# CyberConnect

**CyberConnect** is a multi-tenant project workspace for software delivery teams. It centralizes requirements, screens, functions, tasks, tests, APIs, and schedules in bilingual (English / Japanese) spreadsheet-style views, with role-based access tied to teams and projects.

The npm package name is `nextjscyberconnect`; the product name used in the UI and database is **CyberConnect**.

---

## Tech stack

| Layer | Technology |
|--------|------------|
| **Framework** | [Next.js](https://nextjs.org/) 16 (App Router) |
| **UI** | React 19, [Tailwind CSS](https://tailwindcss.com/) 3.4 |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Language** | TypeScript 5.8 |
| **Backend / DB** | [Supabase](https://supabase.com/) (PostgreSQL, Auth, Row Level Security) |
| **Auth integration** | `@supabase/ssr`, `@supabase/supabase-js` |
| **Import / export** | [SheetJS (`xlsx`)](https://sheetjs.com/), `encoding-japanese` (CSV encoding) |

Server logic lives in Next.js Route Handlers under `src/app/api/` and server modules under `src/server/`. The browser talks to Supabase for session refresh (middleware) and to the app API for business operations.

---

## What it does (core functions)

### Authentication and session

- Email-based login via Supabase Auth, plus an app session layer (`POST /api/auth/login`) that sets HTTP-only cookies (`cyberconnect_email`, workspace role, team slug, account kind).
- Middleware refreshes the Supabase session and enforces redirects: unauthenticated users go to `/login`; authenticated users without an app session stay on login until the flow completes.
- Workspace selection: **team** (company) or **personal** workspace; active team and role stored in cookies and updatable via `/api/auth/active-role`.

### Teams and membership

- **Teams** have a unique `slug`, name, billing **owner**, and auto-generated **invite code**.
- Users join teams with an invite code (`/api/teams/join`).
- **Team members** have roles `admin` or `member` (company-level, distinct from project roles).
- Team owners can manage members, regenerate invites, and purchase-plan hooks (API stubs as applicable).

### Projects

- **Team projects** belong to a team; **personal projects** belong to a user (`workspace_type`: `team` | `personal`).
- Project metadata: names (EN/JA), client, PM, dev assignees, client stakeholder, status, purpose, background, dev period, color, descriptions.
- **Project members** map users to workspace roles on a project: `pm`, `dev`, `client`, `member`.
- CRUD and member assignment via `/api/projects` and related routes.

### Project sheets (main product surface)

Each project exposes multiple **tabs**—config-driven in `src/lib/data.ts` and stored per tab in Postgres (`*_rows` tables). Users edit rows in a grid UI with add-row drawers, column layouts, and RBAC.

| Tab ID | Name (EN) | Purpose |
|--------|-----------|---------|
| `purpose` | Purpose | Goals and major items |
| `tech_stack` | Technical Stack | Stack documentation |
| `non_func` | Non-Functional | Non-functional requirements |
| `screen_list` | Screens | Screen inventory, paths, status, dev/client completion |
| `function_list` | Functions | Features linked to screens, phases, effort |
| `tasks` | Tasks | Sprint/epic tasks, assignees, deadlines, PM check |
| `test_case` | Test Cases | Scenarios, steps, expected results |
| `app_list` | API List | APIs, auth, realtime, MVP priority |
| `backlog` | Backlog | Epic/story backlog |
| `process_chart` | Process Chart | Process / engineering chart rows |
| `schedule` | Schedule Chart | Gantt-style schedule view (UI-only special tab) |

**Sheet capabilities**

- Inline editing with column types: text, long text, status, select, date, number, code, assignee.
- **Per-project column layouts** (custom columns) via `project_sheet_column_layouts` and APIs under `/api/projects/[id]/sheet-column-layouts`.
- **Registered codes** and auto-generated task/screen/function codes (`code_sequences`, next-task-code API).
- **Excel/CSV import** with column mapping, duplicate/conflict detection, and conflict resolution before finalize.
- **Batch** row updates and batch delete APIs.
- **Bilingual** fields (EN/JA) where defined; merged display rules for forms.
- **Schedule chart** visualization component (`ScheduleChartView`) driven from sheet data.

### Access control (how permissions work)

Two layers combine:

1. **URL / workspace cookies** — team routes use `/{team_slug}/admin/...` as the shared team workspace; legacy `pm` / `dev` / `client` URL segments redirect to admin routes. Personal routes live under `/personal/...`.
2. **Project sheet role** — resolved from project assignment (PM, dev, client), team admin/owner, or platform `profiles.role`; controls which columns are editable and whether PM can add rows. Clients can edit limited “remark” columns on some sheets.

Database **RLS** (127 policies) and **RBAC triggers** on sheet tables enforce access at the Postgres layer. See `database/README.md` and `database/cyberconnect_rls.sql`.

### Dashboards

Role-oriented dashboard views (via `DashboardDispatcher` and `WorkspaceProvider`):

- **Admin** — team-wide project rail, stats, project management.
- **PM / Dev / Client** — filtered project and task perspectives (where still used in routing).
- **Personal** — isolated workspace without team slug in the path.

Task stats aggregate from `task_rows` (totals, done, in progress, not started).

### Profiles and administration

- Profile CRUD, team memberships listing, upgrade-to-admin, team member listing for assignees.
- **Switch role** page for demo/multi-role accounts (`extra_roles` on profiles).
- Dashboard language toggle (EN/JA) for UI strings via `src/lib/data.ts` translation helpers.
- **Sheet bilingual auto-translate (DeepL):** On row create/update and CSV import finalize, text fields are language-detected; English is stored in EN columns and Japanese in `*_ja` columns, with DeepL filling the partner column. Import mapping shows one target per logical field (e.g. Remarks / 備考), not separate `remark` and `remark_ja`. Configure `DEEPL_AUTH_KEY` and `DEEPL_API_URL` in `.env.local` (see `.env.example`). The Schedule tab is UI-only (no row table).

---

## User roles (glossary)

| Role | Meaning |
|------|---------|
| `admin` | Platform or company administrator (full PM-level sheet access on team projects when applicable). |
| `pm` | Project manager on a project. |
| `dev` | Developer on a project. |
| `client` | Client stakeholder; limited sheet edits (remarks). |
| `personal` | Workspace mode — not a DB enum; routing for personal projects. |

Team-level: `team_members.role` is `admin` | `member`. Project-level: `project_members.workspace_role` is `pm` | `dev` | `client` | `member`.

---

## Repository layout

```
CyberConnect_development-main/
├── database/
│   ├── cyberconnect_schema.sql   # Tables, enums, triggers, RPCs (no RLS)
│   ├── cyberconnect_rls.sql      # RLS policies + signup trigger
│   ├── README.md                 # DB setup instructions
│   └── archive/                  # Historical migrations (not for fresh installs)
├── src/
│   ├── app/                      # Next.js pages and API routes
│   ├── components/               # UI (sheets, modals, dashboards, layout)
│   ├── lib/                      # Client data model, API client, import, Supabase
│   ├── server/                   # Server-side auth, projects, teams, rows
│   └── types/                    # Shared TypeScript types
├── supabase/sql/                 # Supplemental SQL snippets
└── package.json
```

---

## Database setup

For a **new** Supabase project:

1. Enable Auth (email provider; optional: disable email confirmation on dev/staging).
2. Run `database/cyberconnect_schema.sql` in the SQL editor as `postgres`.
3. Run `database/cyberconnect_rls.sql`.
4. Point the app at the project URL and anon key; sign out/in after RLS changes.

Details: [database/README.md](./database/README.md).

Main tables include: `teams`, `profiles`, `team_members`, `projects`, `project_members`, `invitations`, `code_sequences`, `project_sheet_column_layouts`, and one `*_rows` table per sheet tab (e.g. `task_rows`, `screen_list_rows`).

---

## Environment variables

Create `.env.local` in the project root:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (public) key |

The app uses the anon key with the user’s session; RLS restricts data access. Do not commit `.env.local`.

---

## Getting started (local development)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Ensure Supabase env vars are set and the database scripts have been applied.

| Script | Command |
|--------|---------|
| Development | `npm run dev` |
| Production build | `npm run build` |
| Production server | `npm run start` |
| Lint | `npm run lint` |

---

## API overview

Route handlers under `src/app/api/` (non-exhaustive):

| Area | Paths |
|------|--------|
| **Auth** | `/api/auth/login`, `logout`, `session`, `active-role`, `access-roles`, `account-kind`, `clear-role` |
| **Profiles** | `/api/profiles`, `me`, `[id]`, `team-members`, `team-memberships`, `upgrade-admin` |
| **Teams** | `/api/teams/join`, `[teamId]`, `by-slug/[slug]/id`, `is-owner`, `purchase-plan`, `regenerate-invite`, members role |
| **Projects** | `/api/projects`, `[id]`, `members`, `team-details`, `sheet-column-layouts` |
| **Sheet rows** | `/api/sheet-rows`, `batch`, `batch-delete`, `import/validate`, `import/finalize`, `next-task-code` |

Prefer the typed helpers in `src/lib/api/client.ts` from React components rather than calling routes ad hoc.

---

## Routing map (pages)

| Path | Description |
|------|-------------|
| `/` | Bootstraps session and redirects to dashboard or login |
| `/login` | Login screen |
| `/select-workspace` | Choose personal vs team workspace; join team by code |
| `/switch-role` | Switch active demo/platform role |
| `/{team_slug}/admin/dashboard` | Team admin dashboard |
| `/{team_slug}/admin/projects/[id]/[tabId]` | Project sheet (admin workspace) |
| `/{team_slug}/[role]/projects/[id]/[tabId]` | Project sheet (role-based segment; legacy normalization in middleware) |
| `/{team_slug}/pm|dev|client/dashboard` | Role-specific dashboards |
| `/personal/dashboard` | Personal workspace dashboard |
| `/personal/projects/[id]/[tabId]` | Personal project sheets |

---

## Security notes

- All sheet and project mutations should go through APIs or Supabase with an authenticated session so RLS applies.
- Middleware blocks most routes without a Supabase user; app cookies gate post-login navigation.
- Re-run or reconcile RLS if you change enums or policies; see `database/README.md` for idempotent RLS re-application.

---

## Related documentation

- [Database setup and RLS](./database/README.md)
- Schema source of truth: `database/cyberconnect_schema.sql`

---

## License and ownership

This repository is marked `private` in `package.json`. Contact your organization (e.g. Rapture Inc.) for distribution and deployment policies.
