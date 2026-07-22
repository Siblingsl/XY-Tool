import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryLogEntity } from './delivery-log.entity';
import { DeliveryService } from './delivery.service';
import { DeliveryProcessor } from './delivery.processor';
import { DeliverySchedulerService } from './delivery-scheduler.service';
import { DeliveryController } from './delivery.controller';
import { XianyuModule } from '../../xianyu/xianyu.module';
import { GoofishModule } from '../../goofish/goofish.module';
import { AccountsModule } from '../accounts/accounts.module';
import { ProductsModule } from '../products/products.module';
import { KamiPoolModule } from '../kami-pool/kami-pool.module';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { LicenseModule } from '../license/license.module';

/**
 * 发货模块。
 * 依赖协议层(XianyuModule) + 账号/商品/卡密/订单四大业务模块。
 * 是整个系统的"心脏"——把订单监听→匹配规则→取卡密→发消息串起来。
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'delivery' }),
    TypeOrmModule.forFeature([DeliveryLogEntity]),
    XianyuModule,
    GoofishModule,
    AccountsModule,
    ProductsModule,
    KamiPoolModule,
    OrdersModule,
    RealtimeModule,
    LicenseModule,
  ],
  providers: [DeliveryService, DeliveryProcessor, DeliverySchedulerService],
  controllers: [DeliveryController],
  exports: [DeliveryService, BullModule],
})
export class DeliveryModule {}
