import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderPollingService } from './order-polling.service';
import { ImPaymentListenerService } from './im-payment-listener.service';
import { AccountsModule } from '../accounts/accounts.module';
import { XianyuModule } from '../../xianyu/xianyu.module';
import { GoofishModule } from '../../goofish/goofish.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity]),
    AccountsModule,
    XianyuModule,
    GoofishModule,
  ],
  providers: [OrdersService, OrderPollingService, ImPaymentListenerService],
  controllers: [OrdersController],
  exports: [OrdersService, OrderPollingService],
})
export class OrdersModule {}
