import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 账号级「发货后自动确认」开关。
 * 实体已有 auto_confirm，生产 DB_SYNC=false 需 migration。
 */
export class AddAccountAutoConfirm1700000008000 implements MigrationInterface {
  name = 'AddAccountAutoConfirm1700000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "xianyu_accounts"
        ADD COLUMN IF NOT EXISTS "auto_confirm" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "xianyu_accounts"
        DROP COLUMN IF EXISTS "auto_confirm"
    `);
  }
}
