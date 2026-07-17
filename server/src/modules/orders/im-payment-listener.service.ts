import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AccountsService } from '../accounts/accounts.service';
import { OrdersService } from './orders.service';
import { ImWebSocketService } from '../../goofish/im-websocket.service';
import { GoofishMtopService } from '../../goofish/goofish-mtop.service';
import {
  PaymentMessageEvent,
  RefundMessageEvent,
  ChatMessageEvent,
} from '../../goofish/goofish-ws-message.util';
import { handleAccountAuthError } from '../accounts/account-auth.util';
import { isGoofishCaptchaChallenge } from '../../goofish/goofish-error.util';
import { AlertService } from '../alert/alert.service';
import { AutoReplyService } from '../auto-reply/auto-reply.service';

/**
 * WS 付款消息监听（可选加速）。
 *
 * 自动发货主路径是订单轮询（sold.get → PENDING → 发货队列）。
 * WS 需要 login.token；遇 USER_VALIDATE 时长退避，避免每分钟撞风控，
 * 期间仍靠轮询建单发货。
 */
@Injectable()
export class ImPaymentListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPaymentListenerService.name);
  private readonly activeAccountIds = new Set<number>();
  /** 风控退避：accountId -> 下次允许重连时间戳 */
  private readonly captchaBackoffUntil = new Map<number, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly accountsService: AccountsService,
    private readonly ordersService: OrdersService,
    private readonly imWs: ImWebSocketService,
    private readonly goofishMtop: GoofishMtopService,
    private readonly alertService: AlertService,
    private readonly autoReplyService: AutoReplyService,
  ) {}

  private get enabled(): boolean {
    if (this.config.get<string>('sign.provider') !== 'goofish') return false;
    return this.config.get<boolean>('im.paymentListenEnabled', true);
  }

  private get captchaBackoffMs(): number {
    return this.config.get<number>('im.captchaBackoffMs', 1_800_000);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        'WS 付款监听未启用；自动发货依赖订单轮询（ORDER_POLL_ENABLED）',
      );
      return;
    }
    this.logger.log(
      'WS 付款监听已开启（可选加速）；建单主路径仍是订单轮询',
    );
    await this.syncListeners();
  }

  onModuleDestroy(): void {
    for (const id of [...this.activeAccountIds]) {
      this.imWs.stopPaymentListener(String(id));
    }
    this.activeAccountIds.clear();
  }

  /** 每分钟同步；风控账号按退避跳过，不每分钟打 login.token */
  @Cron('0 * * * * *')
  async syncListenersCron(): Promise<void> {
    if (!this.enabled) return;
    await this.syncListeners();
  }

  async syncListeners(): Promise<void> {
    const accounts = await this.accountsService.listAllEnabled();
    const targetIds = new Set(accounts.map((a) => a.id));

    for (const id of this.activeAccountIds) {
      if (!targetIds.has(id)) {
        this.imWs.stopPaymentListener(String(id));
        this.activeAccountIds.delete(id);
        this.logger.log(`账号 ${id} 已停用，停止 WS 监听`);
      }
    }

    for (const account of accounts) {
      if (this.activeAccountIds.has(account.id)) {
        if (this.imWs.isListenerActive(String(account.id))) continue;
        this.imWs.stopPaymentListener(String(account.id));
        this.activeAccountIds.delete(account.id);
      }

      if (this.activeAccountIds.has(account.id)) continue;

      const backoffUntil = this.captchaBackoffUntil.get(account.id) || 0;
      if (Date.now() < backoffUntil) {
        continue;
      }

      try {
        const cookie = this.accountsService.decryptCookie(account);
        await this.imWs.startPaymentListener({
          accountKey: String(account.id),
          cookie,
          onCookieUpdate: async (newCookie) => {
            await this.accountsService.updateCookieIfChanged(account.id, newCookie);
          },
          onAuthError: async (err) => {
            await handleAccountAuthError(
              this.accountsService,
              account.id,
              err,
            );
            this.activeAccountIds.delete(account.id);
            if (isGoofishCaptchaChallenge(err)) {
              this.markCaptchaBackoff(account.id);
            }
          },
          onPaymentMessage: (event) =>
            this.handlePaymentMessage(
              account.id,
              account.tenantId,
              event,
              cookie,
            ),
          onRefundMessage: (event) =>
            this.handleRefundMessage(
              account.id,
              account.tenantId,
              event,
            ),
          onChatMessage: (event) =>
            this.handleChatMessage(
              account.id,
              account.tenantId,
              event,
              cookie,
            ),
        });
        this.activeAccountIds.add(account.id);
        this.captchaBackoffUntil.delete(account.id);
      } catch (err) {
        await handleAccountAuthError(
          this.accountsService,
          account.id,
          err,
        );
        const msg = (err as Error).message;
        if (isGoofishCaptchaChallenge(err)) {
          this.markCaptchaBackoff(account.id);
          const mins = Math.ceil(this.captchaBackoffMs / 60_000);
          this.logger.warn(
            `账号 ${account.id} WS 暂不可用（login.token 风控），${mins} 分钟内不再重连；` +
              `自动发货继续走订单轮询。${msg}`,
          );
        } else {
          this.logger.error(
            `账号 ${account.id} 启动 WS 监听失败: ${msg}`,
          );
        }
      }
    }
  }

  private markCaptchaBackoff(accountId: number): void {
    const until = Date.now() + this.captchaBackoffMs;
    this.captchaBackoffUntil.set(accountId, until);
  }

  private async handlePaymentMessage(
    accountId: number,
    tenantId: number,
    event: PaymentMessageEvent,
    cookie: string,
  ): Promise<void> {
    let itemTitle = event.itemId || '闲鱼商品';
    let amount: number | undefined;
    let quantity = 1;
    let specName: string | undefined;
    let specValue: string | undefined;
    let receiverName: string | undefined;
    let receiverPhone: string | undefined;
    let receiverAddress: string | undefined;
    let workingCookie = cookie;

    try {
      const detail = await this.goofishMtop.fetchOrderDetail(
        workingCookie,
        event.bizOrderId,
      );
      workingCookie = detail.cookie;
      await this.accountsService.updateCookieIfChanged(accountId, workingCookie);
      if (detail.itemTitle) itemTitle = detail.itemTitle;
      if (detail.amount != null) amount = detail.amount;
      if (detail.itemId) event.itemId = detail.itemId;
      if (detail.buyerId) event.buyerId = detail.buyerId;
      if (detail.buyerNick) event.buyerNick = detail.buyerNick;
      if (detail.quantity && detail.quantity > 0) quantity = detail.quantity;
      if (detail.specName) specName = detail.specName;
      if (detail.specValue) specValue = detail.specValue;
      if (detail.receiverName) receiverName = detail.receiverName;
      if (detail.receiverPhone) receiverPhone = detail.receiverPhone;
      if (detail.receiverAddress) receiverAddress = detail.receiverAddress;
    } catch (e) {
      this.logger.warn(
        `订单 ${event.bizOrderId} 详情拉取失败: ${(e as Error).message}`,
      );
    }

    const { created } = await this.ordersService.createIfNotExists({
      tenantId,
      accountId,
      bizOrderId: event.bizOrderId,
      itemId: event.itemId || 'unknown',
      itemTitle,
      buyerNick: event.buyerNick,
      buyerId: event.buyerId,
      conversationId: event.conversationId || undefined,
      amount,
      quantity,
      specName,
      specValue,
      receiverName,
      receiverPhone,
      receiverAddress,
      orderCreatedAt: new Date(),
    });

    if (created) {
      this.logger.log(
        `WS 付款建单: ${event.bizOrderId} (${itemTitle}) qty=${quantity} buyer=${event.buyerId || 'pending'}`,
      );
    }
  }

  /**
   * 处理退款消息：把订单标记为 REFUNDING / REFUNDED 并推告警。
   * 退款订单不会卡密回收（避免卡密被重复使用）。
   */
  private async handleRefundMessage(
    accountId: number,
    tenantId: number,
    event: RefundMessageEvent,
  ): Promise<void> {
    this.logger.log(
      `WS 退款消息: order=${event.bizOrderId} done=${event.done} content=${event.content}`,
    );

    const order = await this.ordersService.findByBizOrderId(event.bizOrderId);
    if (!order) {
      // 退款消息可能先于付款建单到达（罕见），记录告警即可
      this.logger.warn(
        `退款消息无对应订单: ${event.bizOrderId}，跳过状态更新`,
      );
      return;
    }

    if (event.done) {
      await this.ordersService.markRefunded(order.id);
    } else {
      await this.ordersService.markRefunding(order.id, event.content);
    }

    // 推送告警通知人工关注
    await this.alertService.send({
      title: event.done ? '订单已退款' : '买家申请退款',
      text: `订单 ${event.bizOrderId}（${order.itemTitle}）\n买家：${order.buyerNick || event.buyerId || '-'}\n消息：${event.content}`,
      severity: 'warn',
      tenantId,
    });
  }

  /**
   * 处理普通聊天消息：转交自动回复引擎（关键词/默认/AI）。
   * 由 im-websocket 的 onChatMessage 回调触发。
   * cookie 用于发送回复（可能被续期）。
   */
  private async handleChatMessage(
    accountId: number,
    tenantId: number,
    event: ChatMessageEvent,
    cookie: string,
  ): Promise<void> {
    await this.autoReplyService.handle(accountId, tenantId, event, cookie);
  }
}
