import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 项目研究系统全部数据表。
 * 文档第五章：research_gmail_accounts, research_emails, research_projects,
 * research_evidences, research_competitors, research_heat_points,
 * research_clusters, research_daily_reports, research_pipeline_jobs。
 * 研究域使用 uuid 主键，与闲鱼域 bigint 自增隔离。
 */
export class AddResearchTables1700000009000 implements MigrationInterface {
  name = 'AddResearchTables1700000009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 5.1 research_gmail_accounts
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_gmail_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "email" varchar(255) NOT NULL,
        "refresh_token_enc" text NOT NULL,
        "sync_cursor" varchar(255),
        "status" varchar(20) NOT NULL DEFAULT 'active'
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_gmail_tenant"
      ON "research_gmail_accounts" ("tenant_id")
    `);

    // 5.2 research_emails
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_emails" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "gmail_message_id" varchar(255) NOT NULL,
        "subject" text NOT NULL,
        "from_addr" varchar(500) NOT NULL,
        "received_at" timestamptz NOT NULL,
        "body_text" text,
        "extracted_json" jsonb,
        "categories" text[],
        "status" varchar(30) NOT NULL DEFAULT 'pending',
        "filter_reason" varchar(255)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_emails_tenant"
      ON "research_emails" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_emails_status"
      ON "research_emails" ("status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_research_emails_gmail_msg"
      ON "research_emails" ("gmail_message_id")
    `);

    // 5.6 research_clusters (先建，projects 引用)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_clusters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "key" varchar(100) NOT NULL,
        "label" varchar(255) NOT NULL,
        "project_ids" uuid[]
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_clusters_tenant"
      ON "research_clusters" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_research_clusters_key"
      ON "research_clusters" ("tenant_id", "key")
    `);

    // 5.3 research_projects
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "email_id" uuid NOT NULL,
        "cluster_id" uuid,
        "card_json" jsonb,
        "verify_status" varchar(30) NOT NULL DEFAULT 'pending',
        "feasibility_index" int,
        "verdict" varchar(10),
        "authenticity_stars" int,
        "lifecycle" varchar(20),
        "mvp_plan_json" jsonb,
        "score_json" jsonb,
        "summary" varchar(500),
        "stars" int
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_projects_tenant"
      ON "research_projects" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_projects_verdict"
      ON "research_projects" ("verdict")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_projects_cluster"
      ON "research_projects" ("cluster_id")
    `);

    // 5.4 research_evidences
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_evidences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "project_id" uuid NOT NULL,
        "source" varchar(50) NOT NULL,
        "url" text NOT NULL,
        "claim" varchar(100) NOT NULL,
        "value" text NOT NULL,
        "snippet" text,
        "fetched_at" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_evidences_project"
      ON "research_evidences" ("project_id")
    `);

    // 5.5 research_competitors
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_competitors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "project_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "url" varchar(500),
        "notes" text
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_competitors_project"
      ON "research_competitors" ("project_id")
    `);

    // 5.5 research_heat_points
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_heat_points" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "project_id" uuid NOT NULL,
        "date" date NOT NULL,
        "metric" varchar(50) NOT NULL,
        "value" float NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_heat_project"
      ON "research_heat_points" ("project_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_heat_project_date_metric"
      ON "research_heat_points" ("project_id", "date", "metric")
    `);

    // 5.7 research_daily_reports
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_daily_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "report_date" date NOT NULL,
        "summary_json" jsonb,
        "body_md" text,
        "project_ids" uuid[]
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_reports_tenant"
      ON "research_daily_reports" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_research_reports_date"
      ON "research_daily_reports" ("tenant_id", "report_date")
    `);

    // 5.8 research_pipeline_jobs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_pipeline_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "email_id" uuid,
        "project_id" uuid,
        "stage" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'queued',
        "error" text,
        "started_at" timestamptz,
        "finished_at" timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_jobs_tenant"
      ON "research_pipeline_jobs" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_jobs_status"
      ON "research_pipeline_jobs" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_jobs_stage"
      ON "research_pipeline_jobs" ("stage")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_jobs_email"
      ON "research_pipeline_jobs" ("email_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_jobs_project"
      ON "research_pipeline_jobs" ("project_id")
    `);

    // 设置表（每租户一行）
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "marketing_keywords" text[],
        "report_cron_local" varchar(10) NOT NULL DEFAULT '21:00',
        "enabled_verify_sources" text[]
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_research_settings_tenant"
      ON "research_settings" ("tenant_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "research_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_pipeline_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_daily_reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_heat_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_competitors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_evidences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_clusters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_emails"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_gmail_accounts"`);
  }
}
