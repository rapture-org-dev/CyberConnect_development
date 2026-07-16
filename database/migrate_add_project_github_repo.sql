-- Per-project GitHub Issues binding (optional; falls back to env GITHUB_OWNER/GITHUB_REPO)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS github_owner text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS github_repo text NOT NULL DEFAULT ''::text;

COMMENT ON COLUMN public.projects.github_owner IS 'GitHub org/user for Issues integration; empty = use env GITHUB_OWNER';
COMMENT ON COLUMN public.projects.github_repo IS 'GitHub repository name for Issues integration; empty = use env GITHUB_REPO';
