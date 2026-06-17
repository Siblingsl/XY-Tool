import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoofishMtopService } from '../../goofish/goofish-mtop.service';
import { MtopClient } from '../mtop-client';
import { MtopRequestContext } from '../interfaces';

/** 订单列表中的单条订单 */
export interface XianyuOrder {
  bizOrderId: string;
  itemId: string;
  itemTitle: string;
  buyerNick?: string;
  buyerId?: string;
  amount?: number;
  tradeStatus?: string;
  createTime?: number;
}

@Injectable()
export class OrderApi {
  constructor(
    private readonly client: MtopClient,
    private readonly goofishMtop: GoofishMtopService,
    private readonly config: ConfigService,
  ) {}

  private get useGoofish(): boolean {
    return this.config.get<string>('sign.provider') === 'goofish';
  }

  /**
   * 拉取已售出（待发货）的订单列表。
   * goofish 模式使用 mtop.taobao.idle.trade.merchant.sold.get（来自 xianyu-auto-reply）。
   */
  async fetchSoldOrders(
    ctx: MtopRequestContext,
    pageNo = 1,
    size = 20,
  ): Promise<{ orders: XianyuOrder[]; hasNext: boolean; cookie?: string }> {
    if (this.useGoofish) {
      const { orders, hasNext, cookie } = await this.goofishMtop.fetchSoldOrders(
        ctx.cookie,
        pageNo,
        size,
        'NOT_SHIP',
      );
      return {
        orders: orders.map((o) => ({
          bizOrderId: o.bizOrderId,
          itemId: o.itemId,
          itemTitle: o.itemTitle,
          buyerNick: o.buyerNick,
          buyerId: o.buyerId,
          amount: o.amount,
          tradeStatus: o.tradeStatus,
          createTime: o.orderCreatedAt?.getTime(),
        })),
        hasNext,
        cookie,
      };
    }

    const data = await this.client.invoke<{
      resultList?: Array<Record<string, unknown>>;
      hasNext?: boolean;
    }>(
      'mtop.taobao.idle.trade.order.list',
      {
        pageNo: String(pageNo),
        pageSize: String(size),
        tradeStatus: 'TRADE_BUYER_PAY',
      },
      ctx,
      '1.0',
    );

    const orders: XianyuOrder[] = (data.resultList || []).map((raw) => ({
      bizOrderId: String(raw.bizOrderId ?? raw.orderId ?? ''),
      itemId: String(raw.itemId ?? ''),
      itemTitle: String(raw.itemTitle ?? raw.title ?? ''),
      buyerNick: raw.buyerNick ? String(raw.buyerNick) : undefined,
      buyerId: raw.buyerId ? String(raw.buyerId) : undefined,
      amount: raw.actualFee != null ? Number(raw.actualFee) : undefined,
      tradeStatus: raw.tradeStatus ? String(raw.tradeStatus) : undefined,
      createTime: raw.createTime ? Number(raw.createTime) : undefined,
    }));

    return { orders, hasNext: !!data.hasNext };
  }
}
