import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { RealtimeModule } from './modules/realtime/realtime.module';
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
        // 优先级：server/.env.local > 根目录/.env > server/.env
        // 根目录 .env 是 docker-compose / web / server 共用的主配置，
        // 仅保留 server/.env 作为兼容兜底，避免双份配置长期漂移。
        '.env.local',
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

    // 4. 业务模块
    XianyuModule,   // 协议层（mtop-client + 签名），单例，供各业务模块共享
    SignModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    ProductsModule,
    KamiPoolModule,
    OrdersModule,
    DeliveryModule,
    RealtimeModule,
  ],
  providers: [
    // 全局限流守卫：未显式 @SkipThrottle() 的路由都会被限流
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
