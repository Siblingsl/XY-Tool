-- Batch 2 migration (T0): notification center, competitor watch/hits, automation.
-- Idempotent: safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. Notifications (tenant-shared; user_id nullable).
CREATE TABLE IF NOT EXISTS research_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     BIGINT,
  type        VARCHAR(30) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  ref_type    VARCHAR(30),
  ref_id      TEXT,
  read        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_research_notifications_tenant ON research_notifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_notifications_type ON research_notifications (type);
CREATE INDEX IF NOT EXISTS idx_research_notifications_read ON research_notifications (read);
CREATE INDEX IF NOT EXISTS idx_research_notifications_tenant_read ON research_notifications (tenant_id, read);

-- 2. Competitor watch keywords.
CREATE TABLE IF NOT EXISTS research_competitor_watches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     BIGINT,
  keyword     VARCHAR(255) NOT NULL,
  match_scope VARCHAR(20) NOT NULL DEFAULT 'all',
  enabled     BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_research_competitor_watches_tenant ON research_competitor_watches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_competitor_watches_enabled ON research_competitor_watches (enabled);

-- 3. Competitor hit records (audit + de-duplication source).
CREATE TABLE IF NOT EXISTS research_competitor_hits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  watch_id      UUID NOT NULL,
  project_id    UUID NOT NULL,
  keyword       VARCHAR(255) NOT NULL,
  match_scope   VARCHAR(20) NOT NULL,
  matched_field VARCHAR(30)
);
CREATE INDEX IF NOT EXISTS idx_research_competitor_hits_tenant ON research_competitor_hits (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_competitor_hits_watch ON research_competitor_hits (watch_id);
CREATE INDEX IF NOT EXISTS idx_research_competitor_hits_project ON research_competitor_hits (project_id);
CREATE INDEX IF NOT EXISTS idx_research_competitor_hits_tenant_project ON research_competitor_hits (tenant_id, project_id);

-- 4. Automation rules (conditions/actions stored as JSON text).
CREATE TABLE IF NOT EXISTS research_automation_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    BIGINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      BIGINT,
  name         VARCHAR(255) NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  priority     INT NOT NULL DEFAULT 100,
  event_type   VARCHAR(40) NOT NULL,
  conditions_json TEXT,
  actions_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_automation_rules_tenant ON research_automation_rules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_automation_rules_event_type ON research_automation_rules (event_type);

-- 5. Rule execution log.
CREATE TABLE IF NOT EXISTS research_rule_executions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         BIGINT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  rule_id           UUID NOT NULL,
  event_type        VARCHAR(40) NOT NULL,
  project_id        UUID NOT NULL,
  triggered         BOOLEAN NOT NULL DEFAULT false,
  matched           BOOLEAN NOT NULL DEFAULT false,
  action_results_json TEXT,
  error             TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_rule_executions_tenant ON research_rule_executions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_rule_executions_rule ON research_rule_executions (rule_id);
CREATE INDEX IF NOT EXISTS idx_research_rule_executions_project ON research_rule_executions (project_id);
