import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AccountsService } from '../accounts/accounts.service';
import { OrdersService } from './orders.service';
import { OrderApi } from '../../xianyu/apis/order.api';
import { GoofishMtopService } from '../../goofish/goofish-mtop.service';
import { GOOFISH_UA } from '../../goofish/goofish.constants';
import { handleAccountAuthError } from '../accounts/account-auth.util';
import { globalRiskGuard, sleep, randomInt } from '../../common/utils/risk-control.util';

/**
 * 订单轮询 = 自动发货主建单路径。
 * 拉取待发货列表 → createIfNotExists(PENDING) → 调度器发货。
 * 不依赖 login.token / WS；WS 付款监听仅作加速。
 */
@Injectable()
export class OrderPollingService {
  private readonly logger = new Logger(OrderPollingService.name);
  private lastPollAt = 0;
  private mockCounter = 0;
  private polling = false;
  private loggedDisabled = false;

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

  /** mock 模式始终允许；真实模式看 ORDER_POLL_ENABLED */
  private get pollEnabled(): boolean {
    if (this.mockMode) return true;
    return this.config.get<boolean>('order.pollEnabled', false);
  }

  private get pollIntervalMs(): number {
    return this.config.get<number>('order.pollIntervalMs', 60_000);
  }

  @Interval(1000)
  async pollOrdersTick() {
    if (!this.pollEnabled) {
      if (!this.loggedDisabled) {
        this.loggedDisabled = true;
        this.logger.warn(
          '订单轮询已关闭（ORDER_POLL_ENABLED=false）。WS 不可用时将无法自动建单发货，建议保持开启',
        );
      }
      return;
    }
    const now = Date.now();
    if (now - this.lastPollAt < this.pollIntervalMs) return;
    if (this.polling) return;
    this.lastPollAt = now;
    this.polling = true;
    try {
      await this.pollOrders();
    } finally {
      this.polling = false;
    }
  }

  async pollOrders() {
    if (this.mockMode) {
      await this.generateMockOrder();
      return;
    }

    if (!this.pollEnabled) return;

    if (!this.useGoofish) {
      this.logger.warn('真实订单拉取需要 SIGN_PROVIDER=goofish，当前未启用');
      return;
    }

    const accounts = await this.getAllEnabledAccounts();
    for (let i = accounts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [accounts[i], accounts[j]] = [accounts[j], accounts[i]];
    }

    for (const account of accounts) {
      try {
        // 滑块仅短冷却，不长时间跳过拉单
        await globalRiskGuard.waitTurn(`poll:${account.id}`);
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

        for (const o of orders as any[]) {
          let buyerId = o.buyerId as string | undefined;
          let buyerNick = o.buyerNick as string | undefined;
          let quantity = 1;
          let specName: string | undefined;
          let specValue: string | undefined;
          let itemId = o.itemId as string;
          let itemTitle = o.itemTitle as string;

          if (!buyerId) {
            try {
              await globalRiskGuard.waitTurn(account.id);
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
              if (detail.quantity) quantity = detail.quantity;
              if (detail.specName) specName = detail.specName;
              if (detail.specValue) specValue = detail.specValue;
              if (detail.itemId) itemId = detail.itemId;
              if (detail.itemTitle) itemTitle = detail.itemTitle;
            } catch (e) {
              this.logger.warn(
                `订单 ${o.bizOrderId} 补详情失败: ${(e as Error).message}`,
              );
            }
          }

          if (!buyerId) {
            this.logger.warn(
              `订单 ${o.bizOrderId} 暂无 buyerId，仍入库，发货阶段将再尝试`,
            );
          }

          const createTime = o.createTime || o.orderCreatedAt;
          const { created, order } = await this.ordersService.createIfNotExists({
            tenantId: account.tenantId,
            accountId: account.id,
            bizOrderId: o.bizOrderId,
            itemId: itemId || 'unknown',
            itemTitle: itemTitle || '闲鱼商品',
            buyerNick,
            buyerId,
            amount: o.amount,
            quantity,
            specName,
            specValue,
            xyStatus: o.tradeStatus,
            orderCreatedAt: createTime ? new Date(createTime) : undefined,
          });
          if (created) {
            this.logger.log(
              `轮询建单: ${o.bizOrderId} (${itemTitle}) buyer=${buyerId || 'pending'} → 将自动发货`,
            );
          }

          if (o.inRefund && order.status !== 'REFUNDED') {
            await this.ordersService.markRefunding(
              order.id,
              'mtop 检测到订单处于退款中',
            );
          }
        }

        await sleep(randomInt(1500, 4000));
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
      quantity: 1,
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

  async refreshOrder(
    orderId: number,
    tenantId: number,
  ): Promise<{ success: boolean; message: string }> {
    const order = await this.ordersService.findByIdForTenant(orderId, tenantId);
    if (!order) return { success: false, message: '订单不存在' };

    const accounts = await this.accountsService.listEnabled(tenantId);
    const account = accounts.find((a) => a.id === order.accountId);
    if (!account) return { success: false, message: '账号不可用' };

    if (!this.useGoofish) {
      return { success: false, message: '仅 goofish 模式支持刷新' };
    }

    try {
      let cookie = this.accountsService.decryptCookie(account);
      await globalRiskGuard.waitTurn(account.id);
      const detail = await this.goofishMtop.fetchOrderDetail(
        cookie,
        order.bizOrderId,
      );
      if (detail.cookie !== cookie) {
        await this.accountsService.updateCookieIfChanged(account.id, detail.cookie);
      }

      const patch: Record<string, unknown> = {};
      if (detail.buyerId) patch.buyerId = detail.buyerId;
      if (detail.buyerNick) patch.buyerNick = detail.buyerNick;
      if (detail.itemId) patch.itemId = detail.itemId;
      if (detail.itemTitle) patch.itemTitle = detail.itemTitle;
      if (detail.amount != null) patch.amount = detail.amount;
      if (detail.quantity) patch.quantity = detail.quantity;
      if (detail.specName) patch.specName = detail.specName;
      if (detail.specValue) patch.specValue = detail.specValue;
      if (detail.receiverName) patch.receiverName = detail.receiverName;
      if (detail.receiverPhone) patch.receiverPhone = detail.receiverPhone;
      if (detail.receiverAddress) patch.receiverAddress = detail.receiverAddress;
      if (detail.xyStatus) patch.xyStatus = detail.xyStatus;

      await this.ordersService.patchOrderFields(order.id, patch as any);
      return { success: true, message: '订单详情已刷新' };
    } catch (e) {
      await handleAccountAuthError(this.accountsService, account.id, e);
      return { success: false, message: (e as Error).message };
    }
  }

  async refreshOrdersBatch(
    orderIds: number[],
    tenantId: number,
  ): Promise<{ total: number; ok: number; failed: number; errors: string[] }> {
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    const ids = orderIds.slice(0, 20);
    for (const id of ids) {
      const r = await this.refreshOrder(id, tenantId);
      if (r.success) ok++;
      else {
        failed++;
        errors.push(`#${id}: ${r.message}`);
      }
      await sleep(randomInt(800, 1500));
    }
    return { total: ids.length, ok, failed, errors };
  }
}
