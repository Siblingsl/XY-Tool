import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 功能增强：
 * - products: 延时发货 / 多数量 / 多规格
 * - orders: 数量 / 规格 / 收货人
 * - reply_keywords: 商品专属
 * - reply_config: AI 议价参数
 */
export class AddDeliveryReplyEnhancements1700000006000
  implements MigrationInterface
{
  name = 'AddDeliveryReplyEnhancements1700000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // products
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "delay_seconds" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "multi_quantity" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "is_multi_spec" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "spec_name" varchar(100),
        ADD COLUMN IF NOT EXISTS "spec_value" varchar(200)
    `);

    // orders
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "quantity" int NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "spec_name" varchar(100),
        ADD COLUMN IF NOT EXISTS "spec_value" varchar(200),
        ADD COLUMN IF NOT EXISTS "receiver_name" varchar(100),
        ADD COLUMN IF NOT EXISTS "receiver_phone" varchar(32),
        ADD COLUMN IF NOT EXISTS "receiver_address" text,
        ADD COLUMN IF NOT EXISTS "xy_status" varchar(50)
    `);

    // reply_keywords: 商品专属
    await queryRunner.query(`
      ALTER TABLE "reply_keywords"
        ADD COLUMN IF NOT EXISTS "item_id" varchar(64)
    `);

    // reply_config: AI 议价
    await queryRunner.query(`
      ALTER TABLE "reply_config"
        ADD COLUMN IF NOT EXISTS "ai_bargain_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "max_discount_percent" int NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS "max_discount_amount" int NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS "max_bargain_rounds" int NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS "bargain_keywords" varchar(200) DEFAULT '便宜,刀,优惠,少点,砍价,议价'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reply_config"
        DROP COLUMN IF EXISTS "ai_bargain_enabled",
        DROP COLUMN IF EXISTS "max_discount_percent",
        DROP COLUMN IF EXISTS "max_discount_amount",
        DROP COLUMN IF EXISTS "max_bargain_rounds",
        DROP COLUMN IF EXISTS "bargain_keywords"
    `);
    await queryRunner.query(`
      ALTER TABLE "reply_keywords"
        DROP COLUMN IF EXISTS "item_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN IF EXISTS "quantity",
        DROP COLUMN IF EXISTS "spec_name",
        DROP COLUMN IF EXISTS "spec_value",
        DROP COLUMN IF EXISTS "receiver_name",
        DROP COLUMN IF EXISTS "receiver_phone",
        DROP COLUMN IF EXISTS "receiver_address",
        DROP COLUMN IF EXISTS "xy_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
        DROP COLUMN IF EXISTS "delay_seconds",
        DROP COLUMN IF EXISTS "multi_quantity",
        DROP COLUMN IF EXISTS "is_multi_spec",
        DROP COLUMN IF EXISTS "spec_name",
        DROP COLUMN IF EXISTS "spec_value"
    `);
  }
}
