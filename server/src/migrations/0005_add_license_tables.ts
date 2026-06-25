import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * License system tables: license_types / license_batches / license_codes,
 * plus products.license_type_code column.
 */
export class AddLicenseTables1700000005000 implements MigrationInterface {
  name = 'AddLicenseTables1700000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ============ license_types ============
    await queryRunner.query(`
      CREATE TABLE "license_types" (
        "id"            bigserial PRIMARY KEY,
        "tenant_id"     bigint NOT NULL,
        "name"          varchar(100) NOT NULL,
        "code"          varchar(50) NOT NULL,
        "duration_days" int,
        "max_uses"      int NOT NULL DEFAULT 1,
        "code_prefix"   varchar(20) NOT NULL DEFAULT '',
        "code_length"   int NOT NULL DEFAULT 16,
        "enabled"       boolean NOT NULL DEFAULT true,
        "created_at"    timestamp NOT NULL DEFAULT now(),
        "updated_at"    timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_license_types_tenant_code" ON "license_types" ("tenant_id", "code")`);

    // ============ license_batches ============
    await queryRunner.query(`
      CREATE TABLE "license_batches" (
        "id"         bigserial PRIMARY KEY,
        "tenant_id"  bigint NOT NULL,
        "type_id"    bigint NOT NULL,
        "count"      int NOT NULL,
        "source"     varchar(20) NOT NULL DEFAULT 'manual',
        "order_id"   bigint,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_license_batches_tenant_type" ON "license_batches" ("tenant_id", "type_id")`);

    // ============ license_codes ============
    await queryRunner.query(`
      CREATE TABLE "license_codes" (
        "id"           bigserial PRIMARY KEY,
        "tenant_id"    bigint NOT NULL,
        "type_id"      bigint NOT NULL,
        "batch_id"     bigint,
        "code"         varchar(100) NOT NULL,
        "status"       varchar(20) NOT NULL DEFAULT 'unused',
        "used_count"   int NOT NULL DEFAULT 0,
        "activated_at" timestamp,
        "expires_at"   timestamp,
        "order_id"     bigint,
        "activated_by" varchar(200),
        "created_at"   timestamp NOT NULL DEFAULT now(),
        "updated_at"   timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_license_codes_code" ON "license_codes" ("code")`);
    await queryRunner.query(`CREATE INDEX "idx_license_codes_tenant_status" ON "license_codes" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_license_codes_tenant_type" ON "license_codes" ("tenant_id", "type_id")`);

    // ============ products 加 license_type_code 列 ============
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "license_type_code" varchar(50)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "license_type_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "license_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "license_batches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "license_types"`);
  }
}
