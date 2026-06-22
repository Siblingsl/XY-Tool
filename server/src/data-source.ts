import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { UserEntity } from './modules/users/user.entity';
import { XianyuAccountEntity } from './modules/accounts/account.entity';
import { ProductEntity } from './modules/products/product.entity';
import { KamiPoolEntity, KamiItemEntity } from './modules/kami-pool/kami-pool.entity';
import { OrderEntity } from './modules/orders/order.entity';
import { DeliveryLogEntity } from './modules/delivery/delivery-log.entity';
import {
  ReplyKeywordEntity,
  ReplyConfigEntity,
  ReplyHandoffEntity,
} from './modules/auto-reply/entities/reply.entities';

/**
 * TypeORM DataSource 独立实例。
 *
 * 仅供 typeorm CLI（migration:generate / run / revert）使用，
 * 不参与 NestJS 运行时（运行时由 TypeOrmModule.forRootAsync 装配）。
 *
 * 用法：
 *   npm run migration:generate -- src/migrations/Init
 *   npm run migration:run
 *   npm run migration:revert
 *
 * 注意：CLI 通过 ts-node 直接执行此文件（tsconfig 已含 src/**），
 * 故 env 读取方式与 configuration.ts 保持一致。
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'xianyu_autodeliver',
  synchronize: false, // 迁移模式下绝不同步
  logging: process.env.DB_LOGGING === 'true',
  entities: [
    UserEntity,
    XianyuAccountEntity,
    ProductEntity,
    KamiPoolEntity,
    KamiItemEntity,
    OrderEntity,
    DeliveryLogEntity,
    ReplyKeywordEntity,
    ReplyConfigEntity,
    ReplyHandoffEntity,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'typeorm_migrations',
});

export default AppDataSource;
