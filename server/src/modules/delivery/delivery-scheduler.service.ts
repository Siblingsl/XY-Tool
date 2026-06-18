import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../orders/orders.service';
import { DeliveryService } from './delivery.service';
import { KamiPoolService } from '../kami-pool/kami-pool.service';
import { AlertService } from '../alert/alert.service';
import { DeliveryJobData } from './delivery.processor';

/**
 * 发货调度器。
 *
 * 定时扫描 orders 表中的待处理订单，推入 Bull 队列由 DeliveryProcessor 异步消费。
 * 避免串行阻塞——即使某个订单的 IM 发送卡住，其余订单仍能并发处理。
 * 同时负责清理超时锁定的卡密。
 *
 * 两个定时任务：
 *  1. 每 5 秒扫描待处理订单（新订单 + 待重试订单）
 *  2. 每分钟清理超时卡密锁
 */
@Injectable()
export class DeliverySchedulerService {
  private readonly logger = new Logger(DeliverySchedulerService.name);
  private readonly BATCH_SIZE = 10;

  constructor(
    @InjectQueue('delivery')
    private readonly deliveryQueue: Queue<DeliveryJobData>,
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly deliveryService: DeliveryService,
    private readonly kamiPoolService: KamiPoolService,
    private readonly alertService: AlertService,
  ) {}

  /**
   * 每 5 秒扫描一次待处理订单，推入 Bull 队列并发消费。
   * 去重：用 jobId = "delivery:{orderId}" 防止同一订单重复入队。
   */
  @Cron('*/5 * * * * *')
  async processPendingOrders() {
    try {
      const orders = await this.ordersService.getProcessableOrders(
        this.BATCH_SIZE,
      );

      for (const order of orders) {
        const jobId = `delivery:${order.id}`;

        // 检查队列中是否已有同 orderId 的等待/活跃任务
        const existing = await this.deliveryQueue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'waiting' || state === 'active' || state === 'delayed') {
            continue;
          }
        }

        await this.deliveryQueue.add(
          { orderId: order.id, tenantId: order.tenantId },
          {
            jobId,
            attempts: 1,             // 不重试—processOrder 内部有重试机制
            removeOnComplete: 100,   // 保留最近 100 个完成记录
            removeOnFail: 50,        // 保留最近 50 个失败记录
          },
        );

        this.logger.log(
          `入队订单: ${order.bizOrderId} (${order.retryCount > 0 ? '重试' : '新订单'})`,
        );
      }
    } catch (err) {
      this.logger.error(`订单扫描异常: ${(err as Error).message}`);
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

        // 告警：卡住的订单
        if (this.config.get<boolean>('alert.onStuckOrders', false)) {
          this.alertService.send({
            title: `发现 ${recovered} 条卡住订单已恢复`,
            text: `维护任务恢复了 ${recovered} 条卡在 DELIVERING 状态的订单。\n\n时间: ${new Date().toLocaleString('zh-CN')}`,
            severity: 'warn',
          });
        }
      }

      const released = await this.kamiPoolService.releaseExpiredLocks();
      if (released > 0) {
        this.logger.log(`维护: 释放 ${released} 条超时卡密`);
      }

      // 低库存检查（只在整点分钟检查，避免过于频繁）
      if (this.config.get<boolean>('alert.onLowStock', true)) {
        const now = new Date();
        if (now.getSeconds() < 5) {
          const tenants = await this.kamiPoolService.getAllPoolTenants();
          for (const tenantId of tenants) {
            const low = await this.kamiPoolService.checkLowStock(tenantId);
            if (low.length > 0) {
              const details = low
                .map((l) => `- ${l.pool.name}: 剩余 ${l.stock}，阈值 ${l.threshold}`)
                .join('\n');
              this.alertService.send({
                title: '卡密库存不足',
                text: `以下卡密池库存低于阈值:\n\n${details}\n\n请及时补充。`,
                severity: 'warn',
                tenantId,
              });
            }
          }
        }
      }
    } catch (err) {
      this.logger.error(`维护任务异常: ${(err as Error).message}`);
    }
  }
}
