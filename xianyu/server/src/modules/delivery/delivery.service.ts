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
import { globalRiskGuard } from '../../common/utils/risk-control.util';

/**
 * 发货执行引擎。
 *
 * P0 保障：
 * - 无 buyerId 不发货、不消耗卡密
 * - IM 发送成功后立即写 success 日志，重试时不再重复发送
 * - recoverStuckOrders 恢复卡在 DELIVERING 的订单
 * - 账号级风控：最小间隔 + 抖动 + 滑动窗口 + 发货冷却
 * - 支持延时发货 / 多数量 / 多规格匹配
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

  async processOrder(
    order: OrderEntity,
    options: { forceResend?: boolean } = {},
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const start = Date.now();

    if (order.status === 'DELIVERED' && !options.forceResend) {
      return { success: true, message: '订单已发货' };
    }

    // 退款中/已退款不再发货
    if (order.status === 'REFUNDING' || order.status === 'REFUNDED') {
      return { success: false, message: `订单状态 ${order.status}，跳过发货` };
    }

    const priorSuccess = await this.findSuccessLog(order.id);
    if (priorSuccess && !options.forceResend) {
      await this.finalizeSuccessfulDelivery(order, priorSuccess);
      return { success: true, message: '订单已发货（幂等恢复）' };
    }

    // 订单级冷却（防重复触发；手动强制补发跳过）
    if (!options.forceResend && !globalRiskGuard.canDeliverOrder(order.bizOrderId)) {
      const cooldownUntil = new Date(Date.now() + 60_000);
      await this.ordersService.deferUntil(
        order.id,
        cooldownUntil,
        '订单在发货冷却期，稍后自动重试',
      );
      this.logger.warn(`订单 ${order.bizOrderId} 在发货冷却期，已延后`);
      return { success: false, message: '订单在发货冷却期' };
    }

    const account = await this.accountsService
      .listEnabled(order.tenantId)
      .then((list) => list.find((a) => a.id === order.accountId));

    if (!account) {
      await this.ordersService.markFailed(order.id, '关联的闲鱼账号不存在或已禁用');
      return { success: false, message: '闲鱼账号不可用' };
    }

    let cookie = this.accountsService.decryptCookie(account);
    const useGoofish =
      this.config.get<string>('sign.provider') === 'goofish';

    // 补全 buyerId / 数量 / 规格 / 会话（goofish 模式尽量拉详情）
    let buyerId = order.buyerId;
    let buyerNick = order.buyerNick;
    let quantity = Math.max(1, order.quantity || 1);
    let matchedProduct = await this.productsService.findMatchingRule(
      order.tenantId,
      order.itemId,
      order.accountId,
      order.specName,
      order.specValue,
    );

    const needDetail =
      useGoofish &&
      (!buyerId ||
        !order.conversationId ||
        !order.specName ||
        !order.specValue ||
        quantity <= 1 ||
        !order.itemId ||
        order.itemId === 'unknown');

    if (needDetail) {
      try {
        await globalRiskGuard.waitTurn(account.id);
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
        }
        const patch: Partial<OrderEntity> = {};
        if (detail.buyerId) {
          patch.buyerId = detail.buyerId;
          patch.buyerNick = detail.buyerNick ?? buyerNick ?? null;
        }
        if (detail.itemId && (!order.itemId || order.itemId === 'unknown')) {
          patch.itemId = detail.itemId;
          order.itemId = detail.itemId;
        }
        if (detail.itemTitle) {
          patch.itemTitle = detail.itemTitle;
        }
        if (detail.quantity && detail.quantity > 0) {
          quantity = detail.quantity;
          patch.quantity = detail.quantity;
        }
        if (detail.specName) {
          patch.specName = detail.specName;
          order.specName = detail.specName;
        }
        if (detail.specValue) {
          patch.specValue = detail.specValue;
          order.specValue = detail.specValue;
        }
        if (detail.receiverName) patch.receiverName = detail.receiverName;
        if (detail.receiverPhone) patch.receiverPhone = detail.receiverPhone;
        if (detail.receiverAddress) patch.receiverAddress = detail.receiverAddress;
        if (Object.keys(patch).length > 0) {
          await this.ordersService.patchOrderFields(order.id, patch);
          if (patch.buyerId) {
            buyerId = patch.buyerId;
          }
        }

        // 补全规格/商品后重新匹配规则
        matchedProduct = await this.productsService.findMatchingRule(
          order.tenantId,
          order.itemId,
          order.accountId,
          order.specName,
          order.specValue,
        );
      } catch (e) {
        this.logger.warn(
          `订单 ${order.bizOrderId} 拉取详情补全失败: ${(e as Error).message}`,
        );
      }
    }

    const product = matchedProduct;
    if (!product || !product.enabled) {
      await this.ordersService.markIgnored(
        order.id,
        '无匹配的发货规则或规则已禁用',
      );
      return { success: false, message: '无匹配发货规则' };
    }

    if (!buyerId) {
      await this.failWithLog(
        order,
        product,
        [],
        '缺少买家 ID，无法发送 IM 消息',
        start,
      );
      return { success: false, message: '缺少买家 ID' };
    }

    // 延时发货：不阻塞 worker，用 nextRetryAt 延后调度（带小抖动）
    if (product.delaySeconds > 0 && !options.forceResend) {
      const baseTime = order.orderCreatedAt || order.createdAt || new Date();
      const readyAtMs =
        new Date(baseTime).getTime() + product.delaySeconds * 1000;
      const jitterMs = Math.round(product.delaySeconds * 100 * Math.random());
      if (Date.now() < readyAtMs + jitterMs) {
        const readyAt = new Date(readyAtMs + jitterMs);
        await this.ordersService.deferUntil(
          order.id,
          readyAt,
          `延时发货等待中（${product.delaySeconds}s）`,
        );
        this.logger.log(
          `订单 ${order.bizOrderId} 延时发货，将于 ${readyAt.toISOString()} 后再处理`,
        );
        return { success: false, message: '延时发货等待中' };
      }
    }
    // 短思考延迟，避免“秒回秒发”触发风控
    await globalRiskGuard.humanDeliveryDelay(600, 1800);

    // 多数量：仅 kami/license 有意义；link/text 仍发 1 次
    const sendCount =
      product.multiQuantity &&
      (product.deliveryType === 'kami' || product.deliveryType === 'license')
        ? Math.min(Math.max(1, quantity), 20) // 硬上限 20，防误配炸库存
        : 1;

    const preparedList: Array<{
      content: string;
      kamiItemId: number | null;
    }> = [];

    for (let i = 0; i < sendCount; i++) {
      const prepared = await this.prepareContent(product, order, i, sendCount);
      if (!prepared.content) {
        // 释放已锁定卡密
        for (const p of preparedList) {
          if (p.kamiItemId) {
            await this.kamiPoolService.releaseItem(p.kamiItemId);
          }
        }
        const reason = prepared.failReason || '准备发货内容失败';
        await this.ordersService.markFailed(order.id, reason);
        return { success: false, message: reason };
      }
      preparedList.push({
        content: prepared.content,
        kamiItemId: prepared.kamiItemId,
      });
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
    const kamiIds = preparedList
      .map((p) => p.kamiItemId)
      .filter((id): id is number => id != null);

    try {
      // 账号级风控锁：串行 + 间隔 + 滑动窗口
      await globalRiskGuard.withAccountLock(account.id, async () => {
        for (let i = 0; i < preparedList.length; i++) {
          const item = preparedList[i];
          await this.messageApi.sendTextMessage(
            ctx,
            buyerId!,
            order.bizOrderId,
            item.content,
            {
              conversationId: order.conversationId,
              itemId: order.itemId,
              accountKey: String(account.id),
              onCookieUpdate: async (newCookie) => {
                await this.accountsService.updateCookieIfChanged(
                  account.id,
                  newCookie,
                );
                ctx.cookie = newCookie;
              },
            },
          );
          imSent = true;
          if (i < preparedList.length - 1) {
            await globalRiskGuard.multiItemGap();
          }
        }
      });

      // IM 发送成功后立即写日志，防止崩溃后重复发卡
      const combined = preparedList.map((p) => p.content).join('\n---\n');
      await this.writeLog(
        order,
        product,
        kamiIds[0] ?? null,
        combined,
        'success',
        null,
        start,
      );

      globalRiskGuard.markDelivered(order.bizOrderId);

      // 确认发货：全局开关 或 账号级 autoConfirm（参考 super-butler）
      const shouldConfirm =
        useGoofish &&
        (this.config.get<boolean>('delivery.confirmEnabled', false) ||
          !!account.autoConfirm);
      if (shouldConfirm) {
        try {
          // 确认发货与 IM 间隔，降低风控
          await globalRiskGuard.waitTurn(account.id);
          await globalRiskGuard.humanDeliveryDelay(400, 1200);
          const confirm = await this.goofishMtop.confirmVirtualShip(
            ctx.cookie,
            order.bizOrderId,
          );
          if (confirm.cookie !== ctx.cookie) {
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

      for (const id of kamiIds) {
        await this.kamiPoolService.confirmItem(id);
      }
      await this.ordersService.markDelivered(order.id);

      return {
        success: true,
        message:
          sendCount > 1 ? `发货成功（共 ${sendCount} 份）` : '发货成功',
      };
    } catch (err) {
      const errorMsg = (err as Error).message || '未知错误';
      await handleAccountAuthError(
        this.accountsService,
        account.id,
        err,
      );
      if (imSent) {
        // IM 已发送 + success 日志可能已写 → 不释放卡密
        this.logger.warn(
          `订单 ${order.bizOrderId} IM 已发送但后续流程异常: ${errorMsg}`,
        );
        // 若 success 日志尚未写（中途异常），补写
        const ok = await this.findSuccessLog(order.id);
        if (!ok) {
          await this.writeLog(
            order,
            product,
            kamiIds[0] ?? null,
            preparedList.map((p) => p.content).join('\n---\n'),
            'success',
            `IM已发送但后续异常: ${errorMsg}`,
            start,
          );
        }
        for (const id of kamiIds) {
          await this.kamiPoolService.confirmItem(id);
        }
        await this.ordersService.markDelivered(order.id);
        globalRiskGuard.markDelivered(order.bizOrderId);
      } else {
        await this.failWithLog(order, product, kamiIds, errorMsg, start);
      }
      return { success: false, message: errorMsg };
    }
  }

  /**
   * 手动完整发货（匹配规则 + 发卡密 + IM）。
   * mode=status_only 时只确认闲鱼发货状态，不消耗卡密。
   */
  async manualShip(
    orderId: number,
    tenantId: number,
    mode: 'full' | 'status_only' = 'full',
  ): Promise<{ success: boolean; message: string }> {
    const order = await this.ordersService.findByIdForTenant(orderId, tenantId);
    if (!order) {
      return { success: false, message: '订单不存在' };
    }

    if (mode === 'status_only') {
      const account = await this.accountsService
        .listEnabled(tenantId)
        .then((list) => list.find((a) => a.id === order.accountId));
      if (!account) {
        return { success: false, message: '账号不可用' };
      }
      if (this.config.get<string>('sign.provider') !== 'goofish') {
        return { success: false, message: '仅 goofish 模式支持确认发货' };
      }
      try {
        const cookie = this.accountsService.decryptCookie(account);
        await globalRiskGuard.withAccountLock(account.id, async () => {
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
        });
        if (order.status !== 'DELIVERED') {
          await this.ordersService.markDelivered(order.id);
        }
        return { success: true, message: '已仅修改闲鱼发货状态' };
      } catch (e) {
        return { success: false, message: (e as Error).message };
      }
    }

    // full: 重置后发货；已发货订单允许强制补发（会再次消耗卡密）
    if (order.status === 'DELIVERING') {
      return { success: false, message: '订单正在发货中，请稍后再试' };
    }

    const forceResend = order.status === 'DELIVERED';
    if (['FAILED', 'IGNORED', 'PENDING'].includes(order.status)) {
      await this.ordersService.retryOrder(orderId, tenantId);
    } else if (forceResend) {
      await this.ordersService.forceResetForManualShip(orderId);
    }

    const reloaded = await this.ordersService.findByIdForTenant(orderId, tenantId);
    if (!reloaded) return { success: false, message: '订单不存在' };

    // 手动发货同步执行，避免队列 jobId 去重挡住补发
    return this.processOrder(reloaded, { forceResend });
  }

  /** 手动重试发货：入队走队列，保持账号串行 */
  async retryDeliver(
    orderId: number,
    tenantId: number,
  ): Promise<{ success: boolean; message: string }> {
    await this.ordersService.retryOrder(orderId, tenantId);

    const jobId = `delivery:${orderId}:${Date.now()}`;
    // 清理旧 job 去重键，允许手动重试
    const existing = await this.deliveryQueue.getJob(`delivery:${orderId}`);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        return { success: true, message: '任务已在队列中' };
      }
      try {
        await existing.remove();
      } catch {
        /* ignore */
      }
    }

    await this.deliveryQueue.add(
      { orderId, tenantId },
      {
        jobId: `delivery:${orderId}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
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
    index = 0,
    total = 1,
  ): Promise<{ content: string | null; kamiItemId: number | null; failReason?: string }> {
    const remarkSuffix =
      product.remark && index === total - 1 ? `\n---\n${product.remark}` : '';

    switch (product.deliveryType as DeliveryType) {
      case 'kami': {
        if (!product.kamiPoolId) {
          return { content: null, kamiItemId: null, failReason: '未绑定卡密池' };
        }
        const kamiItem = await this.kamiPoolService.acquireItem(
          product.kamiPoolId,
          order.id,
          order.tenantId,
        );
        if (!kamiItem) {
          return {
            content: null,
            kamiItemId: null,
            failReason:
              total > 1
                ? `卡密池库存不足（需要 ${total} 份，第 ${index + 1} 份失败）`
                : '卡密池库存不足',
          };
        }
        const prefix = total > 1 ? `【${index + 1}/${total}】\n` : '';
        return {
          content: `${prefix}${kamiItem.content}${remarkSuffix}`,
          kamiItemId: kamiItem.id,
        };
      }

      case 'link':
      case 'text': {
        if (!product.fixedContent?.trim()) {
          return { content: null, kamiItemId: null, failReason: '未配置固定发货内容' };
        }
        return {
          content: `${product.fixedContent}${remarkSuffix}`,
          kamiItemId: null,
        };
      }

      case 'license': {
        if (!product.licenseTypeCode) {
          return { content: null, kamiItemId: null, failReason: '未配置激活码类型' };
        }
        const licenseCode = await this.licenseService.requestForDelivery(
          product.licenseTypeCode,
          order.tenantId,
          order.id,
        );
        if (!licenseCode) {
          return {
            content: null,
            kamiItemId: null,
            failReason: `激活码分配失败（类型 ${product.licenseTypeCode} 不存在、已禁用或不可用）`,
          };
        }
        const prefix = total > 1 ? `【${index + 1}/${total}】\n` : '';
        const body = [
          licenseCode,
          ...(product.fixedContent ? [`\n---\n${product.fixedContent}`] : []),
        ].join('');
        return {
          content: `${prefix}${body}${remarkSuffix}`,
          kamiItemId: null,
        };
      }

      default:
        return { content: null, kamiItemId: null, failReason: '未知发货方式' };
    }
  }

  private async failWithLog(
    order: OrderEntity,
    product: ProductEntity,
    kamiItemIds: number[],
    errorMsg: string,
    startTime: number,
  ): Promise<void> {
    for (const id of kamiItemIds) {
      await this.kamiPoolService.releaseItem(id);
    }

    // 最多 MAX_RETRIES 次尝试：当前为第 (retryCount+1) 次，失败后若已达上限则终态
    const attemptNo = order.retryCount + 1;
    if (attemptNo < this.MAX_RETRIES) {
      // 指数退避 + 抖动，避免整点齐发
      const base = Math.pow(2, order.retryCount) * 10000;
      const delayMs = Math.round(base * (0.8 + Math.random() * 0.4));
      const nextRetryAt = new Date(Date.now() + delayMs);
      await this.ordersService.incrementRetry(order.id, nextRetryAt);
      await this.writeLog(
        order,
        product,
        kamiItemIds[0] ?? null,
        null,
        'failed',
        errorMsg,
        startTime,
      );
      this.logger.warn(
        `订单 ${order.bizOrderId} 发货失败，${Math.round(delayMs / 1000)}s 后重试 (${attemptNo}/${this.MAX_RETRIES}): ${errorMsg}`,
      );
    } else {
      const failReason = `重试 ${this.MAX_RETRIES} 次仍失败: ${errorMsg}`;
      await this.ordersService.markFailed(order.id, failReason);
      await this.writeLog(
        order,
        product,
        kamiItemIds[0] ?? null,
        null,
        'failed',
        errorMsg,
        startTime,
      );
      this.logger.error(`订单 ${order.bizOrderId} 最终失败: ${errorMsg}`);

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

    this.realtime.pushDeliveryResult(order.tenantId, {
      orderId: order.id,
      result,
      deliveryType: product.deliveryType,
      durationMs: Date.now() - startTime,
    });
  }
}
