import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { OrdersService } from '../orders/orders.service';

export interface DeliveryJobData {
  orderId: number;
  tenantId: number;
}

/**
 * 发货队列消费者。
 *
 * 收到 { orderId, tenantId } 后加载订单并调用 DeliveryService.processOrder。
 * 使用 accountLocks 保证同一账号的订单串行处理（IM 发送必须线性）。
 */
@Processor('delivery')
export class DeliveryProcessor {
  private readonly logger = new Logger(DeliveryProcessor.name);

  /** 同一账号正在处理中的 Promise，key = accountId */
  private readonly accountLocks = new Map<number, Promise<unknown>>();

  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly ordersService: OrdersService,
  ) {}

  @Process({ concurrency: 5 })
  async process(job: Job<DeliveryJobData>) {
    const { orderId, tenantId } = job.data;

    const order = await this.ordersService.findByIdForTenant(orderId, tenantId);
    if (!order) {
      this.logger.warn(`订单 ${orderId} 不存在，跳过`);
      return;
    }

    if (order.status !== 'PENDING') {
      this.logger.log(`订单 ${order.bizOrderId} 状态 ${order.status}，跳过`);
      return;
    }

    await this.withAccountLock(order.accountId, async () => {
      const reloaded = await this.ordersService.findByIdForTenant(orderId, tenantId);
      if (!reloaded || reloaded.status !== 'PENDING') {
        this.logger.log(`订单 ${orderId} 在队列等待期间状态已变更，跳过`);
        return;
      }
      await this.deliveryService.processOrder(reloaded);
    });
  }

  /**
   * 同一账号的任务串行执行。
   * 等待前一个任务完成后再执行 fn，保证 IM 发送线性。
   */
  private async withAccountLock(
    accountId: number,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    const prev = this.accountLocks.get(accountId);
    if (prev) {
      try { await prev; } catch { /* 前一个任务已完成或失败，继续执行 fn */ }
    }

    const promise = fn().finally(() => {
      if (this.accountLocks.get(accountId) === promise) {
        this.accountLocks.delete(accountId);
      }
    });
    this.accountLocks.set(accountId, promise);
    await promise;
  }

  @OnQueueFailed()
  onFailed(job: Job<DeliveryJobData>, err: Error) {
    this.logger.error(
      `发货任务失败: orderId=${job.data.orderId}, error=${err.message}`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<DeliveryJobData>) {
    this.logger.log(`发货任务完成: orderId=${job.data.orderId}`);
  }
}
