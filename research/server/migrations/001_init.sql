-- Reference schema for research-server (AutoMigrate is preferred on startup).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  tenant_id BIGINT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  refresh_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email VARCHAR(255) NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  sync_cursor VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_research_gmail_tenant ON research_gmail_accounts (tenant_id);

CREATE TABLE IF NOT EXISTS research_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gmail_message_id VARCHAR(255) NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  from_addr VARCHAR(500) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  body_text TEXT,
  extracted_json JSONB,
  categories TEXT[],
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  filter_reason VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_research_emails_tenant ON research_emails (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_emails_status ON research_emails (status);

CREATE TABLE IF NOT EXISTS research_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  key VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  project_ids UUID[]
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_clusters_key ON research_clusters (tenant_id, key);

CREATE TABLE IF NOT EXISTS research_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_id UUID NOT NULL,
  cluster_id UUID,
  card_json JSONB,
  verify_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  feasibility_index INT,
  verdict VARCHAR(10),
  authenticity_stars INT,
  lifecycle VARCHAR(20),
  mvp_plan_json JSONB,
  score_json JSONB,
  summary VARCHAR(500),
  stars INT
);
CREATE INDEX IF NOT EXISTS idx_research_projects_tenant ON research_projects (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_verdict ON research_projects (verdict);
CREATE INDEX IF NOT EXISTS idx_research_projects_cluster ON research_projects (cluster_id);

CREATE TABLE IF NOT EXISTS research_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id UUID NOT NULL,
  source VARCHAR(50) NOT NULL,
  url TEXT NOT NULL,
  claim VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  snippet TEXT,
  fetched_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_evidences_project ON research_evidences (project_id);

CREATE TABLE IF NOT EXISTS research_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_competitors_project ON research_competitors (project_id);

CREATE TABLE IF NOT EXISTS research_heat_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id UUID NOT NULL,
  date DATE NOT NULL,
  metric VARCHAR(50) NOT NULL,
  value DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_heat_project ON research_heat_points (project_id);
CREATE INDEX IF NOT EXISTS idx_research_heat_project_date_metric ON research_heat_points (project_id, date, metric);

CREATE TABLE IF NOT EXISTS research_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_date DATE NOT NULL,
  summary_json JSONB,
  body_md TEXT,
  project_ids UUID[]
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_reports_date ON research_daily_reports (tenant_id, report_date);

CREATE TABLE IF NOT EXISTS research_pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_id UUID,
  project_id UUID,
  stage VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_research_jobs_tenant ON research_pipeline_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_pipeline_jobs (status);
CREATE INDEX IF NOT EXISTS idx_research_jobs_stage ON research_pipeline_jobs (stage);

CREATE TABLE IF NOT EXISTS research_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  marketing_keywords TEXT[],
  report_cron_local VARCHAR(10) NOT NULL DEFAULT '21:00',
  enabled_verify_sources TEXT[]
);
