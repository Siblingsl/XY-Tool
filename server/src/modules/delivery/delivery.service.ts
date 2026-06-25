import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { ProductsService } from '../products/products.service';
import { KamiPoolService } from '../kami-pool/kami-pool.service';
import { OrdersService } from '../orders/orders.service';
import { OrderEntity } from '../orders/order.entity';
import { ProductEntity, DeliveryType } from '../products/product.entity';
import { DeliveryLogEntity } from './delivery-log.entity';
import { MessageApi } from '../../xianyu/apis/message.api';
import { GoofishMtopService } from '../../goofish/goofish-mtop.service';
import { GOOFISH_UA } from '../../goofish/goofish.constants';
import { handleAccountAuthError } from '../accounts/account-auth.util';
import { RealtimeService } from '../realtime/realtime.service';
import { AlertService } from '../alert/alert.service';
import { LicenseService } from '../license/license.service';
import { DeliveryJobData } from './delivery.processor';

/**
 * 发货执行引擎。
 *
 * P0 保障：
 * - 无 buyerId 不发货、不消耗卡密
 * - IM 发送成功后立即写 success 日志，重试时不再重复发送
 * - recoverStuckOrders 恢复卡在 DELIVERING 的订单
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly MAX_RETRIES = 3;
  /** DELIVERING 超过该分钟数视为卡住 */
  private readonly STUCK_DELIVERING_MINUTES = 2;

  constructor(
    @InjectQueue('delivery')
    private readonly deliveryQueue: Queue<DeliveryJobData>,
    @InjectRepository(DeliveryLogEntity)
    private readonly logRepo: Repository<DeliveryLogEntity>,
    private readonly config: ConfigService,
    private readonly accountsService: AccountsService,
    private readonly productsService: ProductsService,
    private readonly kamiPoolService: KamiPoolService,
    private readonly ordersService: OrdersService,
    private readonly messageApi: MessageApi,
    private readonly goofishMtop: GoofishMtopService,
    private readonly realtime: RealtimeService,
    private readonly alertService: AlertService,
    private readonly licenseService: LicenseService,
  ) {}

  async processOrder(order: OrderEntity): Promise<{
    success: boolean;
    message: string;
  }> {
    const start = Date.now();

    if (order.status === 'DELIVERED') {
      return { success: true, message: '订单已发货' };
    }

    const priorSuccess = await this.findSuccessLog(order.id);
    if (priorSuccess) {
      await this.finalizeSuccessfulDelivery(order, priorSuccess);
      return { success: true, message: '订单已发货（幂等恢复）' };
    }

    const product = await this.productsService.findByItemId(
      order.tenantId,
      order.itemId,
      order.accountId,
    );
    if (!product || !product.enabled) {
      await this.ordersService.markIgnored(
        order.id,
        '无匹配的发货规则或规则已禁用',
      );
      return { success: false, message: '无匹配发货规则' };
    }

    const account = await this.accountsService
      .listEnabled(order.tenantId)
      .then((list) => list.find((a) => a.id === order.accountId));

    if (!account) {
      await this.failWithLog(
        order,
        product,
        null,
        '关联的闲鱼账号不存在或已禁用',
        start,
      );
      return { success: false, message: '闲鱼账号不可用' };
    }

    let cookie = this.accountsService.decryptCookie(account);
    const useGoofish =
      this.config.get<string>('sign.provider') === 'goofish';

    let buyerId = order.buyerId;
    let buyerNick = order.buyerNick;

    if (!buyerId && useGoofish) {
      try {
        const detail = await this.goofishMtop.fetchOrderDetail(
          cookie,
          order.bizOrderId,
        );
        if (detail.cookie !== cookie) {
          await this.accountsService.updateCookieIfChanged(
            account.id,
            detail.cookie,
          );
          cookie = detail.cookie;
        }
        if (detail.buyerId) {
          buyerId = detail.buyerId;
          buyerNick = detail.buyerNick ?? buyerNick;
          await this.ordersService.patchBuyerInfo(
            order.id,
            buyerId,
            buyerNick ?? undefined,
          );
        }
      } catch (e) {
        this.logger.warn(
          `订单 ${order.bizOrderId} 拉取详情补 buyerId 失败: ${(e as Error).message}`,
        );
      }
    }

    if (!buyerId) {
      await this.failWithLog(
        order,
        product,
        null,
        '缺少买家 ID，无法发送 IM 消息',
        start,
      );
      return { success: false, message: '缺少买家 ID' };
    }

    const { content, kamiItemId } = await this.prepareContent(product, order);
    if (!content) {
      await this.ordersService.markFailed(
        order.id,
        '准备发货内容失败（卡密池库存不足）',
      );
      return { success: false, message: '卡密库存不足' };
    }

    await this.ordersService.markAssigned(order.id, product.id);
    await this.ordersService.updateStatus(order.id, 'DELIVERING');

    const ctx = {
      cookie,
      appKey: useGoofish
        ? '34839810'
        : this.config.get<string>('sign.appKey') || '12574478',
      userAgent: useGoofish
        ? GOOFISH_UA
        : 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    };

    let imSent = false;

    try {
      await this.messageApi.sendTextMessage(
        ctx,
        buyerId,
        order.bizOrderId,
        content,
        {
          conversationId: order.conversationId,
          itemId: order.itemId,
          accountKey: String(account.id),
          onCookieUpdate: async (newCookie) => {
            await this.accountsService.updateCookieIfChanged(
              account.id,
              newCookie,
            );
          },
        },
      );
      imSent = true;

      // IM 发送成功后立即写日志，防止崩溃后重复发卡
      await this.writeLog(
        order,
        product,
        kamiItemId,
        content,
        'success',
        null,
        start,
      );

      if (
        useGoofish &&
        this.config.get<boolean>('delivery.confirmEnabled', false)
      ) {
        try {
          const confirm = await this.goofishMtop.confirmVirtualShip(
            cookie,
            order.bizOrderId,
          );
          if (confirm.cookie !== cookie) {
            await this.accountsService.updateCookieIfChanged(
              account.id,
              confirm.cookie,
            );
          }
          this.logger.log(`订单 ${order.bizOrderId} 已确认发货（闲鱼侧）`);
        } catch (confirmErr) {
          this.logger.warn(
            `订单 ${order.bizOrderId} 确认发货失败（IM 已发送）: ${(confirmErr as Error).message}`,
          );
        }
      }

      if (kamiItemId) {
        await this.kamiPoolService.confirmItem(kamiItemId);
      }
      await this.ordersService.markDelivered(order.id);

      return { success: true, message: '发货成功' };
    } catch (err) {
      const errorMsg = (err as Error).message || '未知错误';
      await handleAccountAuthError(
        this.accountsService,
        account.id,
        err,
      );
      if (imSent) {
        // IM 已发送 + success 日志已写入 → 不释放卡密，由 recoverStuckOrders 兜底完成
        this.logger.warn(
          `订单 ${order.bizOrderId} IM 已发送但后续流程异常: ${errorMsg}`,
        );
      } else {
        await this.failWithLog(order, product, kamiItemId, errorMsg, start);
      }
      return { success: false, message: errorMsg };
    }
  }

  /** 手动重试发货：入队走队列，保持账号串行 */
  async retryDeliver(
    orderId: number,
    tenantId: number,
  ): Promise<{ success: boolean; message: string }> {
    // 先重置订单状态
    await this.ordersService.retryOrder(orderId, tenantId);

    const jobId = `delivery:${orderId}`;
    // 如果队列中已有同订单任务，不重复入队
    const existing = await this.deliveryQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        return { success: true, message: '任务已在队列中' };
      }
    }

    await this.deliveryQueue.add(
      { orderId, tenantId },
      { jobId, attempts: 1, removeOnComplete: 100, removeOnFail: 50 },
    );
    return { success: true, message: '已重新入队' };
  }

  /**
   * 恢复卡在 DELIVERING 的订单：
   * - 已有 success 日志 → 补完成状态
   * - 否则释放卡密锁并重置为 PENDING 供重试
   */
  async recoverStuckOrders(): Promise<number> {
    const stuck = await this.ordersService.getStuckDeliveringOrders(
      this.STUCK_DELIVERING_MINUTES,
      10,
    );
    if (stuck.length === 0) return 0;

    let recovered = 0;
    for (const order of stuck) {
      const successLog = await this.findSuccessLog(order.id);
      if (successLog) {
        await this.finalizeSuccessfulDelivery(order, successLog);
        this.logger.log(
          `恢复卡住订单 ${order.bizOrderId}: 消息已发送，补标记 DELIVERED`,
        );
      } else {
        const released = await this.kamiPoolService.releaseByOrderId(order.id);
        await this.ordersService.resetDeliveringToPending(order.id);
        this.logger.warn(
          `恢复卡住订单 ${order.bizOrderId}: 重置为 PENDING（释放卡密 ${released} 条）`,
        );
      }
      recovered++;
    }
    return recovered;
  }

  private async finalizeSuccessfulDelivery(
    order: OrderEntity,
    log: DeliveryLogEntity,
  ): Promise<void> {
    if (order.status === 'DELIVERED') return;

    if (log.kamiItemId) {
      await this.kamiPoolService.confirmItem(log.kamiItemId);
    }
    await this.ordersService.markDelivered(order.id);
  }

  private async findSuccessLog(
    orderId: number,
  ): Promise<DeliveryLogEntity | null> {
    return this.logRepo.findOne({
      where: { orderId, result: 'success' },
      order: { createdAt: 'DESC' },
    });
  }

  private async prepareContent(
    product: ProductEntity,
    order: OrderEntity,
  ): Promise<{ content: string | null; kamiItemId: number | null }> {
    switch (product.deliveryType as DeliveryType) {
      case 'kami': {
        if (!product.kamiPoolId) return { content: null, kamiItemId: null };
        const kamiItem = await this.kamiPoolService.acquireItem(
          product.kamiPoolId,
          order.id,
          order.tenantId,
        );
        if (!kamiItem) return { content: null, kamiItemId: null };
        const text = [
          kamiItem.content,
          ...(product.remark ? [`\n---\n${product.remark}`] : []),
        ].join('');
        return { content: text, kamiItemId: kamiItem.id };
      }

      case 'link':
      case 'text': {
        const text = [
          product.fixedContent || '',
          ...(product.remark ? [`\n---\n${product.remark}`] : []),
        ].join('');
        return { content: text, kamiItemId: null };
      }

      case 'license': {
        // 动态申请激活码：付款触发时向激活码中台生成一个码。
        // 无需 lock/confirm（动态生成不会超发），生成失败走 markFailed。
        if (!product.licenseTypeCode) {
          return { content: null, kamiItemId: null };
        }
        const licenseCode = await this.licenseService.requestForDelivery(
          product.licenseTypeCode,
          order.tenantId,
          order.id,
        );
        if (!licenseCode) {
          return { content: null, kamiItemId: null };
        }
        const text = [
          licenseCode,
          ...(product.remark ? [`\n---\n${product.remark}`] : []),
        ].join('');
        return { content: text, kamiItemId: null };
      }

      default:
        return { content: null, kamiItemId: null };
    }
  }

  private async failWithLog(
    order: OrderEntity,
    product: ProductEntity,
    kamiItemId: number | null,
    errorMsg: string,
    startTime: number,
  ): Promise<void> {
    if (kamiItemId) {
      await this.kamiPoolService.releaseItem(kamiItemId);
    }

    if (order.retryCount < this.MAX_RETRIES) {
      const delayMs = Math.pow(2, order.retryCount) * 10000;
      const nextRetryAt = new Date(Date.now() + delayMs);
      await this.ordersService.incrementRetry(order.id, nextRetryAt);
      await this.writeLog(
        order,
        product,
        kamiItemId,
        null,
        'failed',
        errorMsg,
        startTime,
      );
      this.logger.warn(
        `订单 ${order.bizOrderId} 发货失败，${delayMs / 1000}s 后重试 (${order.retryCount + 1}/${this.MAX_RETRIES}): ${errorMsg}`,
      );
    } else {
      const failReason = `重试 ${this.MAX_RETRIES} 次仍失败: ${errorMsg}`;
      await this.ordersService.markFailed(order.id, failReason);
      await this.writeLog(
        order,
        product,
        kamiItemId,
        null,
        'failed',
        errorMsg,
        startTime,
      );
      this.logger.error(`订单 ${order.bizOrderId} 最终失败: ${errorMsg}`);

      // 告警：最终失败
      if (this.config.get<boolean>('alert.onFinalFailure', true)) {
        this.alertService.send({
          title: '发货最终失败',
          text: [
            `**订单号**: ${order.bizOrderId}`,
            `**商品**: ${order.itemTitle || '-'}`,
            `**账号**: ${order.accountId}`,
            `**原因**: ${errorMsg}`,
            `**时间**: ${new Date().toLocaleString('zh-CN')}`,
          ].join('\n\n'),
          severity: 'error',
          tenantId: order.tenantId,
        });
      }
    }
  }

  private async writeLog(
    order: OrderEntity,
    product: ProductEntity,
    kamiItemId: number | null,
    payload: string | null,
    result: 'success' | 'failed',
    error: string | null,
    startTime: number,
  ): Promise<void> {
    const log = this.logRepo.create({
      tenantId: order.tenantId,
      orderId: order.id,
      deliveryType: product.deliveryType,
      payload,
      kamiItemId,
      result,
      error,
      durationMs: Date.now() - startTime,
    });
    await this.logRepo.save(log);

    // 实时推送发货结果到前端
    this.realtime.pushDeliveryResult(order.tenantId, {
      orderId: order.id,
      result,
      deliveryType: product.deliveryType,
      durationMs: Date.now() - startTime,
    });
  }
}
