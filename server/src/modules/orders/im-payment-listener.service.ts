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
} from '../../goofish/goofish-ws-message.util';
import { handleAccountAuthError } from '../accounts/account-auth.util';
import { AlertService } from '../alert/alert.service';

/**
 * WS 付款消息监听器。
 *
 * 参考 xianyu-auto-reply：买家付款后 IM 会推送
 * 「[我已付款，等待你发货]」等系统消息，比轮询更快。
 *
 * 同时监听退款消息（[买家申请退款] / [退款成功...]），
 * 被动感知退款事件并更新订单状态（不主动处置退款）。
 */
@Injectable()
export class ImPaymentListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPaymentListenerService.name);
  private readonly activeAccountIds = new Set<number>();

  constructor(
    private readonly config: ConfigService,
    private readonly accountsService: AccountsService,
    private readonly ordersService: OrdersService,
    private readonly imWs: ImWebSocketService,
    private readonly goofishMtop: GoofishMtopService,
    private readonly alertService: AlertService,
  ) {}

  private get enabled(): boolean {
    if (this.config.get<string>('sign.provider') !== 'goofish') return false;
    return this.config.get<boolean>('im.paymentListenEnabled', true);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('WS 付款监听未启用（需 SIGN_PROVIDER=goofish）');
      return;
    }
    await this.syncListeners();
  }

  onModuleDestroy(): void {
    for (const id of [...this.activeAccountIds]) {
      this.imWs.stopPaymentListener(String(id));
    }
    this.activeAccountIds.clear();
  }

  /** 每分钟同步账号列表：新账号启动监听，禁用账号停止 */
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
        });
        this.activeAccountIds.add(account.id);
      } catch (err) {
        await handleAccountAuthError(
          this.accountsService,
          account.id,
          err,
        );
        this.logger.error(
          `账号 ${account.id} 启动 WS 监听失败: ${(err as Error).message}`,
        );
      }
    }
  }

  private async handlePaymentMessage(
    accountId: number,
    tenantId: number,
    event: PaymentMessageEvent,
    cookie: string,
  ): Promise<void> {
    let itemTitle = event.itemId || '闲鱼商品';
    let amount: number | undefined;
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
      orderCreatedAt: new Date(),
    });

    if (created) {
      this.logger.log(`WS 付款建单: ${event.bizOrderId} (${itemTitle})`);
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
}
