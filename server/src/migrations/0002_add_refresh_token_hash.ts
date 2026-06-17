import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 新增 users.refresh_token_hash 列（Refresh Token 服务端吊销支持）。
 * 紧随 0001_init_schema 之后。
 */
export class AddRefreshTokenHash1700000001000 implements MigrationInterface {
  name = 'AddRefreshTokenHash1700000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "refresh_token_hash" varchar(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "refresh_token_hash"
    `);
  }
}
