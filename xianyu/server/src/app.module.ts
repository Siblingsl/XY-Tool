import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import configuration from './config/configuration';
import { EnvironmentVariables } from './config/env.validation';

// 业务模块
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ProductsModule } from './modules/products/products.module';
import { KamiPoolModule } from './modules/kami-pool/kami-pool.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { AlertModule } from './modules/alert/alert.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { HealthModule } from './modules/health/health.module';
import { StatsModule } from './modules/stats/stats.module';
import { AdminModule } from './modules/admin/admin.module';
import { RedisModule } from './modules/redis/redis.module';
import { AutoReplyModule } from './modules/auto-reply/auto-reply.module';
import { LicenseModule } from './modules/license/license.module';
import { ItemDraftModule } from './modules/item-draft/item-draft.module';
import { ListingRewriteModule } from './modules/listing-rewrite/listing-rewrite.module';
import { AiModule } from './modules/ai/ai.module';
import { SignModule } from './modules/sign/sign.module';
import { XianyuModule } from './xianyu/xianyu.module';

@Module({
  imports: [
    // 1. 全局配置
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: (config) => {
        const errors = EnvironmentVariables.validate(config);
        if (errors.length > 0) {
          throw new Error(`环境变量校验失败:\n${errors.join('\n')}`);
        }
        return config;
      },
      envFilePath: [
        // xianyu/server → 仓库根 .env
        '.env.local',
        '../../.env',
        '../.env',
        '.env',
      ],
    }),

    // 2. 数据库（TypeORM）
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.sync'), // 开发期自动建表
        // 生产期用 migration：DB_SYNC=false + DB_MIGRATIONS_RUN=true
        migrations: [__dirname + '/migrations/*.{ts,js}'],
        migrationsRun: config.get<boolean>('database.migrationsRun'),
        migrationsTableName: 'typeorm_migrations',
        timezone: '+08:00',
        charset: 'UTF8',
        logging: config.get<boolean>('database.logging'),
      }),
    }),

    // 3. 定时任务（订单轮询用）
    ScheduleModule.forRoot(),

    // 3.5 全局限流：默认每分钟 120 次/IP，敏感路由（登录/注册）在 Controller 上单独收紧
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{
          ttl: config.get<number>('throttle.ttl') ?? 60_000,
          limit: config.get<number>('throttle.limit') ?? 120,
        }],
      }),
    }),

    // 3.6 任务队列（Bull）：发货等后台任务持久化 + 并发控制
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password') || undefined,
        },
      }),
    }),

    // 4. 业务模块
    AlertModule,    // 告警通道（必须先于依赖它的模块导入）
    RedisModule,    // 全局 Redis（对话上下文/人工接管/冷却）
    XianyuModule,   // 协议层（mtop-client + 签名），单例，供各业务模块共享
    SignModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    ProductsModule,
    KamiPoolModule,
    OrdersModule,
    DeliveryModule,
    RealtimeModule,
    StatsModule,
    AdminModule,
    AiModule,
    AutoReplyModule,
    LicenseModule,
    ItemDraftModule,
    ListingRewriteModule,
  ],
  providers: [
    // 全局限流守卫：未显式 @SkipThrottle() 的路由都会被限流
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
