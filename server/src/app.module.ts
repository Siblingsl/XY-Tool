import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';

// 业务模块
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ProductsModule } from './modules/products/products.module';
import { KamiPoolModule } from './modules/kami-pool/kami-pool.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { SignModule } from './modules/sign/sign.module';
import { XianyuModule } from './xianyu/xianyu.module';

@Module({
  imports: [
    // 1. 全局配置
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
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
        timezone: '+08:00',
        charset: 'UTF8',
        logging: config.get<boolean>('database.logging'),
      }),
    }),

    // 3. 定时任务（订单轮询用）
    ScheduleModule.forRoot(),

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
  ],
})
export class AppModule {}
