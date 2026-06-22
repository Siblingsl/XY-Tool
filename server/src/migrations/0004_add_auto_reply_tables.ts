import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auto-reply tables: reply_keywords / reply_config / reply_handoff.
 */
export class AddAutoReplyTables1700000004000 implements MigrationInterface {
  name = 'AddAutoReplyTables1700000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ============ reply_keywords ============
    await queryRunner.query(`
      CREATE TABLE "reply_keywords" (
        "id"            bigserial PRIMARY KEY,
        "tenant_id"     bigint NOT NULL,
        "account_id"    bigint,
        "keyword"       varchar(100) NOT NULL,
        "match_type"    varchar(20) NOT NULL DEFAULT 'contains',
        "reply_content" text NOT NULL,
        "enabled"       boolean NOT NULL DEFAULT true,
        "sort_order"    int NOT NULL DEFAULT 0,
        "created_at"    timestamp NOT NULL DEFAULT now(),
        "updated_at"    timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_reply_kw_tenant_account" ON "reply_keywords" ("tenant_id", "account_id")`);

    // ============ reply_config ============
    await queryRunner.query(`
      CREATE TABLE "reply_config" (
        "id"                        bigserial PRIMARY KEY,
        "tenant_id"                 bigint NOT NULL,
        "account_id"                bigint NOT NULL,
        "default_reply_enabled"     boolean NOT NULL DEFAULT false,
        "default_reply_content"     text,
        "ai_enabled"                boolean NOT NULL DEFAULT false,
        "ai_base_url"               varchar(255) NOT NULL DEFAULT 'https://api.openai.com/v1',
        "ai_api_key_encrypted"      text,
        "ai_model"                  varchar(100) NOT NULL DEFAULT 'gpt-4o-mini',
        "ai_system_prompt"          text,
        "ai_temperature"            float NOT NULL DEFAULT 0.7,
        "transfer_keywords"         varchar(200) NOT NULL DEFAULT '人工,客服',
        "cooldown_seconds"          int NOT NULL DEFAULT 3,
        "created_at"                timestamp NOT NULL DEFAULT now(),
        "updated_at"                timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_reply_cfg_tenant_account" ON "reply_config" ("tenant_id", "account_id")`);

    // ============ reply_handoff ============
    await queryRunner.query(`
      CREATE TABLE "reply_handoff" (
        "id"             bigserial PRIMARY KEY,
        "tenant_id"      bigint NOT NULL,
        "account_id"     bigint NOT NULL,
        "buyer_id"       varchar(64) NOT NULL,
        "buyer_nick"     varchar(100),
        "handed_off"     boolean NOT NULL DEFAULT true,
        "handed_off_at"  timestamp NOT NULL DEFAULT now(),
        "trigger_content" text,
        "created_at"     timestamp NOT NULL DEFAULT now(),
        "updated_at"     timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_reply_handoff_tenant_account_buyer" ON "reply_handoff" ("tenant_id", "account_id", "buyer_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reply_handoff"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reply_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reply_keywords"`);
  }
}
