import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始 schema：与 src/modules/ 下所有 entity 文件的字段、索引一一对应。
 *
 * 适用于全新数据库首次部署。若已存在由 synchronize 生成的库，
 * 应改用 migration:generate 基于现状 diff 生成对齐迁移，而不是直接跑此文件。
 *
 * 字段命名遵循实体中显式指定的 name（snake_case），
 * 所有业务表共用 base 字段：id(bigint PK) / created_at / updated_at。
 */
export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ============ users ============
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            bigserial PRIMARY KEY,
        "username"      varchar(50) NOT NULL UNIQUE,
        "password"      varchar(100) NOT NULL,
        "status"        varchar(50) NOT NULL DEFAULT 'active',
        "nickname"      varchar(100),
        "tenant_id"     bigint NOT NULL,
        "role"          varchar(20) NOT NULL DEFAULT 'admin',
        "created_at"    timestamp NOT NULL DEFAULT now(),
        "updated_at"    timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_users_tenant_id" ON "users" ("tenant_id")`);

    // ============ xianyu_accounts ============
    await queryRunner.query(`
      CREATE TABLE "xianyu_accounts" (
        "id"                bigserial PRIMARY KEY,
        "tenant_id"         bigint NOT NULL,
        "nickname"          varchar(100) NOT NULL,
        "xianyu_uid"        varchar(64) NOT NULL,
        "cookie_encrypted"  text NOT NULL,
        "status"            varchar(20) NOT NULL DEFAULT 'active',
        "last_checked_at"   timestamp,
        "enabled"           boolean NOT NULL DEFAULT true,
        "created_at"        timestamp NOT NULL DEFAULT now(),
        "updated_at"        timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_xianyu_accounts_tenant_id" ON "xianyu_accounts" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_xianyu_accounts_tenant_status" ON "xianyu_accounts" ("tenant_id", "status")`);

    // ============ products ============
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"              bigserial PRIMARY KEY,
        "tenant_id"       bigint NOT NULL,
        "account_id"      bigint NOT NULL,
        "item_id"         varchar(64) NOT NULL,
        "title"           varchar(200) NOT NULL,
        "delivery_type"   varchar(20) NOT NULL,
        "kami_pool_id"    bigint,
        "fixed_content"   text,
        "remark"          text,
        "enabled"         boolean NOT NULL DEFAULT true,
        "created_at"      timestamp NOT NULL DEFAULT now(),
        "updated_at"      timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_products_tenant_id" ON "products" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_products_account_id" ON "products" ("account_id")`);
    await queryRunner.query(`CREATE INDEX "idx_tenant_item" ON "products" ("tenant_id", "item_id")`);

    // ============ kami_pools ============
    await queryRunner.query(`
      CREATE TABLE "kami_pools" (
        "id"                  bigserial PRIMARY KEY,
        "tenant_id"           bigint NOT NULL,
        "name"                varchar(100) NOT NULL,
        "remark"              text,
        "low_stock_threshold" int NOT NULL DEFAULT 10,
        "created_at"          timestamp NOT NULL DEFAULT now(),
        "updated_at"          timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_kami_pools_tenant_id" ON "kami_pools" ("tenant_id")`);

    // ============ kami_items ============
    await queryRunner.query(`
      CREATE TABLE "kami_items" (
        "id"            bigserial PRIMARY KEY,
        "tenant_id"     bigint NOT NULL,
        "pool_id"       bigint NOT NULL,
        "content"       text NOT NULL,
        "status"        varchar(20) NOT NULL DEFAULT 'unused',
        "order_id"      bigint,
        "locked_until"  timestamp,
        "created_at"    timestamp NOT NULL DEFAULT now(),
        "updated_at"    timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_kami_items_tenant_id" ON "kami_items" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_kami_items_pool_id" ON "kami_items" ("pool_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pool_status" ON "kami_items" ("pool_id", "status")`);

    // ============ orders ============
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"               bigserial PRIMARY KEY,
        "tenant_id"        bigint NOT NULL,
        "account_id"       bigint NOT NULL,
        "biz_order_id"     varchar(64) NOT NULL,
        "item_id"          varchar(64) NOT NULL,
        "item_title"       varchar(200) NOT NULL,
        "buyer_nick"       varchar(100),
        "buyer_id"         varchar(64),
        "conversation_id"  varchar(64),
        "amount"           bigint NOT NULL DEFAULT 0,
        "status"           varchar(20) NOT NULL DEFAULT 'PENDING',
        "product_id"       bigint,
        "retry_count"      int NOT NULL DEFAULT 0,
        "next_retry_at"    timestamp,
        "order_created_at" timestamp,
        "fail_reason"      text,
        "created_at"       timestamp NOT NULL DEFAULT now(),
        "updated_at"       timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_orders_tenant_id" ON "orders" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_account_id" ON "orders" ("account_id")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_tenant_status" ON "orders" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_biz_order" ON "orders" ("biz_order_id")`);

    // ============ delivery_logs ============
    await queryRunner.query(`
      CREATE TABLE "delivery_logs" (
        "id"            bigserial PRIMARY KEY,
        "tenant_id"     bigint NOT NULL,
        "order_id"      bigint NOT NULL,
        "delivery_type" varchar(20) NOT NULL,
        "payload"       text,
        "kami_item_id"  bigint,
        "result"        varchar(20) NOT NULL,
        "error"         text,
        "duration_ms"   int NOT NULL DEFAULT 0,
        "created_at"    timestamp NOT NULL DEFAULT now(),
        "updated_at"    timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_delivery_logs_tenant_id" ON "delivery_logs" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_order" ON "delivery_logs" ("order_id")`);

    // ============ typeorm_migrations（首次自动创建，幂等）============
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
        "id"          serial PRIMARY KEY,
        "timestamp"   bigint NOT NULL,
        "name"        varchar NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kami_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kami_pools"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "xianyu_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
