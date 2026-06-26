import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AccountsService } from '../accounts/accounts.service';
import { OrdersService } from './orders.service';
import { OrderApi } from '../../xianyu/apis/order.api';
import { GoofishMtopService } from '../../goofish/goofish-mtop.service';
import { GOOFISH_UA } from '../../goofish/goofish.constants';
import { handleAccountAuthError } from '../accounts/account-auth.util';

@Injectable()
export class OrderPollingService {
  private readonly logger = new Logger(OrderPollingService.name);
  private lastPollAt = 0;
  private mockCounter = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly accountsService: AccountsService,
    private readonly ordersService: OrdersService,
    private readonly orderApi: OrderApi,
    private readonly goofishMtop: GoofishMtopService,
  ) {}

  private get mockMode(): boolean {
    return this.config.get<boolean>('order.mockMode', false);
  }

  private get useGoofish(): boolean {
    return this.config.get<string>('sign.provider') === 'goofish';
  }

  private get pollIntervalMs(): number {
    return this.config.get<number>('order.pollIntervalMs', 15000);
  }

  /** 按 ORDER_POLL_INTERVAL_MS 轮询（每秒检查一次是否到点） */
  @Interval(1000)
  async pollOrdersTick() {
    const now = Date.now();
    if (now - this.lastPollAt < this.pollIntervalMs) return;
    this.lastPollAt = now;
    await this.pollOrders();
  }

  async pollOrders() {
    if (this.mockMode) {
      await this.generateMockOrder();
      return;
    }

    if (!this.useGoofish) {
      this.logger.warn(
        '真实订单拉取需要 SIGN_PROVIDER=goofish，当前未启用',
      );
      return;
    }

    const accounts = await this.getAllEnabledAccounts();
    for (const account of accounts) {
      try {
        let cookie = this.accountsService.decryptCookie(account);
        const { orders, cookie: updatedCookie } =
          await this.orderApi.fetchSoldOrders(
            {
              cookie,
              appKey: '34839810',
              userAgent: GOOFISH_UA,
            },
            1,
            30,
          );

        if (updatedCookie && updatedCookie !== cookie) {
          await this.accountsService.updateCookieIfChanged(
            account.id,
            updatedCookie,
          );
          cookie = updatedCookie;
        }

        for (const o of orders) {
          let buyerId = o.buyerId;
          let buyerNick = o.buyerNick;

          if (!buyerId) {
            try {
              const detail = await this.goofishMtop.fetchOrderDetail(
                cookie,
                o.bizOrderId,
              );
              if (detail.cookie !== cookie) {
                await this.accountsService.updateCookieIfChanged(
                  account.id,
                  detail.cookie,
                );
                cookie = detail.cookie;
              }
              buyerId = detail.buyerId;
              buyerNick = detail.buyerNick ?? buyerNick;
            } catch (e) {
              this.logger.warn(
                `订单 ${o.bizOrderId} 补 buyerId 失败: ${(e as Error).message}`,
              );
            }
          }

          if (!buyerId) {
            this.logger.warn(
              `订单 ${o.bizOrderId} 缺少 buyerId，跳过入库（发货阶段会再次尝试）`,
            );
            continue;
          }

          const { created, order } = await this.ordersService.createIfNotExists({
            tenantId: account.tenantId,
            accountId: account.id,
            bizOrderId: o.bizOrderId,
            itemId: o.itemId,
            itemTitle: o.itemTitle,
            buyerNick,
            buyerId,
            amount: o.amount,
            orderCreatedAt: o.createTime
              ? new Date(o.createTime)
              : undefined,
          });
          if (created) {
            this.logger.log(
              `真实订单入库: ${o.bizOrderId} (${o.itemTitle})`,
            );
          }

          // 退款中的订单标记为 REFUNDING（被动感知，不丢弃）
          if (o.inRefund && order.status !== 'REFUNDED') {
            await this.ordersService.markRefunding(
              order.id,
              'mtop 检测到订单处于退款中',
            );
          }
        }
      } catch (err) {
        await handleAccountAuthError(
          this.accountsService,
          account.id,
          err,
        );
        this.logger.error(
          `账号 ${account.id} 拉单失败: ${(err as Error).message}`,
        );
      }
    }
  }

  private async generateMockOrder() {
    this.mockCounter++;
    const allAccounts = await this.getAllEnabledAccounts();
    if (allAccounts.length === 0) return;

    const account = allAccounts[this.mockCounter % allAccounts.length];
    const mockItems = [
      { itemId: 'mock_item_kami_001', title: 'Steam游戏CDK-赛博朋克2077' },
      { itemId: 'mock_item_link_001', title: 'PS5教程资料包-网盘链接' },
      { itemId: 'mock_item_text_001', title: 'ChatGPT Plus 合租账号' },
      { itemId: 'mock_item_license_001', title: 'Codex安装配置工具-激活码版' },
    ];
    const item = mockItems[this.mockCounter % mockItems.length];
    const mockBuyers = ['测试买家A', '虚拟用户B', '联调用户C'];
    const buyer = mockBuyers[this.mockCounter % mockBuyers.length];
    const bizOrderId = `MOCK_${Date.now()}_${this.mockCounter}`;

    await this.ordersService.createIfNotExists({
      tenantId: account.tenantId,
      accountId: account.id,
      bizOrderId,
      itemId: item.itemId,
      itemTitle: item.title,
      buyerNick: buyer,
      buyerId: `mock_buyer_${this.mockCounter}`,
      amount: Math.floor(Math.random() * 5000 + 100),
      orderCreatedAt: new Date(),
    });

    this.logger.log(`Mock 订单已生成: ${bizOrderId}`);
  }

  private async getAllEnabledAccounts() {
    return this.accountsService.listAllEnabled();
  }

  async triggerPoll() {
    await this.pollOrders();
  }
}
