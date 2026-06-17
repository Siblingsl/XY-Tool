import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../orders/orders.service';
import { DeliveryService } from './delivery.service';
import { KamiPoolService } from '../kami-pool/kami-pool.service';

/**
 * 发货调度器。
 *
 * 定时扫描 orders 表中的待处理订单，交给 DeliveryService 执行发货。
 * 同时负责清理超时锁定的卡密。
 *
 * 两个定时任务：
 *  1. 每 5 秒扫描待处理订单（新订单 + 待重试订单）
 *  2. 每分钟清理超时卡密锁
 */
@Injectable()
export class DeliverySchedulerService {
  private readonly logger = new Logger(DeliverySchedulerService.name);
  private readonly MAX_CONCURRENT = 5; // 最大并发发货数

  private processing = false;

  constructor(
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly deliveryService: DeliveryService,
    private readonly kamiPoolService: KamiPoolService,
  ) {}

  /**
   * 每 5 秒扫描一次待处理订单。
   * 包括新订单（PENDING + retryCount=0）和待重试订单（PENDING + retryCount>0 + nextRetryAt 已过）。
   */
  @Cron('*/5 * * * * *')
  async processPendingOrders() {
    if (this.processing) return;
    this.processing = true;

    try {
      const orders = await this.ordersService.getProcessableOrders(
        this.MAX_CONCURRENT,
      );

      for (const order of orders) {
        try {
          this.logger.log(
            `处理订单: ${order.bizOrderId} (${order.retryCount > 0 ? '重试' : '新订单'})`,
          );
          await this.deliveryService.processOrder(order);
        } catch (err) {
          this.logger.error(
            `处理订单异常: ${order.bizOrderId} - ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`订单扫描异常: ${(err as Error).message}`);
    } finally {
      this.processing = false;
    }
  }

  /**
   * 每分钟执行一次维护任务：释放超时锁定的卡密（防止锁死）。
   */
  @Cron('0 * * * * *')
  async maintenance() {
    try {
      const recovered = await this.deliveryService.recoverStuckOrders();
      if (recovered > 0) {
        this.logger.log(`维护: 恢复 ${recovered} 条卡住的发货订单`);
      }

      const released = await this.kamiPoolService.releaseExpiredLocks();
      if (released > 0) {
        this.logger.log(`维护: 释放 ${released} 条超时卡密`);
      }
    } catch (err) {
      this.logger.error(`释放超时卡密异常: ${(err as Error).message}`);
    }
  }
}
