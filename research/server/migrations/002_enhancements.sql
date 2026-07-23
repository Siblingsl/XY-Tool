-- Enhancement migration (T0): favorites, tags, notes, and analytics accelerators.
-- Idempotent: safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. Lightweight favorite flag on projects (coexists with existing stars rating).
ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS favorited BOOLEAN NOT NULL DEFAULT false;

-- 2. Accelerate lifecycle-based filtering (idea/validating/watch/do/landed).
CREATE INDEX IF NOT EXISTS idx_research_projects_lifecycle
  ON research_projects (tenant_id, lifecycle);

-- 3. Project tags table.
CREATE TABLE IF NOT EXISTS research_project_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id  UUID NOT NULL,
  tag         VARCHAR(60) NOT NULL,
  user_id     BIGINT
);
CREATE INDEX IF NOT EXISTS idx_research_tags_tenant ON research_project_tags (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_tags_project ON research_project_tags (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_tags_uniq
  ON research_project_tags (tenant_id, project_id, tag);

-- 4. Project notes table.
CREATE TABLE IF NOT EXISTS research_project_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id  UUID NOT NULL,
  content     TEXT NOT NULL,
  user_id     BIGINT
);
CREATE INDEX IF NOT EXISTS idx_research_notes_tenant ON research_project_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_notes_project ON research_project_notes (project_id);

-- 5. Source-profile acceleration for /analytics/sources (P2-5).
CREATE INDEX IF NOT EXISTS idx_research_emails_tenant_from
  ON research_emails (tenant_id, from_addr);
