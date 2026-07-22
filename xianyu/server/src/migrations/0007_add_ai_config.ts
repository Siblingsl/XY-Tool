import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 租户级公共 AI 接入配置表。
 */
export class AddAiConfig1700000007000 implements MigrationInterface {
  name = 'AddAiConfig1700000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_config" (
        "id" BIGSERIAL PRIMARY KEY,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" bigint NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "base_url" varchar(255) NOT NULL DEFAULT 'https://api.openai.com/v1',
        "api_key_encrypted" text,
        "default_model" varchar(100) NOT NULL DEFAULT 'gpt-4o-mini',
        "default_temperature" float NOT NULL DEFAULT 0.7
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_config_tenant"
      ON "ai_config" ("tenant_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ai_config_tenant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_config"`);
  }
}
