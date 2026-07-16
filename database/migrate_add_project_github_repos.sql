-- Multiple GitHub repos per project (Tasks Issues dropdown / create target).
-- Keep github_owner / github_repo as the primary (first) repo for backward compatibility.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS github_repos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.projects.github_repos IS
  'JSON array of "owner/repo" strings for Issues integration; first entry mirrors github_owner/github_repo';

-- Backfill from legacy single-repo columns
UPDATE public.projects
SET github_repos = jsonb_build_array(github_owner || '/' || github_repo)
WHERE coalesce(github_repos, '[]'::jsonb) = '[]'::jsonb
  AND trim(github_owner) <> ''
  AND trim(github_repo) <> '';
